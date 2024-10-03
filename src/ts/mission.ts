import { MissionElementSimGroup, MisParser, MissionElementType, MissionElementScriptObject, MisFile, MissionElement } from "./parsing/mis_parser";
import { ResourceManager } from "./resources";
import { Util } from "./util";
import { DtsFile, DtsParser } from "./parsing/dts_parser";
import { state } from "./state";
import hxDif from './parsing/hx_dif';
import { IflFile, IflParser } from "./parsing/ifl_parser";

/** A Marbleland level entry. */
export interface CustomLevelInfo {
	id: number,
	baseName: string,
	gameType: 'single' | 'multi',
	modification: 'gold' | 'platinum' | 'fubar' | 'ultra' | 'platinumquest',
	name: string,
	artist: string,
	desc: string,
	addedAt: number,
	gameMode: string,
	editedAt: number,

	qualifyingTime: number,
	goldTime: number,
	platinumTime: number,
	ultimateTime: number,
	awesomeTime: number,

	qualifyingScore: number,
	goldScore: number,
	platinumScore: number,
	ultimateScore: number,
	awesomeScore: number,

	gems: number,
	hasEasterEgg: boolean,

	downloads: number,
	lovedCount: number,

	hasCustomCode: boolean,
	datablockCompatibility: 'mbg' | 'mbw' | 'pq'
}

/** Represents a playable mission. Contains all the necessary metadata, as well as methods for loading the mission and gettings its resources. */
export class Mission {
	/** The path to the mission. This is either (beginner|intermediate|advanced)/levelname or custom/levelid. */
	path: string;
	misFile: MisFile;
	/** The root sim group, MissionGroup. */
	root: MissionElementSimGroup;
	/** Contains all mission elements contained in the .mis, flattened out into one array. */
	allElements: MissionElement[];
	/** The custom level id. */
	id: number;
	/** The string used for searching missions. */
	searchString: string;
	missionInfo: MissionElementScriptObject;
	title: string;
	artist: string;
	description: string;
	qualifyTime = Infinity;
	goldTime = -Infinity; // Doubles as platinum time
	ultimateTime = -Infinity;
	type: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'custom' = 'custom';
	modification: 'gold' | 'platinum' | 'ultra';
	zipDirectory: JSZip = null;
	fileToBlobPromises = new Map<JSZip['files'][number], Promise<Blob>>();
	difCachePromises = new Map<string, Promise<hxDif.Dif>>();
	difCache = new Map<string, hxDif.Dif>();
	isNew = false;
	createdAt = 0;
	hasEasterEgg = false;
	hasBlast = false;
	hasUltraMarble = false;

	constructor(path: string, misFile?: MisFile) {
		this.path = path;
		this.misFile = misFile;

		if (misFile) {
			this.root = misFile.root;
			this.initAllElements();
		}
	}

	/** Creates a new Mission from a .mis file. */
	static fromMisFile(path: string, misFile: MisFile) {
		let mission = new Mission(path, misFile);
		let missionInfo = mission.allElements.find(element => element._type === MissionElementType.ScriptObject && element._name === 'MissionInfo') as MissionElementScriptObject;

		mission.missionInfo = missionInfo;
		mission.title = missionInfo.name;
		mission.artist = missionInfo.artist ?? '';
		mission.description = missionInfo.desc ?? '';
		if (missionInfo.time && missionInfo.time !== "0") mission.qualifyTime = MisParser.parseNumber(missionInfo.time);
		if (missionInfo.goldtime) mission.goldTime = MisParser.parseNumber(missionInfo.goldtime);
		if (missionInfo.platinumtime) mission.goldTime = MisParser.parseNumber(missionInfo.platinumtime);
		if (missionInfo.ultimatetime) mission.ultimateTime = MisParser.parseNumber(missionInfo.ultimatetime);
		mission.type = missionInfo.type.toLowerCase() as any;
		mission.modification = path.startsWith('mbp/')? 'platinum' : path.startsWith('mbu/')? 'ultra' : 'gold';
		mission.hasEasterEgg = mission.allElements.some(element => element._type === MissionElementType.Item && element.datablock?.toLowerCase() === 'easteregg');
		mission.setUltraFlags();

		return mission;
	}

