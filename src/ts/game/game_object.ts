import { GameObjectState } from "../../../shared/game_server_format";
import { Game } from "./game";

export abstract class GameObject<T extends GameObjectState = GameObjectState> {
	abstract id: number;

	game: Game;
	hasChangedState = false;

	prevCertainty = 1;
	certainty = 1;
	certaintyRetention = 1;

	constructor(game: Game) {
		this.game = game;
	}

	updateCertainty() {
		this.prevCertainty = this.certainty;
		this.certainty *= this.certaintyRetention;
	}

	abstract update(): void;
	abstract render(): void;
	abstract reset(): void;
	abstract stop(): void;

	abstract getCurrentState(): T;
	abstract getInitialState(): T;
	abstract loadState(state: T): void;

	beforeReconciliation() {}
	afterReconciliation(reconciliationTickLength: number) {}
}