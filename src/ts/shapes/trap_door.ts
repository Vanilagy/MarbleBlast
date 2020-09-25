import { Shape } from "../shape";
import { Util } from "../util";
import OIMO from "../declarations/oimo";

const ANIMATION_DURATION = 1666.6676998138428;
const RESET_TIME = 5000;

export class TrapDoor extends Shape {
	dtsPath = "shapes/hazards/trapdoor.dts";
	lastContactTime = -Infinity;

	tick(time: number) {
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], this.getCurrentCompletion(time) * (this.dts.sequences[0].numKeyframes - 1));
		super.tick(time);
	}

	getCurrentCompletion(time: number) {
		let elapsed = time - this.lastContactTime;
		let completion = Util.clamp(elapsed / ANIMATION_DURATION, 0, 1);
		if (elapsed > RESET_TIME) completion = Util.clamp(1 - (elapsed - RESET_TIME) / ANIMATION_DURATION, 0, 1);

		return completion;
	}

	onMarbleContact(contact: OIMO.Contact, time: number) {
		let currentCompletion = this.getCurrentCompletion(time);

		this.lastContactTime = time - currentCompletion * ANIMATION_DURATION;
	}
}