type BestTimes = [string, number][];

const MAX_SCORE_TIME = (99 * 60 + 59 + 0.99) * 1000; // The 99:59.99 thing

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
	unlockedLevels: [number, number, number],
	lastUsedName: string
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
	lastUsedName: ''
};

export abstract class StorageManager {
	static data: StorageData;

	static async init() {
		let stored = localStorage.getItem('mb-storage');
		if (stored) {
			this.data = JSON.parse(stored);
		} else {
			this.data = DEFAULT_STORAGE_DATA;
		}
	}

	static store() {
		localStorage.setItem('mb-storage', JSON.stringify(this.data));
	}

	static getBestTimesForMission(path: string) {
		let result: BestTimes = [];
		let stored = this.data.bestTimes[path];
		if (stored) {
			result.push(...stored);
		}
		result.sort((a, b) => a[1] - b[1]);

		let remaining = 3 - result.length;
		for (let i = 0; i < remaining; i++) {
			result.push(["Nardo Polo", MAX_SCORE_TIME]);
		}

		return result;
	}

	static insertNewTime(path: string, name: string, time: number) {
		let stored = this.data.bestTimes[path] ?? [];

		let index: number;
		for (index = 0; index < stored.length; index++) {
			if (stored[index][1] > time) break;
		}
		stored.splice(index, 0, [name, time]);

		if (stored.length > 3) stored = stored.slice(0, 3);
		this.data.bestTimes[path] = stored;

		this.store();
	}
}