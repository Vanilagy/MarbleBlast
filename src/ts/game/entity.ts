import { EntityState } from "../../../shared/game_server_format";
import { Util } from "../util";
import { Game } from "./game";
import { Player } from "./player";

export abstract class Entity {
	id: number;

	game: Game;
	owned = false;
	version = 0;
	/** Entities with lower update order will be updated first. */
	updateOrder = 0;
	applyUpdatesBeforeAdvance = false;
	sendAllUpdates = false;
	affectedBy = new Map<Player, number>();

	stateNeedsStore = false;
	internalStateNeedsStore = true; // Start out true so we store it once in the beninging... in the... in the beni... in the beninging (listen properly)

	constructor(game: Game) {
		this.game = game;
	}

	abstract update(): void;
	abstract render(): void;
	abstract stop(): void;
	postUpdate() {}

	beforeReconciliation() {}
	afterReconciliation() {}

	interactWith(otherObject: Entity) {
		this.game.state.recordEntityInteraction(this, otherObject);
	}

	clearInteractions() {
		this.affectedBy.clear();
		Util.filterInPlace(this.game.state.affectionGraph, x => x.from !== this && x.to !== this);
	}

	getState(): EntityState { return null; }
	getInitialState(): EntityState { return null; }
	loadState(state: EntityState, meta: { frame: number, remote: boolean }) {}

	getInternalState(): any { return null; }
	loadInternalState(state: any, frame: number) {}
}