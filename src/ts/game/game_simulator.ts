import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { DefaultMap } from "../../../shared/default_map";
import { World } from "../physics/world";
import { Game } from "./game";

export const GAME_PLAYBACK_SPEED = 1; // Major attack surface for cheaters here 😟

export class GameSimulator {
	game: Game;
	world: World;

	advanceTimes: number[] = [];
	nonDuplicatableEventFrames = new DefaultMap<string, number>(() => -1);
	isReconciling = false;
	maxExecutedRestartFrame = -Infinity;

	constructor(game: Game) {
		this.game = game;

		this.world = new World();
	}

	update() {
		this.advance();
	}

	advance() {
		let { game } = this;

		game.state.frame++;
		game.state.maxFrame = Math.max(game.state.frame, game.state.maxFrame);

		if (game.state.restartFrames.includes(game.state.frame)) {
			game.state.restart(game.state.frame);
			this.maxExecutedRestartFrame = Math.max(game.state.frame, this.maxExecutedRestartFrame);
		}

		for (let entity of game.entities) entity.update();

		let playReplay = false;
		if (!playReplay) this.world.step(1 / GAME_UPDATE_RATE);

		for (let entity of game.entities) entity.postUpdate();

		game.state.saveStates();

		this.advanceTimes.push(performance.now());
	}

	executeNonDuplicatableEvent(fn: () => void, eventId: string, addSafetyMargin = false) {
		if (this.nonDuplicatableEventFrames.get(eventId) >= this.game.state.frame) return;

		this.nonDuplicatableEventFrames.set(eventId, this.game.state.maxFrame + (addSafetyMargin ? GAME_UPDATE_RATE / 5 : 0));
		fn();
	}
}