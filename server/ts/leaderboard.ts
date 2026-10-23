import * as http from 'http';
import { promisify } from 'util';
import * as zlib from 'zlib';
import * as url from 'url';

import { shared } from './shared';
import { compareSemver, escapeCsv, escapeDiscord, secondsToTimeString, uppercaseFirstLetter } from './util';

const MAX_INFLATED_SCORES_SIZE = 16 * 1024 * 1024; // In bytes
const MAX_MISSIONS_PER_LEADERBOARD_REQUEST = 50;
const MAX_REPLAY_SIZE = 50 * 1024 * 1024; // In bytes

interface ScoreRow {
	rowid?: number,
	mission?: string,
	time?: number,
	username?: string,
	user_random_id?: string,
	timestamp?: number,
	has_wrec?: number,
	mission_version?: number
}

interface CacheEntry {
	data: [string, number, boolean][];
	lastUsed: number;
	scoreCount: number;
}

class LeaderboardCache {
	cache = new Map<string, CacheEntry>();
	totalScores = 0;
	readonly maxScores = 1_000_000;

	get(mission: string) {
		const entry = this.cache.get(mission);
		if (!entry) return null;

		entry.lastUsed = Date.now();
		return entry.data;
	}

	set(mission: string, data: [string, number, boolean][]) {
		const scoreCount = data.length;

		// Remove existing entry if it exists
		this.evict(mission);

		// Add new entry
		this.cache.set(mission, {
			data,
			lastUsed: Date.now(),
			scoreCount
		});
		this.totalScores += scoreCount;

		// Evict oldest entries if over limit
		while (this.totalScores > this.maxScores && this.cache.size > 1) {
			this.evictOldest();
		}
	}

	evict(mission: string) {
		const entry = this.cache.get(mission);
		if (entry) {
			this.cache.delete(mission);
			this.totalScores -= entry.scoreCount;
		}
	}

	evictOldest() {
		let oldestMission: string | null = null;
		let oldestTime = Infinity;

		for (const [mission, entry] of this.cache) {
			if (entry.lastUsed < oldestTime) {
				oldestTime = entry.lastUsed;
				oldestMission = mission;
			}
		}

		if (oldestMission) {
			this.evict(oldestMission);
		}
	}
}

const leaderboardCache = new LeaderboardCache();

/** Transmits all the scores for the missions specified in the body payload. */
export const getLeaderboard = async (res: http.ServerResponse, body: string) => {
	if (!body) throw new Error("Missing body.");

	let options: {
		missions: string[]
	} = JSON.parse(body);
	if (options.missions.length > MAX_MISSIONS_PER_LEADERBOARD_REQUEST) throw new Error("Too many missions requested.");

	let response: Record<string, [string, number, boolean][]> = {};

	let isFirst = true;
	for (let mission of options.missions) {
		if (!isFirst) {
			// Do a little pause between queries to give other requests some time as well
			await new Promise(resolve => setTimeout(resolve));
		}

		// Check cache first
		let cachedData = leaderboardCache.get(mission);
		if (cachedData) {
			response[mission] = cachedData;
		} else if (!missionExists(mission)) {
			response[mission] = [];
		} else {
			// Query database and cache result
			let rows = shared.getLeaderboardForMissionStatement.all(mission) as ScoreRow[];
			let data: [string, number, boolean][] = rows.map(x => [x.username.slice(0, 16), x.time, !!x.has_wrec]);
			response[mission] = data;
			leaderboardCache.set(mission, data);
		}

		isFirst = false;
	}

	let stringified = JSON.stringify(response);
	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(stringified),
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(stringified);
};

/** Transmits all the scores for the Marbleland mission specified by the ID in the correct format as expected by Marbleland leaderboards integration */
export const getLeaderboardForMarbleland = async (res: http.ServerResponse, url: url.URL) => {
	const missionId = url.searchParams.get('id');

	if (!missionId || !Number.isInteger(Number(missionId))) throw new Error("Missing id.");

	let rows: ScoreRow[] = [];

	let customLevelInfo = shared.customLevelList.find(x => x.id === Number(missionId));
	if (customLevelInfo) {
		rows = shared.getLeaderboardForMissionStatement.all(getCustomLevelMissionPath(customLevelInfo)) as ScoreRow[];
	}

	let response = {
		scores: rows.map((x, i) => {
			return {
				placement: i + 1,
				username: x.username.slice(0, 16),
				score: x.time,
				score_type: 'time' // No PQ/Hunt in Webport
			};
		})
	};

	let stringified = JSON.stringify(response);
	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(stringified),
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(stringified);
};

