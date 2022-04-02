import { EntityState } from "../../../shared/game_server_format";
import { Game } from "./game";

export abstract class Entity<T extends EntityState = EntityState> {
	abstract id: number;

	game: Game;
	hasChangedState = false;
	owned = false;
	version = 0;
	challengeable = false;

	constructor(game: Game) {
		this.game = game;
	}

	abstract update(): void;
	abstract render(): void;
	abstract reset(): void;
	abstract stop(): void;

	abstract getCurrentState(): T;
	abstract getInitialState(): T;
	abstract loadState(state: T, frame: number): void;

	beforeReconciliation() {}
	afterReconciliation() {}

	interactWith(otherObject: Entity) {
		this.game.state.recordEntityInteraction(this, otherObject);
	}
}