import { Shape } from "../shape";
import { Util } from "../util";
import { TimeState } from "../level";
import { Collision } from "../physics/collision";

/** A bumper is a shape which knocks the marble away on contact. */
export abstract class AbstractBumper extends Shape {
	wiggleAnimationStart = -Infinity;
	shareNodeTransforms = false;

	get animationDuration() {
		return this.dts.sequences[0].duration * 1000;
	}

	onMarbleContact(collision: Collision) {
		let time = this.level.timeState;

		this.wiggleAnimationStart = time.timeSinceLoad;
		this.level.audio.play(this.sounds[0]);

		if (!collision) return; // We're probably in a replay if this is the case

		let marble = this.level.marble;

		// Set the velocity along the contact normal, but make sure it's capped
		marble.setLinearVelocityInDirection(collision.normal, 15, false);
		marble.slidingTimeout = 2; // Make sure we don't slide on the bumper after bouncing off it

		this.level.replay.recordMarbleContact(this);
	}

	render(time: TimeState) {
		let currentCompletion = Util.clamp((time.timeSinceLoad - this.wiggleAnimationStart) / this.animationDuration, 0, 1);

		// Override the keyframe for the "wiggle" effect
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], currentCompletion * (this.dts.sequences[0].numKeyframes - 1));

		super.render(time);
	}
}