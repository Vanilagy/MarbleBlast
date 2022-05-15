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
	static platinumCustom: Mission[] = []; // todo: I think some hunt levels snuck in here, how to handle these?

	static ultraBeginner: Mission[] = [];
	static ultraIntermediate: Mission[] = [];
	static ultraAdvanced: Mission[] = [];
	static ultraCustom: Mission[] = [];

	static huntPlatinumBeginner: Mission[] = [];
	static huntPlatinumIntermediate: Mission[] = [];
	static huntPlatinumAdvanced: Mission[] = [];
	static huntPlatinumCustom: Mission[] = [];

	static huntUltraBeginner: Mission[] = [];
	static huntUltraIntermediate: Mission[] = [];
	static huntUltraAdvanced: Mission[] = [];
	static huntUltraCustom: Mission[] = [];

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

			if (mission.gameMode === 'hunt' && mission.modification === 'platinum' && mission.type === 'beginner')
				this.huntPlatinumBeginner.push(mission);
			else if (mission.gameMode === 'hunt' && mission.modification === 'platinum' && mission.type === 'intermediate')
				this.huntPlatinumIntermediate.push(mission);
			else if (mission.gameMode === 'hunt' && mission.modification === 'platinum' && mission.type === 'advanced')
				this.huntPlatinumAdvanced.push(mission);
			else if (mission.gameMode === 'hunt' && mission.modification === 'ultra' && mission.type === 'beginner')
				this.huntUltraBeginner.push(mission);
			else if (mission.gameMode === 'hunt' && mission.modification === 'ultra' && mission.type === 'intermediate')
				this.huntUltraIntermediate.push(mission);
			else if (mission.gameMode === 'hunt' && mission.modification === 'ultra' && mission.type === 'advanced')
				this.huntUltraAdvanced.push(mission);
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

		this.allMissionArrays.push(
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
			this.ultraCustom,
			this.huntPlatinumBeginner,
			this.huntPlatinumIntermediate,
			this.huntPlatinumAdvanced,
			this.huntPlatinumCustom,
			this.huntUltraBeginner,
			this.huntUltraIntermediate,
			this.huntUltraAdvanced,
			this.huntUltraCustom
		);

		for (let arr of this.allMissionArrays) for (let i = 0; i < arr.length; i++) {
			arr[i].initSearchString(i);
			this.allMissions.push(arr[i]);
		}
	}

	static getModification(arr: Mission[]) {
		return arr[0]?.modification ?? null;
	}

	static getDifficulty(arr: Mission[]) {
		return arr[0]?.type ?? null;
	}
}