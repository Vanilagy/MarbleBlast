import { CustomLevelInfo, Mission } from "./mission";
import { MisFile, MisParser } from "./parsing/mis_parser";
import { ResourceManager, DirectoryStructure } from "./resources";
import { Util } from "./util";

export abstract class MissionLibrary {
	static allMissions: Mission[] = [];
	static allCategories: Mission[][] = [];

	static goldBeginner: Mission[] = [];
	static goldIntermediate: Mission[] = [];
	static goldAdvanced: Mission[] = [];
	static goldCustom: Mission[] = [];

	static platinumBeginner: Mission[] = [];
	static platinumIntermediate: Mission[] = [];
	static platinumAdvanced: Mission[] = [];
	static platinumExpert: Mission[] = [];
	static platinumCustom: Mission[] = [];

	static ultraBeginner: Mission[] = [];
	static ultraIntermediate: Mission[] = [];
	static ultraAdvanced: Mission[] = [];
	static ultraCustom: Mission[] = [];

	/** Loads all missions. */
	static async init() {
		let mbgMissionFilenames: string[] = [];
		let mbpMissionFilenames: string[] = [];
		let mbuMissionFilenames: string[] = [];

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
		collectMissionFiles(mbuMissionFilenames, ResourceManager.dataMbpDirectoryStructure['missions_mbu'], '');

		let mbgPromises: Promise<MisFile>[] = [];
		let mbpPromises: Promise<MisFile>[] = [];
		let mbuPromises: Promise<MisFile>[] = [];
		for (let filename of mbgMissionFilenames) {
			// Load and read all missions
			mbgPromises.push(MisParser.loadFile("./assets/data/missions/" + filename));
		}
		for (let filename of mbpMissionFilenames) {
			mbpPromises.push(MisParser.loadFile("./assets/data_mbp/missions_mbp/" + filename));
		}
		for (let filename of mbuMissionFilenames) {
			mbuPromises.push(MisParser.loadFile("./assets/data_mbp/missions_mbu/" + filename));
		}

		// Get the list of all custom levels
		let customLevelListPromise = ResourceManager.loadResource('/api/customs');

		let mbgMisFiles = await Promise.all(mbgPromises);
		let mbpMisFiles = await Promise.all(mbpPromises);
		let mbuMisFiles = await Promise.all(mbuPromises);

		let misFileToFilename = new Map<MisFile, string>();
		for (let i = 0; i < mbgMissionFilenames.length; i++) misFileToFilename.set(mbgMisFiles[i], mbgMissionFilenames[i]);
		for (let i = 0; i < mbpMissionFilenames.length; i++) misFileToFilename.set(mbpMisFiles[i], mbpMissionFilenames[i]);
		for (let i = 0; i < mbuMissionFilenames.length; i++) misFileToFilename.set(mbuMisFiles[i], mbuMissionFilenames[i]);

		let mbgMissions: Mission[] = [];
		let mbpMissions: Mission[] = [];
		let mbuMissions: Mission[] = [];

		// Create the regular missions
		for (let misFile of mbgMisFiles) {
			let mission = Mission.fromMisFile(misFileToFilename.get(misFile), misFile);
			mbgMissions.push(mission);
		}
		for (let misFile of mbpMisFiles) {
			let mission = Mission.fromMisFile('mbp/' + misFileToFilename.get(misFile), misFile);
			mbpMissions.push(mission);
		}
		for (let misFile of mbuMisFiles) {
			let mission = Mission.fromMisFile('mbu/' + misFileToFilename.get(misFile), misFile);
			mbuMissions.push(mission);
		}

		// Sort the missions by level index so they're in the right order
		const sortFn = (a: Mission, b: Mission) => {
			return MisParser.parseNumber(a.missionInfo.level) - MisParser.parseNumber(b.missionInfo.level);
		};
		mbgMissions.sort(sortFn);
		mbpMissions.sort(sortFn);
		mbuMissions.sort(sortFn);

		// Read the custom level list
		let customs = await ResourceManager.readBlobAsJson(await customLevelListPromise) as CustomLevelInfo[];

		let goldCustoms = customs.filter(x => x.modification === 'gold');
		let platCustoms = customs.filter(x => x.modification === 'platinum');
		let ultraCustoms = customs.filter(x => x.modification === 'ultra');

		// Create all custom missions
		for (let custom of [...goldCustoms, ...platCustoms, ...ultraCustoms]) {
			let mission = Mission.fromCustomLevelInfo(custom, false);
			if (mission.modification === 'gold') mbgMissions.push(mission);
			else if (mission.modification === 'ultra') mbuMissions.push(mission);
			else mbpMissions.push(mission);
		}

		// Sort the missions into the correct array
		for (let mission of mbgMissions) {
			let missionType = mission.type;
			if (missionType === 'beginner') this.goldBeginner.push(mission);
			else if (missionType === 'intermediate') this.goldIntermediate.push(mission);
			else if (missionType === 'advanced') this.goldAdvanced.push(mission);
			else this.goldCustom.push(mission);
			this.allMissions.push(mission);
		}
		for (let mission of mbpMissions) {
			let missionType = mission.type;
			if (missionType === 'beginner') this.platinumBeginner.push(mission);
			else if (missionType === 'intermediate') this.platinumIntermediate.push(mission);
			else if (missionType === 'advanced') this.platinumAdvanced.push(mission);
			else if (missionType === 'expert') this.platinumExpert.push(mission);
			else this.platinumCustom.push(mission);
			this.allMissions.push(mission);
		}
		for (let mission of mbuMissions) {
			let missionType = mission.type;
			if (missionType === 'beginner') this.ultraBeginner.push(mission);
			else if (missionType === 'intermediate') this.ultraIntermediate.push(mission);
			else if (missionType === 'advanced') this.ultraAdvanced.push(mission);
			else this.ultraCustom.push(mission);
			this.allMissions.push(mission);
		}

		// Strange case, but these two levels are in opposite order in the original game.
		Util.swapInArray(this.goldIntermediate, 11, 12);

		// Sort all custom levels lexicographically
		this.goldCustom.sort(Mission.compareLexicographically);
		this.platinumCustom.sort(Mission.compareLexicographically);
		this.ultraCustom.sort(Mission.compareLexicographically);

		for (let i = 0; i < this.goldBeginner.length; i++) this.goldBeginner[i].initSearchString();
		for (let i = 0; i < this.goldIntermediate.length; i++) this.goldIntermediate[i].initSearchString();
		for (let i = 0; i < this.goldAdvanced.length; i++) this.goldAdvanced[i].initSearchString();
		for (let i = 0; i < this.goldCustom.length; i++) this.goldCustom[i].initSearchString();

		for (let i = 0; i < this.platinumBeginner.length; i++) this.platinumBeginner[i].initSearchString();
		for (let i = 0; i < this.platinumIntermediate.length; i++) this.platinumIntermediate[i].initSearchString();
		for (let i = 0; i < this.platinumAdvanced.length; i++) this.platinumAdvanced[i].initSearchString();
		for (let i = 0; i < this.platinumExpert.length; i++) this.platinumExpert[i].initSearchString();
		for (let i = 0; i < this.platinumCustom.length; i++) this.platinumCustom[i].initSearchString();

		for (let i = 0; i < this.ultraBeginner.length; i++) this.ultraBeginner[i].initSearchString();
		for (let i = 0; i < this.ultraIntermediate.length; i++) this.ultraIntermediate[i].initSearchString();
		for (let i = 0; i < this.ultraAdvanced.length; i++) this.ultraAdvanced[i].initSearchString();
		for (let i = 0; i < this.ultraCustom.length; i++) this.ultraCustom[i].initSearchString();

		this.allCategories.push(
			this.goldBeginner,
			this.goldIntermediate,
			this.goldAdvanced,
			this.goldCustom,
			this.platinumBeginner,
			this.platinumIntermediate,
			this.platinumAdvanced,
			this.platinumExpert,
			this.platinumCustom,
			this.ultraBeginner,
			this.ultraIntermediate,
			this.ultraAdvanced,
			this.ultraCustom
		);
	}

	static getModification(arr: Mission[]) {
		return arr[0]?.modification ?? null;
	}

	static getDifficulty(arr: Mission[]) {
		return arr[0]?.type ?? null;
	}
}