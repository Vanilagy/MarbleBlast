import { Util } from "./util";
import { executeOnWorker } from "./worker";

/** name, time, scoreId, timestamp */
export type BestTimes = [name: string, time: number, scoreId: string, timestamp: number][];

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
			"restart": string,
			"blast": string
		},
		mouseSensitivity: number,
		keyboardSensitivity: number,
		invertMouse: number,
		alwaysFreeLook: boolean,
		marbleReflectivity: number,
		showFrameRate: boolean,
		showThousandths: boolean,
		fov: number,
		fancyShaders: boolean,
		/** 0: Max 0.5, 1: Max 1.0, 2: Max 1.5, 3: Max 2.0, 4: Max Infinity */
		pixelRatio: number,
		inputType: number,
		frameRateCap: number,
		canvasDesynchronized: boolean,

		joystickPosition: number,
		joystickSize: number,
		joystickLeftOffset: number,
		joystickVerticalPosition: number,
		actionButtonOrder: number,
		actionButtonSize: number,
		actionButtonRightOffset: number,
		actionButtonBottomOffset: number,
		actionButtonAsJoystickMultiplier: number
	},
	bestTimes: Record<string, BestTimes>,
	/** Used for the name entry in the post-game screen. */
	lastUsedName: string,
	/** A random ID to somewhat uniquely identify this user, even if they change their username. */
	randomId: string,
	/** The queue of scores that are still to be sent to the server. */
	bestTimeSubmissionQueue: {
		missionPath: string,
		score: BestTimes[number]
	}[],
	/** The last-seen version of the game. */
	lastSeenVersion: string,
	/** Mission paths whose eggs have been collected. */
	collectedEggs: string[],
	/** Which modification was last used. */
	modification: 'gold' | 'platinum',
	videoRecorderConfig: {
		width: number,
		height: number,
		kilobitRate: number,
		frameRate: number,
		playbackSpeed: number,
		fastMode: boolean,
		bt709: boolean,

		includeAudio: boolean,
		audioKilobitRate: number,
		musicToSoundRatio: number
	}
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
			"restart": "KeyR",
			"blast": "KeyE"
		},
		mouseSensitivity: 0.2,
		keyboardSensitivity: 0.1,
		invertMouse: 0,
		alwaysFreeLook: true,
		marbleReflectivity: 0,
		showFrameRate: true,
		showThousandths: true,
		fov: 60,
		fancyShaders: true,
		pixelRatio: 2,
		inputType: 0,
		frameRateCap: 7,
		canvasDesynchronized: !/(CrOS)/.test(navigator.userAgent), // Turn it off when on ChromeOS (some people on Chromebooks have reported flickering)

		joystickPosition: 0,
		joystickSize: 250,
		joystickLeftOffset: 75,
		joystickVerticalPosition: 0.5,
		actionButtonOrder: 0,
		actionButtonSize: 120,
		actionButtonRightOffset: 30,
		actionButtonBottomOffset: 30,
		actionButtonAsJoystickMultiplier: 1.5
	},
	bestTimes: {},
	lastUsedName: '',
	randomId: Util.getRandomId(),
	bestTimeSubmissionQueue: [],
	lastSeenVersion: null,
	collectedEggs: [],
	modification: 'platinum',
	videoRecorderConfig: {
		width: 1280,
		height: 720,
		kilobitRate: 5000,
		frameRate: 60,
		playbackSpeed: 1,
		fastMode: true,
		bt709: false,

		includeAudio: true,
		audioKilobitRate: 64,
		musicToSoundRatio: 0.7
	}
};

const VERSION_UPGRADE_PROCEDURES: Record<string, () => Promise<any>> = {
	'2.1.5': async () => {
		// Got more performant now, so encourage people to have this on :)
		StorageManager.data.settings.marbleReflectivity = 0;
		await StorageManager.store();
	},
	'2.3.0': async () => {
		// Got super pretty now, so encourage people to have this on :)
		StorageManager.data.settings.marbleReflectivity = 0;
		await StorageManager.store();
	}
};

