import { Shape } from "../shape";
import { Util } from "../util";
import { TimeState } from "../level";
import { AudioManager } from "../audio";
import THREE from "three";
import { Collision } from "../physics/collision";

/** A bumper is a shape which knocks the marble away on contact. */
export abstract class AbstractBumper extends Shape {
	wiggleAnimationStart = -Infinity;

	onMarbleContact(collision: Collision) {
		let time = this.level.timeState;

		this.wiggleAnimationStart = time.timeSinceLoad;
		AudioManager.play(this.sounds[0]);

		if (!collision) return; // We're probably in a replay if this is the case

		let marble = this.level.marble;

		// Set the velocity along the contact normal, but make sure it's capped
		marble.setLinearVelocityInDirection(collision.normal, 15, false);
		marble.slidingTimeout = 2; // Make sure we don't slide on the bumper after bouncing off it

		this.level.replay.recordMarbleContact(this);
	}

	render(time: TimeState) {
		super.render(time);

		// Create the "wiggle" effect
		let elapsed = Math.min(1e10, time.timeSinceLoad - this.wiggleAnimationStart);
		let wiggleFactor = Util.clamp(1 - elapsed / 333, 0, 1);
		let sine = Util.lerp(0, Math.sin(elapsed / 50), wiggleFactor);
		let wiggleX = 1 + 0.4 * sine;
		let wiggleY = 1 - 0.4 * sine;

		this.group.transform.compose(this.worldPosition, this.worldOrientation, new THREE.Vector3(this.worldScale.x * wiggleX, this.worldScale.y * wiggleY, this.worldScale.z));
		this.group.changedTransform();
	}
}