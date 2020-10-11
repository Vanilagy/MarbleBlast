type BestTimes = [string, number][];

const MAX_SCORE_TIME = (99 * 60 + 59) * 1000 + 999; // The 99:59.99 thing

interface StorageData {
	settings: {
		resolution: number,
		videoDriver: number,
		screenStyle: number,
		colorDepth: number,
		shadows: boolean,
		musicVolume: number,
		soundVolume: number,
		gameButtonMapping: {
			"up": string,
			"down": string,
			"left": string,
			"right": string,
			"jump": string,
			"use": string,
			"cameraUp": string,
			"cameraDown": string,
			"cameraLeft": string,
			"cameraRight": string,
			"freeLook": string
		},
		mouseSensitivity: number,
		invertYAxis: boolean,
		alwaysFreeLook: boolean
	},
	bestTimes: Record<string, BestTimes>,
	/** Stores the amount of unlocked levels per category of level (beginner, intermediate, advanced) */
	unlockedLevels: [number, number, number],
	/** Used for the name entry in the post-game screen. */
	lastUsedName: string,
	randomId: string
}

const DEFAULT_STORAGE_DATA: StorageData = {
	settings: {
		resolution: 2,
		videoDriver: 0,
		screenStyle: 0,
		colorDepth: 1,
		shadows: false,
		musicVolume: 0.5,
		soundVolume: 0.7,
		gameButtonMapping: {
			"up": "KeyW", // kekw
			"down": "KeyS",
			"left": "KeyA",
			"right": "KeyD",
			"jump": "Space",
			"use": "LMB",
			"cameraUp": "ArrowUp",
			"cameraDown": "ArrowDown",
			"cameraLeft": "ArrowLeft",
			"cameraRight": "ArrowRight",
			"freeLook": "RMB"
		},
		mouseSensitivity: 0.2,
		invertYAxis: false,
		alwaysFreeLook: false
	},
	bestTimes: {},
	unlockedLevels: [1, 1, 1],
	lastUsedName: '',
	randomId: Math.random().toString()
};

/** Manages storage and persistence. */
export abstract class StorageManager {
	static data: StorageData;

	static async init() {
		// Fetch the stored data froom localStorage
		let stored = localStorage.getItem('mb-storage');
		if (stored) {
			this.data = JSON.parse(stored);
		} else {
			this.data = DEFAULT_STORAGE_DATA;
		}

		if (!this.data.randomId) this.data.randomId = Math.random().toString();
	}

	static store() {
		localStorage.setItem('mb-storage', JSON.stringify(this.data));
	}

	/** Get the three best times for a mission path. */
	static getBestTimesForMission(path: string) {
		let result: BestTimes = [];
		let stored = this.data.bestTimes[path];
		if (stored) {
			result.push(...stored);
		}
		result.sort((a, b) => a[1] - b[1]); // Make sure they're in ascending order

		let remaining = 3 - result.length;
		for (let i = 0; i < remaining; i++) {
			// Fill the remaining slots with Nardo Polo scores
			result.push(["Nardo Polo", MAX_SCORE_TIME]);
		}

		return result;
	}

	/** Register a new time for a mission. */
	static insertNewTime(path: string, name: string, time: number) {
		let stored = this.data.bestTimes[path] ?? [];

		// Determine the correct index to insert the time at
		let index: number;
		for (index = 0; index < stored.length; index++) {
			if (stored[index][1] > time) break;
		}
		stored.splice(index, 0, [name, time]);

		// Shorten the array if needed
		if (stored.length > 3) stored = stored.slice(0, 3);
		this.data.bestTimes[path] = stored;

		this.store();
	}
}