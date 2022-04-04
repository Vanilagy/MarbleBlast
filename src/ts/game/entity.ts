import { EntityState } from "../../../shared/game_server_format";
import { Game } from "./game";

export abstract class Entity<T extends EntityState = EntityState, U = any> {
	abstract id: number;

	game: Game;
	owned = false;
	version = 0;
	challengeable = false;

	stateNeedsStore = false;
	internalStateNeedsStore = true; // Start out true so we store it once in the beninging... in the... in the beni... in the beninging (listen properly)

	constructor(game: Game) {
		this.game = game;
	}

	abstract update(): void;
	abstract render(): void;
	abstract reset(): void;
	abstract stop(): void;

	abstract getCurrentState(): T;
	abstract getInitialState(): T;
	abstract loadState(state: T, meta: { frame: number, remote: boolean }): void;

	beforeReconciliation() {}
	afterReconciliation() {}

	interactWith(otherObject: Entity) {
		this.game.state.recordEntityInteraction(this, otherObject);
	}

	getInternalState(): U { return null; }
	loadInternalState(state: U, frame: number) {}
}