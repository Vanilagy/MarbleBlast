import { Util } from "./util";
import { executeOnWorker } from "./worker";

/** name, time, scoreId, timestamp */
export type BestTimes = [string, number, string, number][];

const MAX_SCORE_TIME = (99 * 60 + 59) * 1000 + 999.99; // The 99:59.999 thing

export interface StorageData {
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
			"freeLook": string,
			"restart": string
		},
		mouseSensitivity: number,
		keyboardSensitivity: number,
		invertMouse: number,
		alwaysFreeLook: boolean,
		reflectiveMarble: boolean,
		showFrameRate: boolean,
		showThousandths: boolean
	},
	bestTimes: Record<string, BestTimes>,
	/** Used for the name entry in the post-game screen. */
	lastUsedName: string,
	/** A random ID to somewhat uniquely identify this user, even if they change their username. */
	randomId: string,
	/** The queue of scores that are still to be sent to the server. */
	bestTimeSubmissionQueue: Record<string, BestTimes[number]>,
	/** The last-seen version of the game. */
	lastSeenVersion: string,
	/** Mission paths whose eggs have been collected. */
	collectedEggs: string[],
	/** Which modification was last used. */
	modification: 'gold' | 'platinum'
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
			"freeLook": "RMB",
			"restart": "KeyR"
		},
		mouseSensitivity: 0.2,
		keyboardSensitivity: 0.1,
		invertMouse: 0,
		alwaysFreeLook: true,
		reflectiveMarble: false,
		showFrameRate: false,
		showThousandths: true
	},
	bestTimes: {},
	lastUsedName: '',
	randomId: Util.getRandomId(),
	bestTimeSubmissionQueue: {},
	lastSeenVersion: null,
	collectedEggs: [],
	modification: 'platinum'
};

/** Manages storage and persistence. */
export abstract class StorageManager {
	static data: StorageData;
	static idbDatabase: Promise<IDBDatabase>;

	static async init() {
		// Setup the IndexedDB
		this.idbDatabase = new Promise((resolve) => {
			let request = indexedDB.open("mb-database", 3);
			request.onsuccess = (e) => {
				resolve((e.target as any).result);
			};

			request.onupgradeneeded = (e) => {
				let db = (e.target as any).result as IDBDatabase;
				let transaction = (e.target as any).transaction as IDBTransaction;

				let objectStore: IDBObjectStore;

				// For storing replays
				try {
					objectStore = db.createObjectStore('replays', {});
				} catch (error) {
					objectStore = transaction.objectStore('replays');
				}

				// A simple key-value store
				try {
					objectStore = db.createObjectStore('keyvalue', {});
				} catch (error) {
					objectStore = transaction.objectStore('keyvalue');
				}
			};
		});

		// Old storage format detected, let's migrate it
		if (localStorage.getItem('mb-storage')) await this.migrate();

		// Get the storage data
		let storageData = await this.databaseGet('keyvalue', 'storageData');
		if (storageData) {
			// Correct fields incase the stored data is stale / from an older version
			this.data = this.correctFields(DEFAULT_STORAGE_DATA, storageData);
		} else {
			this.data = DEFAULT_STORAGE_DATA;
		}

		// Get the best times and uncompress them
		this.data.bestTimes = {};
		let compressedBestTimes = await this.databaseGet('keyvalue', 'bestTimes');
		if (compressedBestTimes) {
			try {
				let uncompressed = pako.inflate(compressedBestTimes, { to: 'string' });
				let json = JSON.parse(uncompressed);
				this.data.bestTimes = json;
			} catch (e) {
				console.error("Error decoding best times!", e);
			}
		}
	}

	/** Migrates from localStorage to IndexedDB. */
	static async migrate() {
		let stored = JSON.parse(localStorage.getItem('mb-storage')) as StorageData;
		this.data = stored;

		for (let key in stored.bestTimes) {
			for (let bestTime of stored.bestTimes[key]) {
				bestTime[3] = 0; // Set timestamp to 0, indicating that this score shouldn't be uploaded to the leaderboards.
			}
		}

		await this.store();
		await this.storeBestTimes();

		localStorage.removeItem('mb-storage');
	}

	static async store() {
		let obj = Util.shallowClone(this.data);
		delete obj.bestTimes;

		await this.databasePut('keyvalue', obj, 'storageData');
	}
	
