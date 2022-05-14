import { Shape } from "../shape";
import { Util } from "../util";
import { AudioManager } from "../audio";
import { Collision } from "../physics/collision";
import { Marble } from "../marble";
import { EntityState } from "../../../shared/game_server_format";

type BumperState = EntityState & { entityType: 'bumper' };

/** A bumper is a shape which knocks the marble away on contact. */
export abstract class Bumper extends Shape {
	lastContactTime = -Infinity;
	shareNodeTransforms = false;

	get animationDuration() {
		return this.dts.sequences[0].duration;
	}

	onMarbleContact(collision: Collision, marble: Marble) {
		let time = this.game.state.time;

		this.lastContactTime = time;

		// Set the velocity along the contact normal, but make sure it's capped
		marble.setLinearVelocityInDirection(collision.normal, 15, false);
		marble.slidingTimeout = 2; // Make sure we don't slide on the bumper after bouncing off it

		this.affect(marble);
		this.stateNeedsStore = true;

		this.playSound(marble === this.game.localPlayer.controlledMarble);
	}

	render() {
		let currentCompletion = Util.clamp((this.game.state.time - this.lastContactTime) / this.animationDuration, 0, 1);

		// Override the keyframe for the "wiggle" effect
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], currentCompletion * (this.dts.sequences[0].numKeyframes - 1));

		super.render();
	}

	getState(): BumperState {
		return {
			entityType: 'bumper',
			lastContactTime: this.lastContactTime
		};
	}

	getInitialState(): BumperState {
		return {
			entityType: 'bumper',
			lastContactTime: -Infinity
		};
	}

	loadState(state: BumperState) {
		if (state.lastContactTime > this.lastContactTime) this.playSound(true);
		this.lastContactTime = state.lastContactTime;
	}

	playSound(safetyMargin: boolean) {
		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.sounds[0], undefined, undefined, this.worldPosition);
		}, `${this.id}sound`, safetyMargin);
	}
}