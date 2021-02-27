import * as http from 'http';
import { promisify } from 'util';
import * as zlib from 'zlib';
import * as fs from 'fs-extra';
import * as path from 'path';
import fetch from 'node-fetch';

import { shared } from './shared';
import { escapeDiscord, secondsToTimeString, uppercaseFirstLetter } from './util';

interface ScoreRow {
	rowid?: number,
	mission?: string,
	time?: number,
	username?: string,
	user_random_id?: string,
	timestamp?: number
}

/** Transmits all the scores for the missions specified in the body payload. */
export const getLeaderboard = async (res: http.ServerResponse, body: string) => {
	if (!body) throw new Error("Missing body.");

	let options: {
		missions: string[]
	} = JSON.parse(body);

	let response: Record<string, [string, number][]> = {};

	for (let mission of options.missions) {
		let rows: ScoreRow[] = shared.getScoresForMissionStatement.all(mission);
		response[mission] = rows.map(x => [x.username, x.time]);
	}

	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(JSON.stringify(response));
};

/** Submits new scores to the leaderboard. */
export const submitScores = async (res: http.ServerResponse, body: string) => {
	if (!body) throw new Error("Missing body.");

	let timestamp = Date.now();
	let data: {
		randomId: string,
		bestTimes: string, // String, because it's compressed and encoded
		latestTimestamp: number
		replays: Record<string, string>
	} = JSON.parse(body);

	// Unpack best times
	let bestTimes: Record<string, [string, number]> = data.bestTimes? JSON.parse((await promisify(zlib.inflate)(Buffer.from(data.bestTimes, 'base64'))).toString()) : {};
	let promises: Promise<void>[] = [];

	// Loop over all new scores
	for (let missionPath in bestTimes) {
		let score = bestTimes[missionPath];
		let row: ScoreRow = shared.getScoreByUserStatement.get(missionPath, score[0], data.randomId); // See if a score by this player already exists on this mission
		let inserted = false;
		
		if (row) {
			if (row.time > score[1]) {
				// If the new score is faster, override the old one, otherwise do nothing
				shared.updateScoreStatement.run(score[1], score[0], data.randomId, timestamp, row.rowid);
				inserted = true;
			}	
		} else {
			// Add the new score to the leaderboard
			shared.insertScoreStatement.run(missionPath, score[1], score[0], data.randomId, timestamp);	
			inserted = true;
		}

		if (inserted) {
			// See if this score is now the top #1 score for this mission
			let topScore: ScoreRow = shared.getTopScoreStatement.get(missionPath);
			if (topScore.username !== score[0] || topScore.time !== score[1]) continue;

			if (data.replays[missionPath]) {
				// If a replay was sent, store it
				let replayBuffer = Buffer.from(data.replays[missionPath], 'base64');
				promises.push(fs.writeFile(path.join(__dirname, 'storage', 'wrecs', missionPath.replace(/\//g, '_') + '.wrec'), replayBuffer));
			}
			
			if (shared.config.discordWebhookUrl) {
				// Broadcast a world record message to the webhook URL
				let allowed = true;
				if (missionPath.startsWith('custom')) {
					let scoreCount: number = shared.getMissionScoreCount.pluck().get(missionPath);
					if (scoreCount < shared.config.webhookCustomMinScoreThreshold) allowed = false; // Not enough scores yet, don't broadcast
				}

				if (allowed) broadcastToWebhook(missionPath, score);
			}
		}
	}

	await Promise.all(promises);

	sendNewScores(res, data.latestTimestamp);
};

/** Broadcasts a new #1 score to a Discord webhook as a world record message. */
const broadcastToWebhook = (missionPath: string, score: [string, number]) => {
	let missionName = escapeDiscord(getMissionNameFromMissionPath(missionPath));
	let timeString = secondsToTimeString(score[1] / 1000);
	let category = uppercaseFirstLetter(missionPath.slice(0, missionPath.indexOf('/')));
	let message = `${escapeDiscord(score[0])} has just achieved a world record on "${missionName}" (Web ${category}) of ${timeString}`;

	fetch(shared.config.discordWebhookUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			content: message
		})
	});
};

/** Gets the mission name from a given mission path. */
const getMissionNameFromMissionPath = (missionPath: string) => {
	if (missionPath.startsWith('custom')) {
		// Find the corresponding CLA entry
		let claEntry = shared.claList.find(x => x.id === Number(missionPath.slice(7)));
		return claEntry.name;
	} else {
		return shared.levelNameMap[missionPath];
	}
};

/** Transmits a score delta, so all new scores since a given timestamp. */
const sendNewScores = (res: http.ServerResponse, timestamp: number) => {
	let result: Record<string, [string, number][]> = {};

	if (timestamp || timestamp === 0) {
		let newScores: ScoreRow[] = shared.getNewerScoresStatement.all(timestamp);
		let includedMissions = new Set<string>();

		for (let row of newScores) {
			if (includedMissions.has(row.mission)) continue;
	
			// Send over the entire leaderboard for a mission if one score in it changed
			let rows: ScoreRow[] = shared.getScoresForMissionStatement.all(row.mission);
			result[row.mission] = rows.map(x => [x.username, x.time]);
		}
	}

	// Also get the timestamp of the score with the highest timestamp
	let latestTimestamp: number = shared.getLatestTimestampStatement.pluck().get();
	if (!latestTimestamp) latestTimestamp = 0;

	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(JSON.stringify({
		latestTimestamp: latestTimestamp,
		scores: result
	}));
};

/** Creates a sheet of default-level world records in CSV format for use in spreadsheets. */
export const getWorldRecordSheet = async (res: http.ServerResponse) => {
	let lastCategory: string = null;
	let output = "";

	for (let missionPath in shared.levelNameMap) {
		let category = uppercaseFirstLetter(missionPath.split('/')[0]);

		if (category !== lastCategory) {
			// Add a header row if the category changes
			output += category + '\n';
			if (!lastCategory) output += "Level,Time,Runner,.wrec submitted?\n";

			lastCategory = category;
		}

		// Get the top score for this mission
		let topScore: ScoreRow = shared.getTopScoreStatement.get(missionPath);
		if (!topScore) topScore = {
			time: 99 * 60 * 1000 + 59 * 1000 + 999,
			username: 'Nardo Polo'
		};

		// Check if a .wrec for this mission exists
		let wrecPath = path.join(__dirname, 'storage', 'wrecs', missionPath.replace(/\//g, '_') + '.wrec');
		let wrecExists = await fs.pathExists(wrecPath);

		// Add row
		output += `${shared.levelNameMap[missionPath]},${topScore.time},${topScore.username},${wrecExists? 'Yes' : 'No'}\n`;
	}

	res.writeHead(200, {
		'Content-Type': 'text/plain; charset=utf-8',
		'Cache-Control': 'no-cache, no-store'
	});
	res.end(output);
};