	/** Creates a new mission from a CLA entry. */
	static fromCustomLevelInfo(info: CustomLevelInfo, isNew: boolean) {
		let path = 'custom/' + info.id;
		if (info.modification === 'platinum') path = 'mbp/' + path;
		if (info.modification === 'ultra') path = 'mbu/' + path;
		let mission = new Mission(path);
		mission.title = info.name.trim();
		mission.artist = info.artist ?? '';
		mission.description = info.desc ?? '';
		if (info.qualifyingTime) mission.qualifyTime = info.qualifyingTime;
		if (info.goldTime) mission.goldTime = info.goldTime;
		if (info.platinumTime) mission.goldTime = info.platinumTime;
		if (info.ultimateTime) mission.ultimateTime = info.ultimateTime;
		mission.id = info.id;
		mission.isNew = isNew;
		mission.createdAt = info.addedAt;
		mission.modification = info.modification as ('gold' | 'platinum' | 'ultra');
		mission.hasEasterEgg = info.hasEasterEgg;

		return mission;
	}

	initAllElements() {
		this.allElements = [];

		const traverse = (simGroup: MissionElementSimGroup) => {
			for (let element of simGroup.elements) {
				this.allElements.push(element);
				if (element._type === MissionElementType.SimGroup) traverse(element);
			}
		};
		traverse(this.root);
	}

	initSearchString() {
		// Just the title and artist for now
		this.searchString = Util.removeSpecialCharacters(Util.normalizeString(this.title + ' ' + this.artist)).toLowerCase().trim();
	}

	/** Loads this mission for gameplay. */
	async load() {
		if (this.misFile) return; // We already have the .mis file, we don't need to do anything
		if (this.type !== 'custom') return; // Just a safety check

		// Get the zip archive
		let blob = await ResourceManager.loadResource(`./api/custom/${this.id}.zip`);
		let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(blob);
		let zip = await JSZip.loadAsync(arrayBuffer); // Unzip the thing
		this.zipDirectory = zip;

		// Normalize filenames within the zip
		for (let filename in zip.files) {
			let val = zip.files[filename];
			delete zip.files[filename];
			zip.files[filename.toLowerCase()] = val;
			zip.files[filename.toLowerCase().replace('data/', 'data_mbp/')] = val; // Alias every data/ with a data_mbp/ entry

			if (this.modification === 'gold' && filename.includes('interiors_mbg/')) {
				// Create an alias in interiors
				zip.files[filename.replace('interiors_mbg/', 'interiors/')] = val;
			}
		}

		// Read the .mis file
		let missionFileName = Object.keys(zip.files).find(x => x.endsWith('.mis'));
		let text = await ResourceManager.readBlobAsText(await zip.files[missionFileName].async('blob'), 'ISO-8859-1');
		let parser = new MisParser(text);
		let misFile = parser.parse();

		this.misFile = misFile;
		this.root = misFile.root;
		this.initAllElements();

		// Set up some metadata
		let missionInfo = this.allElements.find(x => x._type === MissionElementType.ScriptObject && x._name === "MissionInfo") as MissionElementScriptObject;
		if (missionInfo?.time) {
			this.qualifyTime = MisParser.parseNumber(missionInfo.time);
			if (!this.qualifyTime) this.qualifyTime = Infinity; // Catches both 0 and NaN cases
		}
		if (missionInfo?.goldtime) {
			this.goldTime = MisParser.parseNumber(missionInfo.goldtime);
			if (missionInfo?.platinumtime) this.goldTime = MisParser.parseNumber(missionInfo.platinumtime);

			if (!this.goldTime) { // Again, catches both 0 and NaN cases
				this.goldTime = -Infinity;
			}
		}
		if (missionInfo?.ultimatetime) {
			this.ultimateTime = MisParser.parseNumber(missionInfo.ultimatetime);
			if (!this.ultimateTime) { // Again again, catches both 0 and NaN cases
				this.ultimateTime = -Infinity;
			}
		}
		this.missionInfo = missionInfo;

		this.setUltraFlags();
	}

