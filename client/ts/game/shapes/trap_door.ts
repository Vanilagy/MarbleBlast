import { InternalShapeState, Shape } from "../shape";
import { Util } from "../../util";
import { MissionElementStaticShape, MisParser } from "../../../../shared/mis_parser";
import { AudioManager } from "../../audio";
import { EntityState } from "../../../../shared/game_server_format";
import { Collision } from "../../physics/collision";
import { Marble } from "../marble";

const RESET_TIME = 5;

type TrapDoorState = EntityState & { entityType: 'trapDoor' };

type InternalTrapDoorState = InternalShapeState & {
	lastCompletion: number,
	lastDirection: number
};

/** Trap doors open on contact. */
export class TrapDoor extends Shape {
	dtsPath = "shapes/hazards/trapdoor.dts";
	hasNonVisualSequences = true;
	shareNodeTransforms = false;
	lastContactTime = -Infinity;
	/** The time it takes from the moment of touching the trapdoor to it opening. */
	timeout = 0;
	lastDirection: number;
	lastCompletion = 0;
	sounds = ['trapdooropen.wav'];

	constructor(element: MissionElementStaticShape) {
		super();

		if (element.timeout) this.timeout = MisParser.parseNumber(element.timeout) / 1000;
	}

	get animationDuration() {
		return this.dts.sequences[0].duration;
	}

	update(onlyVisual?: boolean) {
		let currentCompletion = this.getCurrentCompletion();

		// Override the keyframe
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], currentCompletion * (this.dts.sequences[0].numKeyframes - 1));
		super.update(onlyVisual);

		if (onlyVisual) return;

		let direction = Math.sign(currentCompletion - this.lastCompletion);
		if (direction !== 0 && direction !== this.lastDirection) {
			// If the direction has changed, play the sound
			this.game.simulator.executeNonDuplicatableEvent(() => {
				AudioManager.play(this.sounds[0], 1, AudioManager.soundGain, this.worldPosition);
			}, `${this.id}sound`, true);
		}

		if (this.lastCompletion !== currentCompletion || this.lastDirection !== direction) {
			this.lastCompletion = currentCompletion;
			this.lastDirection = direction;
			this.internalStateNeedsStore = true;
		}
	}

	/** Gets the current completion of the trapdoor openness. 0 = closed, 1 = open. */
	getCurrentCompletion() {
		let elapsed = this.game.state.time - this.lastContactTime;
		let completion = Util.clamp(elapsed / this.animationDuration, 0, 1);
		if (elapsed > RESET_TIME) completion = Util.clamp(1 - (elapsed - RESET_TIME) / this.animationDuration, 0, 1);

		return completion;
	}

	onMarbleContact(collision: Collision, marble: Marble) {
		this.affect(marble);

		let time = this.game.state.time;
		if (time - this.lastContactTime <= 0) return; // The trapdoor is queued to open, so don't do anything.

		let currentCompletion = this.getCurrentCompletion();

		// Set the last contact time accordingly so that the trapdoor starts closing (again)
		this.lastContactTime = time - currentCompletion * this.animationDuration;
		if (currentCompletion === 0) this.lastContactTime += this.timeout;

		this.stateNeedsStore = true;
		marble.affect(this);
	}

	getState(): TrapDoorState {
		return {
			entityType: 'trapDoor',
			lastContactTime: this.lastContactTime
		};
	}

	getInitialState(): TrapDoorState {
		return {
			entityType: 'trapDoor',
			lastContactTime: -Infinity
		};
	}

	loadState(state: TrapDoorState) {
		this.lastContactTime = state.lastContactTime;
	}

	getInternalState(): InternalTrapDoorState {
		return {
			...super.getInternalState(),
			lastCompletion: this.lastCompletion,
			lastDirection: this.lastDirection
		};
	}

	loadInternalState(state: InternalTrapDoorState) {
		super.loadInternalState(state);

		this.lastCompletion = state.lastCompletion;
		this.lastDirection = state.lastDirection;
	}
}