type BestTimes = [string, number][];

const MAX_SCORE_TIME = (99 * 60 + 59 + 0.99) * 1000; // The 99:59.99 thing

export abstract class StorageManager {
	static async init() {

	}

	static getBestTimesForMission(path: string) {
		let result: BestTimes = [];

		let remaining = 3 - result.length;
		for (let i = 0; i < remaining; i++) {
			result.push(["Nardo Polo", MAX_SCORE_TIME]);
		}

		return result;
	}
}