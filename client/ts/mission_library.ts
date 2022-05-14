import { Mission } from "./mission";
import { CLAEntry, OfficialMissionDescription } from "../../shared/types";
import { ResourceManager } from "./resources";
import { Util } from "./util";

export abstract class MissionLibrary {
	static allMissions: Mission[] = [];

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

	static multiplayer: Mission[] = [];

	static allMissionArrays: Mission[][] = [];

	/** Loads all missions. */
	static async init() {
		// Do a single request to get a list of all missions
		let missions = await ResourceManager.readBlobAsJson(await ResourceManager.loadResource('/api/missions')) as {
			officialMissions: OfficialMissionDescription[],
			goldCustoms: CLAEntry[],
			platinumCustoms: CLAEntry[],
			ultraCustoms: CLAEntry[]
		};

		missions.officialMissions.sort((a, b) => a.index - b.index);

		for (let description of missions.officialMissions) {
			let mission = Mission.fromOfficialMissionDescription(description);

			if (mission.gameMode === 'hunt')
				this.multiplayer.push(mission);

			else if (mission.modification === 'gold' && mission.type === 'beginner')
				this.goldBeginner.push(mission);
			else if (mission.modification === 'gold' && mission.type === 'intermediate')
				this.goldIntermediate.push(mission);
			else if (mission.modification === 'gold' && mission.type === 'advanced')
				this.goldAdvanced.push(mission);
			else if (mission.modification === 'gold')
				this.goldCustom.push(mission);
			else if (mission.modification === 'platinum' && mission.type === 'beginner')
				this.platinumBeginner.push(mission);
			else if (mission.modification === 'platinum' && mission.type === 'intermediate')
				this.platinumIntermediate.push(mission);
			else if (mission.modification === 'platinum' && mission.type === 'advanced')
				this.platinumAdvanced.push(mission);
			else if (mission.modification === 'platinum' && mission.type === 'expert')
				this.platinumExpert.push(mission);
			else if (mission.modification === 'platinum')
				this.platinumCustom.push(mission);
			else if (mission.modification === 'ultra' && mission.type === 'beginner')
				this.ultraBeginner.push(mission);
			else if (mission.modification === 'ultra' && mission.type === 'intermediate')
				this.ultraIntermediate.push(mission);
			else if (mission.modification === 'ultra' && mission.type === 'advanced')
				this.ultraAdvanced.push(mission);
			else if (mission.modification === 'ultra')
				this.ultraCustom.push(mission);

			this.allMissions.push(mission);
		}

		// Filter the custom levels some:
		Util.filterInPlace(missions.goldCustoms, x => x.modification === 'gold'); // Apparently some platinum levels snuck in
		Util.filterInPlace(missions.platinumCustoms, x => x.gameType === 'single' && (!x.gameMode || x.gameMode === 'null')); // Whoops, forgot to filter the JSON
		Util.filterInPlace(missions.ultraCustoms, x => x.gameType === 'single');

		// Remove duplicate Platinum levels
		let platCustomNames = new Set<string>();
		for (let i = 0; i < missions.platinumCustoms.length; i++) {
			let mission = missions.platinumCustoms[i];
			let identifier = mission.name + mission.desc; // Assume this makes a mission unique

			if (platCustomNames.has(identifier)) {
				missions.platinumCustoms.splice(i--, 1);
			} else {
				platCustomNames.add(identifier);
			}
		}

		// Create all custom missions
		for (let custom of [...missions.goldCustoms, ...missions.platinumCustoms, ...missions.ultraCustoms]) {
			let mission = Mission.fromCLAEntry(custom, false);
			if (mission.modification === 'gold') this.goldCustom.push(mission);
			else if (mission.modification === 'ultra') this.ultraCustom.push(mission);
			else this.platinumCustom.push(mission);
		}

		// Strange case, but these two levels are in opposite order in the original game.
		Util.swapInArray(this.goldIntermediate, 11, 12);

		// Sort all custom levels alphabetically
		const sortFn2 = (a: Mission, b: Mission) => Util.normalizeString(a.title).localeCompare(Util.normalizeString(b.title), undefined, { numeric: true, sensitivity: 'base' });
		this.goldCustom.sort(sortFn2);
		this.platinumCustom.sort(sortFn2);
		this.ultraCustom.sort(sortFn2);

		// Apparently, these two levels are swapped
		Util.swapInArray(this.goldIntermediate, 11, 12);

		for (let i = 0; i < this.goldBeginner.length; i++) this.goldBeginner[i].initSearchString(i);
		for (let i = 0; i < this.goldIntermediate.length; i++) this.goldIntermediate[i].initSearchString(i);
		for (let i = 0; i < this.goldAdvanced.length; i++) this.goldAdvanced[i].initSearchString(i);
		for (let i = 0; i < this.goldCustom.length; i++) this.goldCustom[i].initSearchString(i);

		for (let i = 0; i < this.platinumBeginner.length; i++) this.platinumBeginner[i].initSearchString(i);
		for (let i = 0; i < this.platinumIntermediate.length; i++) this.platinumIntermediate[i].initSearchString(i);
		for (let i = 0; i < this.platinumAdvanced.length; i++) this.platinumAdvanced[i].initSearchString(i);
		for (let i = 0; i < this.platinumExpert.length; i++) this.platinumExpert[i].initSearchString(i);
		for (let i = 0; i < this.platinumCustom.length; i++) this.platinumCustom[i].initSearchString(i);

		for (let i = 0; i < this.ultraBeginner.length; i++) this.ultraBeginner[i].initSearchString(i);
		for (let i = 0; i < this.ultraIntermediate.length; i++) this.ultraIntermediate[i].initSearchString(i);
		for (let i = 0; i < this.ultraAdvanced.length; i++) this.ultraAdvanced[i].initSearchString(i);
		for (let i = 0; i < this.ultraCustom.length; i++) this.ultraCustom[i].initSearchString(i);

		for (let i = 0; i < this.multiplayer.length; i++) this.multiplayer[i].initSearchString(i);

		this.allMissionArrays.push(this.goldBeginner, this.goldIntermediate, this.goldAdvanced, this.goldCustom, this.platinumBeginner, this.platinumIntermediate, this.platinumAdvanced, this.platinumExpert, this.platinumCustom, this.ultraBeginner, this.ultraIntermediate, this.ultraAdvanced, this.ultraCustom); // Todo what to do about multiplayer missions here
	}

	static getModification(arr: Mission[]) {
		return arr[0]?.modification ?? null;
	}

	static getDifficulty(arr: Mission[]) {
		return arr[0]?.type ?? null;
	}
}