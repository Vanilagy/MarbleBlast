import { PowerUp } from "./power_up";
import { AudioManager } from "../audio";
import { state } from "../state";
import { Vector3 } from "../math/vector3";
import { Quaternion } from "../math/quaternion";
import { BlendingType } from "../rendering/renderer";
import { Marble } from "../marble";

/** Accelerates the marble. */
export class SuperSpeed extends PowerUp {
	dtsPath = "shapes/items/superspeed.dts";
	pickUpName = (state.modification === 'gold')? "Super Speed PowerUp" : "Speed Booster PowerUp";
	sounds = ["pusuperspeedvoice.wav", "dosuperspeed.wav"];

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		let movementVector = new Vector3(1, 0, 0);
		movementVector.applyAxisAngle(new Vector3(0, 0, 1), marble.currentControlState.yaw);

		// Okay, so Super Speed directionality is a bit strange. In general, the direction is based on the normal vector of the last surface you had contact with.

		let quat = marble.orientationQuat;
		movementVector.applyQuaternion(quat);

		let quat2 = new Quaternion();
		quat2.setFromUnitVectors(marble.currentUp, marble.lastContactNormal); // Determine the necessary rotation to rotate the up vector to the contact normal.
		movementVector.applyQuaternion(quat2); // ...then rotate the movement bonus vector by that amount.

		marble.body.linearVelocity.addScaledVector(movementVector, 24.7); // Whirligig's determined value (ok it's actually 25 but we ain't changing it)
	}

	useCosmetically(marble: Marble): void {
		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.sounds[1], undefined, undefined, marble.body.position);
			this.game.renderer.particles.createEmitter(superSpeedParticleOptions, null, () => marble.body.position.clone());
		}, `${this.id} ${marble.id}useCosmetic`, marble !== this.game.localPlayer.controlledMarble);
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