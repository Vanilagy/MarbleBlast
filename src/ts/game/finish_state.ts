import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { AudioManager } from "../audio";
import { G } from "../global";
import { hideTouchControls, resetPressedFlag } from "../input";
import { Marble } from "../marble";
import { EndPad } from "../shapes/end_pad";
import { Gem } from "../shapes/gem";
import { Util } from "../util";
import { MAX_TIME } from "./clock";
import { Entity } from "./entity";
import { Game } from "./game";

type FinishStateState = EntityState & { entityType: 'finishState' };

export class FinishState extends Entity {
	restartable = true;

	finished = false;
	frame: number = null;
	time: number = null;
	elapsedTime: number = null;
	isLegal = true;

	constructor(game: Game, id: number) {
		super(game);
		this.id = id;
	}

	tryFinish(marble: Marble, t = 1) {
		if (this.finished) return;

		let endPad = Util.findLast(this.game.shapes, (shape) => shape instanceof EndPad) as EndPad;
		let gemCount = this.game.shapes.filter(x => x instanceof Gem && x.pickedUpBy).length;

		if (gemCount < this.game.totalGems) {
			AudioManager.play('missinggems.wav', undefined, undefined, endPad?.worldPosition);
			G.menu.hud.displayAlert(() => {
				if (this.game.localPlayer.controlledMarble !== marble) return null;
				return (G.modification === 'gold')? "You can't finish without all the gems!!" : "You may not finish without all the diamonds!";
			}, this.game.state.frame);
		} else {
			// Check if the player is OOB, but still allow finishing with less than half a second of having been OOB
			let finishIsLegal = marble.outOfBoundsFrame === null || this.game.state.frame - marble.outOfBoundsFrame < 0.5 * GAME_UPDATE_RATE;
			let toSubtract = (1 - t) / GAME_UPDATE_RATE;

			this.finished = true;
			this.frame = this.game.state.frame;
			this.time = Util.clamp(this.game.clock.time - toSubtract, 0, MAX_TIME);
			this.elapsedTime = Util.clamp(this.game.clock.elapsedTime - toSubtract, 0, MAX_TIME);
			this.isLegal = finishIsLegal;

			this.stateNeedsStore = true;
			marble.enableFinishState();

			marble.affect(this);
			this.affect(marble);
			this.game.clock.affect(this);
			this.affect(this.game.clock);
			for (let gem of this.game.shapes.filter(x => x instanceof Gem)) {
				gem.affect(this);
				this.affect(gem); // Because we require the gem to be picked up for our state to be how it is
			}

			if (!finishIsLegal) {
				// Todo: In multiplayer, if the game doesn't restart automatically, the players should be able to pause and restart. Pause usually doesn't work tho when the finish state is set
				this.playCosmeticEffects(endPad);
				return;
			}

			// When we reach this point, the level has been completed successfully.
			if (this.game.type === 'singleplayer') this.finish(endPad);
			else { /* todo */ }
		}
	}

	finish(endPad: EndPad) {
		this.playCosmeticEffects(endPad);

		for (let marble of this.game.marbles) {
			marble.enableFinishState();
			this.affect(marble);
		}

		// Schedule the finish screen to be shown
		setTimeout(() => {
			// Show the finish screen
			document.exitPointerLock?.();
			G.menu.finishScreen.show();
			hideTouchControls();

			resetPressedFlag('use');
			resetPressedFlag('jump');
			resetPressedFlag('restart');
		}, 2000);
	}

	playCosmeticEffects(endPad?: EndPad) {
		endPad?.spawnFirework(); // EndPad *might* not exist, in that case no fireworks lol
		G.menu.hud.displayAlert(() => "Congratulations! You've finished!", this.game.state.frame);
	}

	getState(): FinishStateState {
		return {
			entityType: 'finishState',
			finishFrame: this.frame,
			finishTime: this.time,
			finishElapsedTime: this.elapsedTime,
			isLegal: this.isLegal
		};
	}

	getInitialState(): FinishStateState {
		return {
			entityType: 'finishState',
			finishFrame: null,
			finishTime: null,
			finishElapsedTime: null,
			isLegal: true
		};
	}

	loadState(state: FinishStateState, { remote }: { remote: boolean }) {
		if (remote) console.trace(state, remote);

		this.finished = state.finishFrame !== null;
		this.frame = state.finishFrame;
		this.time = state.finishTime;
		this.elapsedTime = state.finishElapsedTime;
		this.isLegal = state.isLegal;

		if (remote && this.finished && this.isLegal) {
			let endPad = Util.findLast(this.game.shapes, (shape) => shape instanceof EndPad) as EndPad;
			this.finish(endPad);
		}
	}

	update() {}
	render() {}
}