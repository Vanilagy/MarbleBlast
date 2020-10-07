import { PowerUp } from "./power_up";
import { AudioManager } from "../audio";
import * as THREE from "three";
import { Util } from "../util";

const particleOptions = {
	ejectionPeriod: 10,
	ambientVelocity: new THREE.Vector3(0, 0, 0.05),
	ejectionVelocity: 1 * 0.5,
	velocityVariance: 0.25 * 0.5,
	emitterLifetime: 1000,
	inheritedVelFactor: 0.1,
	particleOptions: {
		texture: 'particles/twirl.png',
		blending: THREE.AdditiveBlending,
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

/** Gives the marble an upwards boost. */
export class SuperJump extends PowerUp {
	dtsPath = "shapes/items/superjump.dts";
	pickUpName = "Super Jump PowerUp";
	sounds = ["pusuperjumpvoice.wav", "dosuperjump.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {
		let marble = this.level.marble;
		marble.body.addLinearVelocity(this.level.currentUp.scale(20)); // Simply add to vertical velocity

		AudioManager.play(this.sounds[1]);
		this.level.particles.createEmitter(particleOptions, null, () => Util.vecOimoToThree(marble.body.getPosition()));
	}
}