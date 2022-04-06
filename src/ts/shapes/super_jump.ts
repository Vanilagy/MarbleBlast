import { PowerUp } from "./power_up";
import { AudioManager } from "../audio";
import { state } from "../state";
import { Vector3 } from "../math/vector3";
import { BlendingType } from "../rendering/renderer";
import { Marble } from "../marble";

/** Gives the marble an upwards boost. */
export class SuperJump extends PowerUp {
	dtsPath = "shapes/items/superjump.dts";
	pickUpName = (state.modification === 'gold')? "Super Jump PowerUp" : "Jump Boost PowerUp";
	sounds = ["pusuperjumpvoice.wav", "dosuperjump.wav"];

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		marble.body.linearVelocity.addScaledVector(marble.currentUp, 20); // Simply add to vertical velocity

		AudioManager.play(this.sounds[1]);
		this.game.renderer.particles.createEmitter(superJumpParticleOptions, null, () => marble.body.position.clone());

		marble.unequipPowerUp();
	}
}

export const superJumpParticleOptions = {
	ejectionPeriod: 10,
	ambientVelocity: new Vector3(0, 0, 0.05),
	ejectionVelocity: 1 * 0.5,
	velocityVariance: 0.25 * 0.5,
	emitterLifetime: 1000,
	inheritedVelFactor: 0.1,
	particleOptions: {
		texture: 'particles/twirl.png',
		blending: BlendingType.Additive,
		spinSpeed: 90,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 1000,
		lifetimeVariance: 150,
		dragCoefficient: 0.25,
		acceleration: 0,
		colors: [{r: 0, g: 0.5, b: 1, a: 0}, {r: 0, g: 0.6, b: 1, a: 1}, {r: 0, g: 0.6, b: 1, a: 0}],
		sizes: [0.25, 0.25, 0.5],
		times: [0, 0.75, 1]
	}
};