/** Submits new scores to the leaderboard. */
export const submitScores = async (res: http.ServerResponse, body: string) => {
	if (!body) throw new Error("Missing body.");

	let timestamp = Date.now();
	let data: {
		randomId: string,
		scores: string, // String, because it's compressed and encoded
		latestTimestamp: number,
		replays: Record<string, string>,
		version: string
	} = JSON.parse(body);

	if (compareSemver(data.version, '2.6.14') < 0) {
		// April Fools' 2025 check, so nobody accidentally submits "cheated" scores
		res.writeHead(400);
		res.end();
		return;
	}

	// Unpack best times
	let bestTimes: {
		id: string,
		missionPath: string,
		score: [string, number],
		missionVersion?: number
	}[] = data.scores? JSON.parse((await promisify(zlib.inflate)(Buffer.from(data.scores, 'base64'), { maxOutputLength: MAX_INFLATED_SCORES_SIZE })).toString()) : [];

	let promises: Promise<void>[] = [];
	let broadcasts: (() => void)[] = [];

	// All or nothing, as the client resubmits the whole batch after a failure, which would duplicate the scores inserted so far
	shared.db.exec('BEGIN;');
	try {
		// Loop over all new scores
		for (let { missionPath, score, id, missionVersion } of bestTimes) {
			// Skip instead of rejecting the whole request, as the client would otherwise resubmit the same batch forever
			if (!missionExists(missionPath)) continue;

			score[0] = score[0].slice(0, 16); // Fuck you
			let oldTopScore = shared.getTopScoreStatement.get(missionPath) as ScoreRow;
			let isTopScore = !oldTopScore || oldTopScore.time > score[1];

			if (isTopScore && !data.replays[id]) continue; // Top scores NEED a replay

			let wrecBuffer: Buffer = null;
			if (data.replays[id]) {
				wrecBuffer = Buffer.from(data.replays[id], 'base64');
				if (wrecBuffer.length > MAX_REPLAY_SIZE) continue; // Skipped, just like scores for unknown missions
			}

			shared.insertScoreStatement.run(missionPath, score[1], score[0], data.randomId, timestamp, wrecBuffer, Number.isInteger(missionVersion)? missionVersion : 1);

			// Invalidate cache for this mission since we added a new score
			leaderboardCache.evict(missionPath);

			if (isTopScore) {
				if (shared.config.discordWebhookUrl) {
					// Broadcast a world record message to the webhook URL
					let url = shared.config.discordWebhookUrl;
					let allowed = true;
					if (missionPath.includes('custom/')) {
						if (shared.config.discordWebhookUrlCustom)
							url = shared.config.discordWebhookUrlCustom;
						let scoreCount = shared.getLeaderboardForMissionStatement.all(missionPath).length;
						if (scoreCount < shared.config.webhookCustomMinScoreThreshold) {
							allowed = false; // Not enough scores yet, don't broadcast
						}
					}

					if (allowed) broadcasts.push(() => broadcastToWebhook(url, missionPath, score, data.randomId, oldTopScore));
				}
			}
		}

		shared.db.exec('COMMIT;');
	} catch (e) {
		shared.db.exec('ROLLBACK;');
		throw e;
	}

	for (let broadcast of broadcasts) broadcast();

	await Promise.all(promises);

	sendNewScores(res, data.latestTimestamp);
};

/** Broadcasts a new #1 score to a Discord webhook as a world record message. */
const broadcastToWebhook = (url: string, missionPath: string, score: [string, number], userRandomId: string, previousRecord?: ScoreRow) => {
	let missionName = escapeDiscord(getMissionNameFromMissionPath(missionPath)).trim();
	let timeString = secondsToTimeString(score[1] / 1000);
	let modification = missionPath.startsWith('mbp')? 'platinum': missionPath.startsWith('mbu')? 'ultra' : 'gold';
	if (modification !== 'gold') missionPath = missionPath.slice(4);
	let category = uppercaseFirstLetter(missionPath.slice(0, missionPath.indexOf('/')));

	let message = `**${escapeDiscord(score[0])}** has just achieved a world record on **${missionName}** (Web ${uppercaseFirstLetter(modification)} ${category}) of **${timeString}**`;

	// Add absolute and relative improvement data to the message in case this score improves an old one
	if (previousRecord) {
		let diff = previousRecord.time - score[1];
		let diffString: string;

		// Choose the unit based on the magnitude
		if (diff >= 1000) {
			diffString = (diff / 1000).toFixed(3) + ' s';
		} else if (diff >= 1) {
			diffString = diff.toPrecision(3) + ' ms';
		} else if (diff >= 1e-3) {
			diffString = (diff * 1e3).toPrecision(3) + ' μs';
		} else if (diff >= 1e-6) {
			// Nanosecond accuracy is more a meme, in no way do the phyics justify time differences this precise
			diffString = Math.floor(diff * 1e6) + ' ns';
		} else {
			diffString = '<1 ns';
		}

		let relativeDiffString = (((1 -  score[1] / previousRecord.time) || 0) * 100).toPrecision(3) + '%'; // Make sure to catch NaN just in case

		let isSamePlayer = previousRecord.username === score[0] || userRandomId === previousRecord.user_random_id;
		if (isSamePlayer) {
			message += `, improving their own record by `;
		} else {
			message += `, beating **${escapeDiscord(previousRecord.username)}** by `;
		}

		message += `_${diffString} (${relativeDiffString})_`;
	}

	fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			content: message,
			allowed_mentions: { parse: [] }
		})
	}).catch(e => console.error("Error broadcasting to webhook.", e));
};