	static async storeBestTimes() {
		let string = JSON.stringify(this.data.bestTimes);
		let compressed = await executeOnWorker('compress', string) as string; // Compress the best times to make them take up less space and harder to modify from the outside.

		await this.databasePut('keyvalue', compressed, 'bestTimes');
	}

	/** Get the three best times for a mission path. */
	static getBestTimesForMission(path: string, count: number, placeholderName: string) {
		let result: BestTimes = [];
		let stored = this.data.bestTimes[path];
		if (stored) {
			result.push(...stored);
		}
		result.sort((a, b) => a[1] - b[1]); // Make sure they're in ascending order

		let remaining = count - result.length;
		for (let i = 0; i < remaining; i++) {
			// Fill the remaining slots with Nardo Polo scores
			result.push([placeholderName, MAX_SCORE_TIME, "", 0]);
		}

		return result;
	}

	static maxScoresPerLevel = 5;
	/** Register a new time for a mission.
	 * @returns The inserted score and the index at which at was inserted. Returns null, if the score wasn't inserted (so, not in the top maxScoresPerLevel best times).
	 */
	static insertNewTime(path: string, name: string, time: number) {
		let stored = this.data.bestTimes[path] ?? [];
		let scoreId = Util.getRandomId();
		let toInsert: BestTimes[number] = [name, time, scoreId, Date.now()];

		// Determine the correct index to insert the time at
		let index: number;
		for (index = 0; index < stored.length; index++) {
			if (stored[index][1] > time) break;
		}
		stored.splice(index, 0, toInsert);

		// Shorten the array if needed
		if (stored.length > this.maxScoresPerLevel) {
			let lost = stored[this.maxScoresPerLevel];
			stored = stored.slice(0, this.maxScoresPerLevel);

			if (lost[2]) {
				this.databaseGet('replays', lost[2]).then(replayData => {
					if (!replayData) return;
					this.databaseDelete('replays', lost[2]); // Delete the replay
				});
			}
		}
		this.data.bestTimes[path] = stored;

		this.storeBestTimes();

		if (index === this.maxScoresPerLevel) return null;
		return {
			index,
			score: toInsert
		};
	}

	/** Gets an entry from an IndexedDB store by key. */
	static async databaseGet(storeName: string, key: string) {
		let db = await this.idbDatabase;
		let transaction = db.transaction(storeName, 'readonly');
		let store = transaction.objectStore(storeName);
		let request = store.get(key);

		await new Promise(resolve => request.onsuccess = resolve);
		return request.result ?? null;
	}

	/** Puts an entry into an IndexedDB store by key. */
	static async databasePut(storeName: string, value: any, key?: string) {
		let db = await this.idbDatabase;
		let transaction = db.transaction(storeName, 'readwrite');
		let store = transaction.objectStore(storeName);
		store.put(value, key);

		await new Promise(resolve => transaction.addEventListener('complete', resolve));
	}

	/** Deletes an entry from an IndexedDB store by key. */
	static async databaseDelete(storeName: string, key: string) {
		let db = await this.idbDatabase;
		let transaction = db.transaction(storeName, 'readwrite');
		let store = transaction.objectStore(storeName);
		store.delete(key);

		await new Promise(resolve => transaction.addEventListener('complete', resolve));
	}

	/** Counts all entries in an IndexedDB store with a specific key. */
	static async databaseCount(storeName: string, key: string): Promise<number> {
		let db = await this.idbDatabase;
		let transaction = db.transaction(storeName, 'readonly');
		let store = transaction.objectStore(storeName);
		let request = store.count(key);

		await new Promise(resolve => request.onsuccess = resolve);
		return request.result ?? null;
	}

	/** Makes sure the second parameter has the same deep structure as the first. */
	static correctFields<T>(truth: T, obj: T) {
		// Look for all fields present in the truth but not present in the object
		for (let key in truth) {
			if (!(key in obj)) obj[key] = truth[key]; // Copy the value
			// If it's a non-empty non-array object, recurse
			if (truth[key] && typeof truth[key] === 'object' && !Array.isArray(truth[key]) && Object.keys(truth[key]).length) this.correctFields(truth[key], obj[key]);
		}

		// Look for all fields not present in the truth but present in the object
		for (let key in obj) {
			if (!(key in truth)) delete obj[key];
		}

		return obj;
	}
}