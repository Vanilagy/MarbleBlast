import { MissionElementSimGroup, MisParser, MissionElementType, MissionElementScriptObject, MisFile } from "./parsing/mis_parser";
import { ResourceManager } from "./resources";
import { DifParser, DifFile } from "./parsing/dif_parser";
import { Util } from "./util";
import { DtsFile, DtsParser } from "./parsing/dts_parser";

/** A custom levels archive entry. */
export interface CLAEntry {
	addTime: string,
	artist: string,
	baseName: string,
	bitmap: string,
	desc: string,
	difficulty: string,
	egg: boolean,
	gameType: string,
	gems: number,
	goldTime: number,
	id: number,
	modification: string,
	name: string,
	rating: number,
	time: number,
	weight: number
}

/** Represents a playable mission. Contains all the necessary metadata, as well as methods for loading the mission and gettings its resources. */
export class Mission {
	/** The path to the mission. This is either (beginner|intermediate|advanced)/levelname or custom/levelid. */
	path: string;
	misFile: MisFile;
	/** The root sim group, MissionGroup. */
	root: MissionElementSimGroup;
	/** The custom level id. */
	id: number;
	/** The string used for searching missions. */
	searchString: string;
	title: string;
	artist: string;
	description: string;
	qualifyTime = Infinity;
	goldTime = 0;
	hasGoldTime = false; // Some customs don't have 'em
	type: 'beginner' | 'intermediate' | 'advanced' | 'custom' = 'custom';
	zipDirectory: JSZip = null;
	fileToBlobPromises = new Map<JSZip['files'][number], Promise<Blob>>();
	difCache = new Map<string, Promise<DifFile>>();

	constructor(path: string, misFile?: MisFile) {
		this.path = path;
		this.misFile = misFile;
		if (misFile) this.root = misFile.root;
	}

	/** Creates a new Mission from a .mis file. */
	static fromMisFile(path: string, misFile: MisFile) {
		let mission = new Mission(path, misFile);
		let missionInfo = mission.root.elements.find((element) => element._type === MissionElementType.ScriptObject && element._name === 'MissionInfo') as MissionElementScriptObject;

		mission.title = missionInfo.name;
		mission.artist = missionInfo.artist ?? '';
		mission.description = missionInfo.desc ?? '';
		if (missionInfo.time && missionInfo.time !== "0") mission.qualifyTime = MisParser.parseNumber(missionInfo.time);
		if (missionInfo.goldtime) mission.goldTime = MisParser.parseNumber(missionInfo.goldtime), mission.hasGoldTime = true;
		mission.type = missionInfo.type.toLowerCase() as any;

		return mission;
	}

	/** Creates a new mission from a CLA entry. */
	static fromCLAEntry(entry: CLAEntry) {
		let path = 'custom/' + entry.id;
		let mission = new Mission(path);
		mission.title = entry.name.trim();
		mission.artist = entry.artist ?? '';
		mission.description = entry.desc ?? '';
		if (entry.time) mission.qualifyTime = entry.time;
		if (entry.goldTime) mission.goldTime = entry.goldTime;
		mission.id = entry.id;

		return mission;
	}

	initSearchString(index: number) {
		// Just the title and artist for now
		this.searchString = Util.removeSpecialCharacters(Util.normalizeString(this.title + ' ' + this.artist + ' ' + (index + 1))).toLowerCase().trim();
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

			if (filename.includes('interiors_mbg/')) {
				zip.files[filename.replace('interiors_mbg/', 'interiors/')] = val;
			}
		}

		// Read the .mis file
		let missionFileName = Object.keys(zip.files).find(x => x.endsWith('.mis'));
		let text = await ResourceManager.readBlobAsText(await zip.files[missionFileName].async('blob'), 'ISO-8859-1')
		let parser = new MisParser(text);
		let misFile = parser.parse();

		this.misFile = misFile;
		this.root = misFile.root;