/** Gets the mission name from a given mission path. */
const getMissionNameFromMissionPath = (missionPath: string) => {
	if (missionPath.includes('custom/')) {
		// Find the corresponding CLA entry
		let claEntry = shared.customLevelList.find(x => x.id === Number(missionPath.slice(missionPath.lastIndexOf('/') + 1)));
		return claEntry.name;
	} else {
		return shared.levelNameMap[missionPath];
	}
};

/** Transmits a score delta, so all new scores since a given timestamp. */
const sendNewScores = (res: http.ServerResponse, timestamp: number) => {
	let result: Record<string, [string, number, boolean][]> = {};

	if (timestamp || timestamp === 0) {
		// Send all new scores since that that last timestamp; let the client insert them at the right spot
		let newScores = shared.getNewerTopScoresStatement.all(timestamp) as ScoreRow[];
		for (let score of newScores) {
			if (!result[score.mission]) result[score.mission] = [];
			result[score.mission].push([score.username.slice(0, 16), score.time, !!score.has_wrec]);
		}
	}

	// Also get the timestamp of the score with the highest timestamp
	let latestTimestamp = shared.getLatestTimestampStatement.get().latest_timestamp as number;
	if (!latestTimestamp) latestTimestamp = 0;

	let stringified = JSON.stringify({
		latestTimestamp: latestTimestamp,
		scores: result
	});
	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(stringified),
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(stringified);
};

/** Creates a sheet of default-level world records in CSV format for use in spreadsheets. */
export const getWorldRecordSheet = async (res: http.ServerResponse) => {
	let lastCategory: string = null;
	let output = "";

	for (let missionPath in shared.levelNameMap) {
		let category = uppercaseFirstLetter(missionPath.split('/')[0]);
		if (category === 'Mbp') category = 'Platinum ' + uppercaseFirstLetter(missionPath.split('/')[1]);
		else if (category === 'Mbu') category = 'Ultra ' + uppercaseFirstLetter(missionPath.split('/')[1]);
		else category = 'Gold ' + category;

		if (category !== lastCategory) {
			// Add a header row if the category changes
			output += category + '\n';
			if (!lastCategory) output += "Level,Time,Runner,.wrec submitted?\n";

			lastCategory = category;
		}

		// Get the top score for this mission
		let topScore = shared.getTopScoreStatement.get(missionPath) as ScoreRow;
		if (!topScore) topScore = {
			time: 99 * 60 * 1000 + 59 * 1000 + 999,
			username: 'Nardo Polo'
		};

		let wrecExists = true; // We've improved :)

		// Add row
		output += `${escapeCsv(shared.levelNameMap[missionPath])},${topScore.time},${escapeCsv(topScore.username.slice(0, 16))},${wrecExists? 'Yes' : 'No'}\n`;
	}

	res.writeHead(200, {
		'Content-Type': 'text/plain; charset=utf-8',
		'Content-Length': Buffer.byteLength(output),
		'Cache-Control': 'no-cache, no-store'
	});
	res.end(output);
};

/** Gets the stored .wrec for the best score on a given level. */
export const getWorldRecordReplay = async (res: http.ServerResponse, urlObject: url.URL) => {
	let missionPath = urlObject.searchParams.get('missionPath');
	if (!missionExists(missionPath)) {
		res.writeHead(400);
		res.end();
		return;
	}

	let row = shared.getTopScoreWrecStatement.get(missionPath) as { wrec: Uint8Array };
	if (!row) {
		res.writeHead(400);
		res.end('400');
		return;
	}

	let buffer = row.wrec;

	res.writeHead(200, {
		'Content-Type': 'application/octet-stream',
		'Content-Length': buffer.byteLength,
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(buffer);
};

/** Checks if a mission path belongs to a default level or a custom level from the archive. */
const missionExists = (missionPath: string) => {
	if (!missionPath.includes('custom/')) return Object.hasOwn(shared.levelNameMap, missionPath);

	let claEntry = shared.customLevelList.find(x => x.id === Number(missionPath.slice(missionPath.lastIndexOf('/') + 1)));
	return !!claEntry && getCustomLevelMissionPath(claEntry) === missionPath;
};

const getCustomLevelMissionPath = (customLevelInfo: typeof shared.customLevelList[number]) => {
	let missionPath = `custom/${customLevelInfo.id}`;
	if (customLevelInfo.modification === 'platinum') {
		missionPath = 'mbp/' + missionPath;
	} else if (customLevelInfo.modification === 'ultra') {
		missionPath = 'mbu/' + missionPath;
	}

	return missionPath;
};