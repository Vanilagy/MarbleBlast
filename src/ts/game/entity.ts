import { EntityState } from "../../../shared/game_server_format";
import { Util } from "../util";
import { Game } from "./game";
import { Player } from "./player";

export abstract class Entity {
	id: number;

	game: Game;
	/** Entities with lower update order will be updated first. */
	updateOrder = 0;
	applyUpdatesBeforeAdvance = false;
	sendAllUpdates = false;
	affectedBy = new Set<Player>();
	restartable = false;

	stateNeedsStore = false;
	internalStateNeedsStore = true; // Start out true so we store it once in the beninging... in the... in the beni... in the beninging (listen properly)

	constructor(game: Game) {
		this.game = game;
	}

	abstract update(): void;
	abstract render(): void;
	stop() {}
	postUpdate() {}

	beforeReconciliation() {}
	afterReconciliation() {}

	affect(otherObject: Entity) {
		this.game.state.recordEntityInteraction(this, otherObject);
	}

	clearInteractions() {
		this.affectedBy.clear();
		Util.filterInPlace(this.game.state.affectionGraph, x => x.from !== this && x.to !== this);
	}

	getState(): EntityState { return null; }
	getInitialState(): EntityState { return null; }
	loadState(state: EntityState, meta: { frame: number, remote: boolean }) {} // Todo: Define / write down somewhere that "remote" means that its a new update that came from the outside. If the same update is applied again later in a rewinding step, remote becomes false.

	restart(frame: number) {
		this.loadState(this.getInitialState(), { frame, remote: false });
	}

	getInternalState(): any { return null; }
	loadInternalState(state: any, frame: number) {}
}