		// Set up some metadata
		let missionInfo = this.root.elements.find(x => x._type === MissionElementType.ScriptObject && x._name === "MissionInfo") as MissionElementScriptObject;
		if (missionInfo?.time) {
			this.qualifyTime = MisParser.parseNumber(missionInfo.time);
			if (!this.qualifyTime) this.qualifyTime = Infinity; // Catches both 0 and NaN cases
		}
		if (missionInfo?.goldtime) {
			this.goldTime = MisParser.parseNumber(missionInfo.goldtime);
			this.hasGoldTime = true;
			if (!this.goldTime) { // Again, catches both 0 and NaN cases
				this.hasGoldTime = false;
				this.goldTime = 0;
			}
		}
	}

	/** Gets the path of the image of a mission. */
	getImagePath() {
		if (this.type !== 'custom') {
			let withoutExtension = "missions/" + this.path.slice(0, -4);
			let imagePaths = ResourceManager.getFullNamesOf(withoutExtension);
			let imagePath: string;
			for (let path of imagePaths) {
				if (!path.endsWith('.mis')) {
					imagePath = path;
					break;
				}
			}

			return "./assets/data/missions/" + this.path.slice(0, this.path.lastIndexOf('/') + 1) + imagePath;
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
		if (path.includes('interiors_mbg/')) path = path.replace('interiors_mbg/', 'interiors/');

		let dif: DifFile = null;
		if (this.difCache.get(path)) dif = await this.difCache.get(path); // We've already parsed the dif before
		else {
			let promise = new Promise<DifFile>(async (resolve) => {
				let dif: DifFile;

				if (this.zipDirectory && this.zipDirectory.files[path]) {
					// Get it from the zip
					let arrayBuffer = await this.zipDirectory.files[path].async('arraybuffer');
					let parser = new DifParser(arrayBuffer);
					let result = parser.parse();
					dif = result;
				} else {
					dif = await DifParser.loadFile('./assets/' + path);
				}

				resolve(dif);
			});

			this.difCache.set(path, promise);
			dif = await promise;
		}

		return { dif, path };
	}

	/** Gets a DTS file from the mission resources. */
	async getDts(path: string) {
		let dts: DtsFile = null;

		if (this.zipDirectory && this.zipDirectory.files[path]) {
			// Get it from the zip
			let arrayBuffer = await this.zipDirectory.files[path].async('arraybuffer');
			let parser = new DtsParser(arrayBuffer);
			let result = parser.parse();
			dts = result;
		} else {
			dts = await DtsParser.loadFile('./assets/' + path);
		}

		return dts;
	}

	/** Same as `ResourceManager.getFullNamesOf`, but including custom mission resources. */
	getFullNamesOf(path: string) {
		path = path.toLowerCase();
		let result: string[] = [];

		if (this.zipDirectory) {
			for (let filePath in this.zipDirectory.files) {
				if (filePath.startsWith('data/' + path)) {
					result.push(filePath.slice(filePath.lastIndexOf('/') + 1));
				}
			}
		}

		result.push(...ResourceManager.getFullNamesOf(path));

		return result;
	}

	/** Gets a blob for a file in the zip directory. */
	getBlobForFile(path: string) {
		let file = this.zipDirectory.files[path];
		if (this.fileToBlobPromises.get(file)) return this.fileToBlobPromises.get(file);

		let promise = new Promise<Blob>(async (resolve) => {
			let blob = await file.async('blob');
			resolve(blob);
		});

		this.fileToBlobPromises.set(file, promise);
		return promise;
	}

	/** Gets a texture from the mission resources. */
	async getTexture(path: string, removeAlpha?: boolean) {
		path = path.toLowerCase();

		if (this.zipDirectory && this.zipDirectory.files['data/' + path]) {
			let blob = await this.getBlobForFile('data/' + path);
			let url = ResourceManager.getUrlToBlob(blob);
			return await ResourceManager.getTexture(url, removeAlpha, '');
		} else {
			return await ResourceManager.getTexture(path, removeAlpha);
		}
	}

	/** Gets a general resource from the mission resources. */
	async getResource(path: string) {
		path = path.toLowerCase();

		if (this.zipDirectory && this.zipDirectory.files['data/' + path]) {
			let blob = await this.getBlobForFile('data/' + path);
			return blob;
		} else {
			return await ResourceManager.loadResource('./assets/data/' + path);
		}
	}

	/** Gets an image from the mission resources. */
	async getImage(path: string) {
		path = path.toLowerCase();

		if (this.zipDirectory && this.zipDirectory.files['data/' + path]) {
			let blob = await this.getBlobForFile('data/' + path);
			let url = ResourceManager.getUrlToBlob(blob);
			return await ResourceManager.loadImage(url);
		} else {
			return await ResourceManager.loadImage('./assets/data/' + path);
		}
	}

	/** Returns true iff the mission matches the given query. */
	matchesSearch(queryWords: string[]) {
		for (let i = 0; i < queryWords.length; i++) {
			if (!this.searchString.includes(queryWords[i])) return false;
		}
		return true;
	}
}