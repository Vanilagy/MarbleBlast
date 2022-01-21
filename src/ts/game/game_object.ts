import { Game } from "./game";

export abstract class GameObject<T extends object = any> {
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
	abstract loadState(state: T): void;
}