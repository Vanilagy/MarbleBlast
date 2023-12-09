import { ResourceManager } from "./resources";
import { state } from "./state";
import { BestTimes, StorageManager } from "./storage";
import { Util } from "./util";
import { executeOnWorker } from "./worker";

/** Stores and handles operations on the online leaderboard. */
export abstract class Leaderboard {
	/** The scores for each mission. */
	static scores = new Map<string, [username: string, time: number, hasWrec: boolean][]>();
	/** Whether a mission's scores are currently loading. */
	static loading = new Set<string>();
	/** The latest score timestamp received from the user. Will be used to get any scores newer than this. */
	static latestTimestamp: number = null;

	static async init() {
		// The first time we do this, the main purpose is to update the value of `latestTimestamp`.
		await this.syncLeaderboard();
	}

	/** Loads the scores of all missions in the vicinity of the current mission. */
	static loadLocal() {
		let missionPaths = new Set<string>();
		let currentLevelArray = state.menu.levelSelect.sortedMissionArray;

		for (let i = -5; i <= 5; i++) {
			let index = state.menu.levelSelect.getCycleMissionIndex(i);
			let mission = currentLevelArray[index];
			if (mission) missionPaths.add(mission.path);
		}

		for (let mission of state.menu.levelSelect.getNextShuffledMissions()) missionPaths.add(mission.path);

		this.loadForMissions([...missionPaths]);
	}

	/** Loads all scores for the given missions. */
	static async loadForMissions(missionPaths: string[]) {
		missionPaths = missionPaths.filter(x => !this.loading.has(x) && !this.scores.has(x)); // Filter out loaded or loading missions
		if (missionPaths.length === 0) return;

		missionPaths.forEach(x => this.loading.add(x));
		this.registerLeaderboardChange(missionPaths);

		// Get all the scores
		let blob = await ResourceManager.retryFetch('./api/scores', {
			method: 'POST',
			body: JSON.stringify({
				missions: missionPaths
			})
		});
		let data: Record<string, [string, number, boolean][]> = await ResourceManager.readBlobAsJson(blob);

		for (let missionPath in data) {
			// Update the scores
			this.scores.set(missionPath, data[missionPath]);
			this.loading.delete(missionPath);
		}

		this.registerLeaderboardChange(missionPaths);
	}

	static isLoading(missionPath: string) {
		return this.loading.has(missionPath);
	}

	/** Submits a new score to the leaderboard. */
	static async submitScore(missionPath: string, score: BestTimes[number]) {
		StorageManager.data.bestTimeSubmissionQueue.push({
			missionPath,
			score
		});
		StorageManager.store();

		this.syncLeaderboard();
	}

	/** Synchronizes the leaderboard: Uploads new personal best times and gets all new/changed online scores and updates the leaderboard accordingly. */
	static async syncLeaderboard() {
		let queue = StorageManager.data.bestTimeSubmissionQueue;
		let payloadScores: {
			id: string,
			missionPath: string,
			score: [string, number]
		}[] = [];
		let payloadReplays: Record<string, string> = {};

		// Go over all scores in the submission queue
		for (let { missionPath, score } of queue) {
			let payloadScore = {
				id: score[2],
				missionPath,
				score: [score[0], score[1]] as [string, number]
			};
			payloadScores.push(payloadScore);

			let onlineScore = this.scores.get(missionPath)?.[0];
			if (!onlineScore || score[1] < onlineScore[1]) {
				// This score is better than the top online score, therefore assume this is a new world record and prepare the replay for upload.
				let replayData = await StorageManager.databaseGet('replays', score[2]) as ArrayBuffer;
				if (!replayData) continue;

				// Convert to base64 because we can't ship binary data over JSON
				let base64 = await Util.arrayBufferToBase64(replayData);
				payloadReplays[payloadScore.id] = base64;
			}
		}

		let payload = {
			randomId: StorageManager.data.randomId,
			scores: Object.keys(queue).length? await Util.arrayBufferToBase64(await executeOnWorker('compress', JSON.stringify(payloadScores))) : null, // Compress and encode the best times a bit
			latestTimestamp: this.latestTimestamp,
			replays: payloadReplays,
			version: StorageManager.data.lastSeenVersion
		};

		let blob = await ResourceManager.retryFetch('./api/submit', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		let data: {
			latestTimestamp: number,
			scores: Record<string, [string, number, boolean][]>
		} = await ResourceManager.readBlobAsJson(blob);

		this.latestTimestamp = data.latestTimestamp;

		// Update the leaderboard with the new scores
		for (let missionPath in data.scores) {
			if (!this.scores.has(missionPath)) continue;

			let storedScores = this.scores.get(missionPath);
			let newScores = data.scores[missionPath];

			storedScores = storedScores.filter(x => !newScores.some(y => y[0] === x[0])); // Remove old scores with same usernames
			storedScores.push(...newScores);
			storedScores.sort((a, b) => a[1] - b[1]); // Sort by time

			this.scores.set(missionPath, storedScores);
		}

		this.registerLeaderboardChange(Object.keys(data.scores));

		// Since a response arrived, empty the queue
		StorageManager.data.bestTimeSubmissionQueue = [];
		StorageManager.store();
	}

	/** Communicates that the given missions' leaderboards have changed somehow. Causes a visual update to the leaderboard if the missions are currently being viewed. */
	static registerLeaderboardChange(changedMissions: string[]) {
		let localScoreRemoved = false;
		let submissionQueue = StorageManager.data.bestTimeSubmissionQueue;

		for (let missionPath of changedMissions) {
			let onlineScores = this.scores.get(missionPath);
			let localScore = StorageManager.data.bestTimes[missionPath]?.[0];

			if (!onlineScores || !localScore || submissionQueue.some(x => x.missionPath === missionPath)) {
				continue;
			}

			let onlineScore = onlineScores[0];

			// Splice all submitted local scores that are faster than the current WR for that level. We do this because the existence of those scores makes no sense (they can happen when the leaderboard is purged server-side)
			while (localScore && (!onlineScore || localScore[1] < Number(onlineScore[1]))) {
				StorageManager.data.bestTimes[missionPath].splice(0, 1);
				localScore = StorageManager.data.bestTimes[missionPath][0];
				localScoreRemoved = true;
			}

			if (StorageManager.data.bestTimes[missionPath].length === 0) delete StorageManager.data.bestTimes[missionPath];
		}
		if (localScoreRemoved) StorageManager.storeBestTimes();

		// Maybe redraw the leaderboard
		let currentMission = state.menu.levelSelect.currentMission;
		if (changedMissions.includes(currentMission?.path)) state.menu.levelSelect.displayBestTimes();
	}
}