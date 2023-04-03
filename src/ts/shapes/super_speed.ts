import { PowerUp } from "./power_up";
import { state } from "../state";
import { Vector3 } from "../math/vector3";
import { Quaternion } from "../math/quaternion";
import { BlendingType } from "../rendering/renderer";

/** Accelerates the marble. */
export class SuperSpeed extends PowerUp {
	dtsPath = "shapes/items/superspeed.dts";
	pickUpName = (state.modification === 'gold')? "Super Speed PowerUp" : "Speed Booster PowerUp";
	sounds = ["pusuperspeedvoice.wav", "dosuperspeed.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {
		let level = this.level;
		let marble = this.level.marble;
		let movementVector = new Vector3(1, 0, 0);
		movementVector.applyAxisAngle(new Vector3(0, 0, 1), level.yaw);

		// Okay, so Super Speed directionality is a bit strange. In general, the direction is based on the normal vector of the last surface you had contact with.

		let quat = level.newOrientationQuat;
		movementVector.applyQuaternion(quat);

		let quat2 = new Quaternion();
		quat2.setFromUnitVectors(this.level.currentUp, marble.lastContactNormal); // Determine the necessary rotation to rotate the up vector to the contact normal.
		movementVector.applyQuaternion(quat2); // ...then rotate the movement bonus vector by that amount.

		marble.body.linearVelocity.addScaledVector(movementVector, 24.7); // Whirligig's determined value (ok it's actually 25 but we ain't changing it)

		this.level.audio.play(this.sounds[1]);
		this.level.particles.createEmitter(superSpeedParticleOptions, null, () => marble.body.position.clone());

		this.level.deselectPowerUp();
	}
}

export const superSpeedParticleOptions = {
	ejectionPeriod: 5,
	ambientVelocity: new Vector3(0, 0, 0.2),
	ejectionVelocity: 1 * 0.5,
	velocityVariance: 0.25 * 0.5,
	emitterLifetime: 1100,
	inheritedVelFactor: 0.25,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: BlendingType.Additive,
		spinSpeed: 0,
		spinRandomMin: 0,
		spinRandomMax: 0,
		lifetime: 1500,
		lifetimeVariance: 150,
		dragCoefficient: 0.25,
		acceleration: 0,
		colors: [{r: 0.8, g: 0.8, b: 0, a: 0}, {r: 0.8, g: 0.8, b: 0, a: 1}, {r: 0.8, g: 0.8, b: 0, a: 0}],
		sizes: [0.25, 0.25, 1],
		times: [0, 0.25, 1]
	}
};