	setUltraFlags() {
		if (!MisParser.parseBoolean(this.missionInfo.noblast) && (MisParser.parseBoolean(this.missionInfo.blast) || this.missionInfo.game?.toLowerCase() === 'ultra'))
			this.hasBlast = true;

		if (this.missionInfo.game?.toLowerCase() === 'ultra' || MisParser.parseBoolean(this.missionInfo.useultramarble))
			this.hasUltraMarble = true;
	}

	getDirectoryMissionPath() {
		if (this.modification === 'gold') return 'missions/' + this.path;
		if (this.modification === 'ultra') return 'missions_mbu/' + this.path.slice(4);
		if (this.modification === 'platinum') return 'missions_mbp/' + this.path.slice(4);
	}

	/** Gets the path of the image of a mission. */
	getImagePath() {
		if (this.type !== 'custom') {
			let directoryMissionPath = this.getDirectoryMissionPath();
			if (state.modification !== 'gold') directoryMissionPath = directoryMissionPath.replace('missions/', 'missions_mbg/');

			let withoutExtension = directoryMissionPath.slice(0, -4);
			let imagePaths = ResourceManager.getFullNamesOf(withoutExtension, state.modification !== 'gold');
			let imagePath: string;
			for (let path of imagePaths) {
				if (!path.endsWith('.mis')) {
					imagePath = path;
					break;
				}
			}

			let res = directoryMissionPath.slice(0, directoryMissionPath.lastIndexOf('/') + 1) + imagePath;
			if (state.modification === 'gold') return "./assets/data/" + res;
			return "./assets/data_mbp/" + res;
		} else {
			// Request the bitmap
			return `./api/custom/${this.id}.jpg`;
		}
	}

	/** Gets a DIF file from the mission resources.
	 * @param rawElementPath The raw path specified within the .mis file
	 */
	async getDif(rawElementPath: string) {
		rawElementPath = rawElementPath.toLowerCase();
		let path = rawElementPath.slice(rawElementPath.indexOf('data/'));

		if (this.modification === 'gold' && path.includes('interiors_mbg/')) path = path.replace('interiors_mbg/', 'interiors/');
		if (this.modification !== 'gold') path = path.replace('data/', 'data_mbp/');

		let dif: hxDif.Dif = null;
		await this.difCachePromises.get(path);
		if (this.difCache.get(path)) {
			dif = this.difCache.get(path); // We've already parsed the dif before
		} else {
			let promise = (async () => {
				let dif: hxDif.Dif;

				if (this.zipDirectory && this.zipDirectory.files[path]) {
					// Get it from the zip
					let arrayBuffer = await this.zipDirectory.files[path].async('arraybuffer');
					dif = hxDif.Dif.LoadFromArrayBuffer(arrayBuffer);
				} else {
					let blob = await ResourceManager.loadResource('./assets/' + path);

					if (!blob) {
						dif = null;
					} else {
						let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(blob);
						dif = hxDif.Dif.LoadFromArrayBuffer(arrayBuffer);
					}
				}

				this.difCache.set(path, dif);
				this.difCachePromises.delete(path);

				return dif;
			})();

			this.difCachePromises.set(path, promise);
			dif = await promise;
		}

		return { dif, path };
	}

	/** Gets a DTS file from the mission resources. */
	async getDts(path: string) {
		let dts: DtsFile = null;

		let base = (state.modification === 'gold')? 'data/' : 'data_mbp/';

		if (this.zipDirectory && this.zipDirectory.files['data/' + path]) {
			// Get it from the zip
			let arrayBuffer = await this.zipDirectory.files['data/' + path].async('arraybuffer');
			let parser = new DtsParser(arrayBuffer);
			let result = parser.parse();
			dts = result;
		} else {
			dts = await DtsParser.loadFile('./assets/' + base + path);
		}

		return dts;
	}

	async getIfl(path: string) {
		let ifl: IflFile = null;

		if (this.zipDirectory && this.zipDirectory.files['data/' + path]) {
			// Get it from the zip
			let blob = await this.zipDirectory.files['data/' + path].async('blob');
			let text = await ResourceManager.readBlobAsText(blob, 'ISO-8859-1');
			let parser = new IflParser(text);
			let result = parser.parse();
			ifl = result;
		} else {
			// Always use the main data path for ifls
			ifl = await IflParser.loadFile(ResourceManager.mainDataPath + path);
		}

		return ifl;
	}

