import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { DefaultMap } from "../../../shared/default_map";
import { World } from "../physics/world";
import { Game } from "./game";

export const GAME_PLAYBACK_SPEED = 1; // Major attack surface for cheaters here 😟
export const MAX_TIME = 999 * 60 + 59 + 0.999; // 999:59.99, should be large enough

export class GameSimulator {
	game: Game;
	world: World;

	advanceTimes: number[] = [];
	nonDuplicatableEventFrames = new DefaultMap<string, number>(() => -1);
	isReconciling = false;

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

		//if (this.mission.hasBlast && this.blastAmount < 1) this.blastAmount = Util.clamp(this.blastAmount + 1000 / BLAST_CHARGE_TIME / PHYSICS_TICK_RATE, 0, 1);

		for (let entity of game.entities) {
			entity.owned = false;
			entity.update();
		}

		let playReplay = false;
		if (!playReplay) {
			//let gravityBefore = this.world.gravity.clone();
			//if (this.finishTime) this.world.gravity.setScalar(0);
			this.world.step(1 / GAME_UPDATE_RATE);
			//this.world.gravity.copy(gravityBefore);
		}

		for (let entity of game.entities) entity.postUpdate();

		for (let marble of game.marbles) marble.calculatePredictiveTransforms();

		game.state.saveStates();

		this.advanceTimes.push(performance.now());
	}

	executeNonDuplicatableEvent(fn: () => void, eventId: string, addSafetyMargin = false) {
		if (this.nonDuplicatableEventFrames.get(eventId) >= this.game.state.frame) return;

		this.nonDuplicatableEventFrames.set(eventId, this.game.state.maxFrame + (addSafetyMargin ? GAME_UPDATE_RATE / 5 : 0));
		fn();
	}
}