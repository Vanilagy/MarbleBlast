import { AudioManager } from "../audio";
import { TimeState } from "../level";
import { Marble } from "../marble";
import { Vector3 } from "../math/vector3";
import { Collision } from "../physics/collision";
import { BlendingType } from "../rendering/renderer";
import { Shape } from "../shape";
import { Util } from "../util";
import { ExplosiveState } from "./land_mine";

/** Nukes explode on contact and knock the marble away even more than mines do. */
export class Nuke extends Shape {
	dtsPath = "shapes/hazards/nuke/nuke.dts";
	disappearTime = -Infinity;
	sounds = ['nukeexplode.wav'];
	shareMaterials = false;

	onMarbleContact(collision: Collision, marble: Marble) {
		let nukePos = this.worldPosition;

		for (let marble of this.game.marbles) {
			let explosionForce = this.computeExplosionForce(marble.body.position.clone().sub(nukePos));
			if (explosionForce.length() === 0) continue;

			// Add velocity to the marble
			marble.body.linearVelocity.add(explosionForce);
			marble.slidingTimeout = 2;

			this.affect(marble);
		}

		this.disappearTime = this.game.state.time;
		this.setCollisionEnabled(false);
		this.stateNeedsStore = true;

		marble.affect(this);

		this.applyCosmeticEffects();
	}

	/** Computes the force of the explosion based on the vector to the nuke. Ported from decompiled MBG. */
	computeExplosionForce(distVec: Vector3) {
		const range = 10;
		const power = 100;

		let dist = distVec.length();
		if (dist < range) {
			let scalar = (1 - dist/range) * power;
			distVec.multiplyScalar(scalar);
		} else {
			distVec.setScalar(0);
		}

		return distVec;
	}

	update(onlyVisual?: boolean) {
		if (onlyVisual) return;

		// Enable or disable the collision based on disappear time
		let visible = this.game.state.time >= this.disappearTime + 5;
		this.setCollisionEnabled(visible);
	}

	render() {
		let opacity = Util.clamp(this.game.state.time - (this.disappearTime + 15), 0, 1);
		this.setOpacity(opacity);

		super.render();
	}

	getState(): ExplosiveState {
		return {
			entityType: 'explosive',
			disappearTime: this.disappearTime
		};
	}

	getInitialState(): ExplosiveState {
		return {
			entityType: 'explosive',
			disappearTime: -Infinity
		};
	}

	loadState(state: ExplosiveState) {
		if (state.disappearTime > this.disappearTime) this.applyCosmeticEffects();
		this.disappearTime = state.disappearTime;
	}

	applyCosmeticEffects() {
		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.sounds[0], undefined, undefined, this.worldPosition);

			this.game.renderer.particles.createEmitter(nukeParticle, this.worldPosition);
			this.game.renderer.particles.createEmitter(nukeSmokeParticle, this.worldPosition);
			this.game.renderer.particles.createEmitter(nukeSparksParticle, this.worldPosition);
		}, `${this.id}sound`, true);
	}
}

/** The fire particle. */
const nukeParticle = {
	ejectionPeriod: 0.2,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 2,
	velocityVariance: 1,
	emitterLifetime: 50,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: BlendingType.Additive,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 1000,
		lifetimeVariance: 150,
		dragCoefficient: 0.8,
		acceleration: 0,
		colors: [{r: 0.56, g: 0.36, b: 0.26, a: 1}, {r: 0.56, g: 0.36, b: 0.26, a: 0}],
		sizes: [0.5, 1],
		times: [0, 1]
	}
};
/** The smoke particle. */
export const nukeSmokeParticle = {
	ejectionPeriod: 0.5,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 1.3,
	velocityVariance: 0.5,
	emitterLifetime: 50,
	inheritedVelFactor: 0.25,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: BlendingType.Normal,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 2500,
		lifetimeVariance: 300,
		dragCoefficient: 0.7,
		acceleration: -8,
		colors: [{r: 0.56, g: 0.36, b: 0.26, a: 1}, {r: 0.2, g: 0.2, b: 0.2, a: 0.85}, {r: 0, g: 0, b: 0, a: 0}],
		sizes: [1, 1.5, 2],
		times: [0, 0.5, 1]
	}
};
/** The sparks exploding away. */
export const nukeSparksParticle = {
	ejectionPeriod: 1.7,
	ambientVelocity: new Vector3(0, -0.5, 0),
	ejectionVelocity: 13 / 1.5,
	velocityVariance: 5 / 1,
	emitterLifetime: 5000,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: BlendingType.Additive,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 4500,
		lifetimeVariance: 2500,
		dragCoefficient: 0.5,
		acceleration: 0 ?? -8,
		colors: [{r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 1, g: 0.4, b: 0.3, a: 0}],
		sizes: [0.5, 0.4, 0.2],
		times: [0, 0.5, 1]
	}
};