	/** Same as `ResourceManager.getFullNamesOf`, but including custom mission resources. */
	getFullNamesOf(path: string, fallBackToCurrentModification = false) {
		path = path.toLowerCase();
		let result: string[] = [];
		let prepended = 'data/' + path;

		if (this.zipDirectory) {
			for (let filePath in this.zipDirectory.files) {
				if (filePath.startsWith(prepended)) {
					if (filePath.length !== prepended.length && prepended.length !== filePath.lastIndexOf('.')) continue;
					result.push(filePath.slice(filePath.lastIndexOf('/') + 1));
				}
			}
		}

		result.push(...ResourceManager.getFullNamesOf(path, fallBackToCurrentModification? undefined : this.modification !== 'gold'));

		return result;
	}

	/** Gets a blob for a file in the zip directory. */
	getBlobForFile(path: string) {
		let file = this.zipDirectory.files[path];
		if (this.fileToBlobPromises.get(file)) return this.fileToBlobPromises.get(file);

		let promise = file.async('blob');

		this.fileToBlobPromises.set(file, promise);
		return promise;
	}

	/** Gets a texture from the mission resources. */
	async getTexture(path: string, fallBackToMainDataPath = false) {
		path = path.toLowerCase();

		let base = (this.modification === 'gold')? 'data/' : 'data_mbp/';

		if (this.zipDirectory && this.zipDirectory.files[base + path]) {
			let blob = await this.getBlobForFile(base + path);
			let url = ResourceManager.getUrlToBlob(blob);
			let texture = await ResourceManager.getTexture(url, '');

			return texture;
		} else {
			let texture = await ResourceManager.getTexture(path, fallBackToMainDataPath? undefined : 'assets/' + base);

			return texture;
		}
	}

	/** Gets a general resource from the mission resources. */
	async getResource(path: string) {
		path = path.toLowerCase();
		let base = (this.modification === 'gold')? 'data/' : 'data_mbp/';

		if (this.zipDirectory && this.zipDirectory.files[base + path]) {
			let blob = await this.getBlobForFile(base + path);
			return blob;
		} else {
			return await ResourceManager.loadResource('./assets/' + base + path);
		}
	}

	/** Gets an image from the mission resources. */
	async getImage(path: string) {
		path = path.toLowerCase();
		let base = (this.modification === 'gold')? 'data/' : 'data_mbp/';

		if (this.zipDirectory && this.zipDirectory.files[base + path]) {
			let blob = await this.getBlobForFile(base + path);
			let url = ResourceManager.getUrlToBlob(blob);
			return await ResourceManager.loadImage(url, base + path);
		} else {
			return await ResourceManager.loadImage('./assets/' + base + path);
		}
	}

	/** Returns true iff the mission matches the given query. */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	matchesSearch(queryWords: string[], query: string) {
		// Disabled because it honestly creates garbage results in many cases
		//if (Util.isSubsequenceOf(query, this.searchString)) return true;

		for (let i = 0; i < queryWords.length; i++) {
			if (!this.searchString.includes(queryWords[i])) return false;
		}
		return true;
	}

	/** Computes the clock time in MBP when the user should be warned that they're about to exceed the par time. */
	computeAlarmStartTime() {
		let alarmStart = this.qualifyTime;
		if (this.missionInfo.alarmstarttime) alarmStart -= MisParser.parseNumber(this.missionInfo.alarmstarttime) * 1000;
		else alarmStart -= 15 * 1000;
		alarmStart = Math.max(0, alarmStart);

		return alarmStart;
	}

	static compareLexicographically(a: Mission, b: Mission) {
		return Util.normalizeString(a.title).localeCompare(
			Util.normalizeString(b.title),
			undefined,
			{ numeric: true, sensitivity: 'base' }
		);
	}

	static compareChronologically(a: Mission, b: Mission) {
		return a.createdAt - b.createdAt;
	}
}