/** Manages storage and persistence. */
export abstract class StorageManager {
	static data: StorageData;
	static idbDatabaseLoading: Promise<void>;
	static idbDatabase: IDBDatabase;
	static hadOldDatabase = false;

	static async init() {
		// Set up the IndexedDB

		if (indexedDB.databases) {
			let allDatabases = await indexedDB.databases();
			if (allDatabases.find(x => x.name === 'mb-database')) {
				this.hadOldDatabase = true;
			}
		} else {
			if (Util.checkDatabaseExists('mb-database')) {
				this.hadOldDatabase = true;
			}
		}

		this.idbDatabaseLoading = new Promise((resolve) => {
			let request = indexedDB.open("mbw", 3);
			request.onsuccess = (e) => {
				resolve();
				this.idbDatabase = (e.target as any).result;
				this.idbDatabaseLoading = null;
			};

			request.onupgradeneeded = (e) => {
				let db = (e.target as any).result as IDBDatabase;
				let transaction = (e.target as any).transaction as IDBTransaction;

				// For storing replays
				try {
					db.createObjectStore('replays', {});
				} catch (error) {
					transaction.objectStore('replays');
				}

				// A simple key-value store
				try {
					db.createObjectStore('keyvalue', {});
				} catch (error) {
					transaction.objectStore('keyvalue');
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

		// Override the inferred type
		if (this.data.settings.inputType === 1) Util.isTouchDevice = false;
		else if (this.data.settings.inputType === 2) Util.isTouchDevice = true;

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

		Util.getDefaultSecondsToTimeStringDecimalDigits = () => this.data.settings.showThousandths? 3 : 2;
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
		await this.idbDatabaseLoading;

		let db = this.idbDatabase;
		let transaction = db.transaction(storeName, 'readonly');
		let store = transaction.objectStore(storeName);
		let request = store.get(key);

		await new Promise(resolve => request.onsuccess = resolve);
		return request.result ?? null;
	}

	/** Puts an entry into an IndexedDB store by key. */
	static async databasePut(storeName: string, value: any, key?: string) {
		await this.idbDatabaseLoading;

		let db = this.idbDatabase;
		let transaction = db.transaction(storeName, 'readwrite');
		let store = transaction.objectStore(storeName);
		store.put(value, key);

		await new Promise(resolve => transaction.addEventListener('complete', resolve));
	}

	/** Deletes an entry from an IndexedDB store by key. */
	static async databaseDelete(storeName: string, key: string) {
		await this.idbDatabaseLoading;

		let db = this.idbDatabase;
		let transaction = db.transaction(storeName, 'readwrite');
		let store = transaction.objectStore(storeName);
		store.delete(key);

		await new Promise(resolve => transaction.addEventListener('complete', resolve));
	}

	/** Counts all entries in an IndexedDB store with a specific key. */
	static async databaseCount(storeName: string, key: string): Promise<number> {
		await this.idbDatabaseLoading;

		let db = this.idbDatabase;
		let transaction = db.transaction(storeName, 'readonly');
		let store = transaction.objectStore(storeName);
		let request = store.count(key);

		await new Promise(resolve => request.onsuccess = resolve);
		return request.result ?? null;
	}

	/** Makes sure the second parameter has the same deep structure as the first. */
	static correctFields<T extends object>(truth: T, obj: T) {
		// Look for all fields present in the truth but not present in the object
		for (let key in truth) {
			if (!(key in obj)) obj[key] = truth[key]; // Copy the value
			// If it's a non-empty non-array object, recurse
			if (truth[key] && typeof truth[key] === 'object' && !Array.isArray(truth[key]) && Object.keys(truth[key]).length) this.correctFields(truth[key] as any, obj[key]);
		}

		// Look for all fields not present in the truth but present in the object
		for (let key in obj) {
			if (!(key in truth)) delete obj[key];
		}

		return obj;
	}

	/** Performs a series of modification needed to upgrade an old version. */
	static async onVersionUpgrade(from: string) {
		for (let vers in VERSION_UPGRADE_PROCEDURES) {
			if (Util.compareVersions(from, vers) >= 0) continue;
			await VERSION_UPGRADE_PROCEDURES[vers]();
		}
	}
}