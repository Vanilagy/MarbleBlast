import { Shape } from "../shape";
import { Util } from "../util";
import { TimeState } from "../level";
import { MissionElementStaticShape, MisParser } from "../parsing/mis_parser";

const RESET_TIME = 5000;

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

		if (element.timeout) this.timeout = MisParser.parseNumber(element.timeout);
	}

	get animationDuration() {
		return this.dts.sequences[0].duration * 1000;
	}

	tick(time: TimeState, onlyVisual: boolean) {
		let currentCompletion = this.getCurrentCompletion(time);

		// Override the keyframe
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], currentCompletion * (this.dts.sequences[0].numKeyframes - 1));
		super.tick(time, onlyVisual);

		if (onlyVisual) return;

		let direction = Math.sign(currentCompletion - this.lastCompletion);
		if (direction !== 0 && direction !== this.lastDirection) {
			// If the direction has changed, play the sound
			this.level.audio.play(this.sounds[0], undefined, undefined, this.worldPosition);
		}

		this.lastCompletion = currentCompletion;
		this.lastDirection = direction;
	}

	/** Gets the current completion of the trapdoor openness. 0 = closed, 1 = open. */
	getCurrentCompletion(time: TimeState) {
		let elapsed = time.timeSinceLoad - this.lastContactTime;
		let completion = Util.clamp(elapsed / this.animationDuration, 0, 1);
		if (elapsed > RESET_TIME) completion = Util.clamp(1 - (elapsed - RESET_TIME) / this.animationDuration, 0, 1);

		return completion;
	}

	onMarbleContact() {
		let time = this.level.timeState;

		if (time.timeSinceLoad - this.lastContactTime <= 0) return; // The trapdoor is queued to open, so don't do anything.
		let currentCompletion = this.getCurrentCompletion(time);

		// Set the last contact time accordingly so that the trapdoor starts closing (again)
		this.lastContactTime = time.timeSinceLoad - currentCompletion * this.animationDuration;
		if (currentCompletion === 0) this.lastContactTime += this.timeout;

		this.level.replay.recordMarbleContact(this);
	}
}