import { EntityState } from "../../../shared/game_server_format";
import { MisParser } from "../../../shared/mis_parser";
import { Util } from "../util";
import { Entity } from "./entity";
import { Game } from "./game";
import { Gem } from "./shapes/gem";

type GemSpawnStateState = EntityState & { entityType: 'gemSpawnState' };

export class GemSpawnState extends Entity {
	n = 0;
	currentSpawns = new Set<Gem>();
	lastSpawnFrame = 0;
	lastFinalGem: Gem = null;

	constructor(game: Game, id: number) {
		super(game);
		this.id = id;

		this.computeGemSpawns();
	}

	computeGemSpawns() {
		const spawnCount = MisParser.parseNumber(this.game.mission.missionInfo.maxgemsperspawn) || 7;
		const spawnRadius = MisParser.parseNumber(this.game.mission.missionInfo.radiusfromgem) || 15;
		const spawnBlock = MisParser.parseNumber(this.game.mission.missionInfo.spawnblock) || spawnRadius * 2; // The radius around the last picked-up gem in which no new center gem can be chosen ("blocked" from spawning)

		let gems = this.game.shapes.filter(x => x instanceof Gem) as Gem[];
		let centerGemCandidates = gems.filter(x => !this.lastFinalGem || this.lastFinalGem.worldPosition.distanceTo(x.worldPosition) >= spawnBlock) as Gem[];
		if (centerGemCandidates.length === 0) centerGemCandidates = gems;
		let centerGem = centerGemCandidates[Math.floor(Util.seededRandom(this.game.seed + this.id, this.n) * centerGemCandidates.length)];

		let closestGems = gems.slice()
			.sort((a, b) => a.worldPosition.distanceToSquared(centerGem.worldPosition) - b.worldPosition.distanceToSquared(centerGem.worldPosition))
			.filter((x, i) => x !== this.lastFinalGem && i < spawnCount && x.worldPosition.distanceTo(centerGem.worldPosition) < spawnRadius);

		this.currentSpawns.clear();
		for (let gem of closestGems) this.currentSpawns.add(gem);
	}

	advance(causedBy: Gem) {
		this.n++;
		this.stateNeedsStore = true;

		this.lastFinalGem = causedBy;
		this.lastSpawnFrame = this.game.state.frame;
		this.computeGemSpawns();
	}

	update() {}
	render() {}

	getState(): GemSpawnStateState {
		return {
			entityType: 'gemSpawnState',
			n: this.n,
			lastSpawnFrame: this.lastSpawnFrame,
			lastFinalGem: this.lastFinalGem?.id ?? null
		};
	}

	getInitialState(): GemSpawnStateState {
		return {
			entityType: 'gemSpawnState',
			n: 0,
			lastSpawnFrame: this.lastSpawnFrame,
			lastFinalGem: null
		};
	}

	loadState(state: GemSpawnStateState) {
		let different = state.n !== this.n;

		this.n = state.n;
		this.lastSpawnFrame = state.lastSpawnFrame;
		this.lastFinalGem = this.game.getEntityById(state.lastFinalGem) as Gem;

		if (different) this.computeGemSpawns();
	}
}