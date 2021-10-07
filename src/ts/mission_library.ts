import { Mission, CLAEntry } from "./mission";
import { MisFile, MisParser } from "./parsing/mis_parser";
import { ResourceManager, DirectoryStructure } from "./resources";
import { Util } from "./util";

export abstract class MissionLibrary {
	static goldBeginner: Mission[] = [];
	static goldIntermediate: Mission[] = [];
	static goldAdvanced: Mission[] = [];
	static goldCustom: Mission[] = [];

	static platinumBeginner: Mission[] = [];
	static platinumIntermediate: Mission[] = [];
	static platinumAdvanced: Mission[] = [];
	static platinumExpert: Mission[] = [];
	static platinumCustom: Mission[] = [];

	static async init() {
		let mbgMissionFilenames: string[] = [];
		let mbpMissionFilenames: string[] = [];

		const collectMissionFiles = (arr: string[], directory: DirectoryStructure, path: string) => {
			for (let name in directory) {
				if (directory[name]) {
					collectMissionFiles(arr, directory[name], path + name + '/');
				} else if (name.endsWith('.mis')) {
					arr.push(path + name);
				}
			}
		};
		collectMissionFiles(mbgMissionFilenames, ResourceManager.dataDirectoryStructure['missions'], ''); // Find all mission files
		collectMissionFiles(mbpMissionFilenames, ResourceManager.dataMbpDirectoryStructure['missions_mbp'], '');

		let mbgPromises: Promise<MisFile>[] = [];
		let mbpPromises: Promise<MisFile>[] = [];
		for (let filename of mbgMissionFilenames) {
			// Load and read all missions
			mbgPromises.push(MisParser.loadFile("./assets/data/missions/" + filename));
		}
		for (let filename of mbpMissionFilenames) {
			// Load and read all missions
			mbpPromises.push(MisParser.loadFile("./assets/data_mbp/missions_mbp/" + filename));
		}

		// Get the list of all custom levels in the CLA
		let customLevelListPromise = ResourceManager.loadResource('./assets/gold_levels.json');

		let mbgMisFiles = await Promise.all(mbgPromises);
		let mbpMisFiles = await Promise.all(mbpPromises);
		let misFileToFilename = new Map<MisFile, string>();
		for (let i = 0; i < mbgMissionFilenames.length; i++) {
			misFileToFilename.set(mbgMisFiles[i], mbgMissionFilenames[i]);
		}
		for (let i = 0; i < mbpMissionFilenames.length; i++) {
			misFileToFilename.set(mbpMisFiles[i], mbpMissionFilenames[i]);
		}

		let mbgMissions: Mission[] = [];
		let mbpMissions: Mission[] = [];

		// Create the regular missions
		for (let misFile of mbgMisFiles) {
			let mission = Mission.fromMisFile(misFileToFilename.get(misFile), misFile);
			mbgMissions.push(mission);
		}
		for (let misFile of mbpMisFiles) {
			let mission = Mission.fromMisFile('mbp/' + misFileToFilename.get(misFile), misFile);
			mbpMissions.push(mission);
		}

		// Sort the missions by level index so they're in the right order
		const sortFn = (a: Mission, b: Mission) => {
			return MisParser.parseNumber(a.missionInfo.level) - MisParser.parseNumber(b.missionInfo.level);
		};
		mbgMissions.sort(sortFn);
		mbpMissions.sort(sortFn);

		// Read the custom level list
		let customLevelList = await ResourceManager.readBlobAsJson(await customLevelListPromise) as CLAEntry[];
		let oldIdsList = await ResourceManager.readBlobAsJson(await ResourceManager.loadResource('./assets/old_ids.json')) as number[];
		let oldIds = new Set(oldIdsList);

		// Create all custom missions
		for (let custom of customLevelList) {
			let mission = Mission.fromCLAEntry(custom, !oldIds.has(custom.id));
			mbgMissions.push(mission);
		}

		// Sort the missions into the correct array
		for (let mission of mbgMissions) {
			let missionType = mission.type;
			if (missionType === 'beginner') this.goldBeginner.push(mission);
			else if (missionType === 'intermediate') this.goldIntermediate.push(mission);
			else if (missionType === 'advanced') this.goldAdvanced.push(mission);
			else this.goldCustom.push(mission);
		}
		for (let mission of mbpMissions) {
			let missionType = mission.type;
			if (missionType === 'beginner') this.platinumBeginner.push(mission);
			else if (missionType === 'intermediate') this.platinumIntermediate.push(mission);
			else if (missionType === 'advanced') this.platinumAdvanced.push(mission);
			else if (missionType === 'expert') this.platinumExpert.push(mission);
			else this.platinumCustom.push(mission);
		}

		// Strange case, but these two levels are in opposite order in the original game.
		Util.swapInArray(this.goldIntermediate, 11, 12);

		// Sort all custom levels alphabetically
		const sortFn2 = (a: Mission, b: Mission) => Util.normalizeString(a.title).localeCompare(Util.normalizeString(b.title), undefined, { numeric: true, sensitivity: 'base' });
		this.goldCustom.sort(sortFn2);

		for (let i = 0; i < this.goldBeginner.length; i++) this.goldBeginner[i].initSearchString(i);
		for (let i = 0; i < this.goldIntermediate.length; i++) this.goldIntermediate[i].initSearchString(i);
		for (let i = 0; i < this.goldAdvanced.length; i++) this.goldAdvanced[i].initSearchString(i);
		for (let i = 0; i < this.goldCustom.length; i++) this.goldCustom[i].initSearchString(i);

		for (let i = 0; i < this.platinumBeginner.length; i++) this.platinumBeginner[i].initSearchString(i);
		for (let i = 0; i < this.platinumIntermediate.length; i++) this.platinumIntermediate[i].initSearchString(i);
		for (let i = 0; i < this.platinumAdvanced.length; i++) this.platinumAdvanced[i].initSearchString(i);
		for (let i = 0; i < this.platinumExpert.length; i++) this.platinumExpert[i].initSearchString(i);
		for (let i = 0; i < this.platinumCustom.length; i++) this.platinumCustom[i].initSearchString(i);
	}

	static getModification(arr: Mission[]) {
		return arr[0]?.modification ?? null;
	}

	static getDifficulty(arr: Mission[]) {
		return arr[0]?.type ?? null;
	}
}