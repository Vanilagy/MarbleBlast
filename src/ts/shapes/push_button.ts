import { Shape } from "../shape";
import { TimeState } from "../level";
import { Util } from "../util";

const ANIMATION_DURATION = 233.33433270454407;
const RESET_TIME = 5000;

/** A simple shape representing a button that is pushed down when the shape is touched. */
export class PushButton extends Shape {
	dtsPath = 'shapes/buttons/pushbutton.dts';
	useInstancing = true;
	lastContactTime = -Infinity;
	shareNodeTransforms = false;

	tick(time: TimeState, onlyVisual: boolean) {
		let currentCompletion = this.getCurrentCompletion(time);

		// Override the keyframe
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], currentCompletion * (this.dts.sequences[0].numKeyframes - 1));
		super.tick(time, onlyVisual);
	}

	/** Gets the current completion of the button pressedness. 0 = not pressed, 1 = completely pressed down. */
	getCurrentCompletion(time: TimeState) {
		let elapsed = time.timeSinceLoad - this.lastContactTime;
		let completion = Util.clamp(elapsed / ANIMATION_DURATION, 0, 1);
		if (elapsed > RESET_TIME) completion = Util.clamp(1 - (elapsed - RESET_TIME) / ANIMATION_DURATION, 0, 1);

		return completion;
	}

	onMarbleContact(time: TimeState) {
		let currentCompletion = this.getCurrentCompletion(time);
		// Only trigger the button if it's completely retracted
		if (currentCompletion === 0) this.lastContactTime = time.timeSinceLoad;

		this.level.replay.recordMarbleContact(this);
	}
}