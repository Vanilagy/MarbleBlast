import { GameObjectState } from "../../../shared/game_server_format";
import { Game } from "./game";

export abstract class GameObject<T extends GameObjectState = GameObjectState> {
	abstract id: number;

	game: Game;
	hasChangedState = false;

	constructor(game: Game) {
		this.game = game;
	}

	abstract update(): void;
	abstract render(): void;
	abstract reset(): void;
	abstract stop(): void;

	abstract getCurrentState(): T;
	abstract getInitialState(): T;
	abstract loadState(state: T): void;

	beforeReconciliation() {}
	afterReconciliation() {}

	interactWith(otherObject: GameObject) {
		this.game.state.recordGameObjectInteraction(this, otherObject);
	}
}