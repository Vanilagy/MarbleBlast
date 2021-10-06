import THREE from "three";
import { AudioManager } from "../audio";
import { TimeState } from "../level";
import { Shape } from "../shape";
import { Util } from "../util";

/** Nukes explode on contact and knock the marble away even more than mines do. */
export class Nuke extends Shape {
	dtsPath = "shapes/hazards/nuke/nuke.dts";
	disappearTime = -Infinity;
	sounds = ['nukeexplode.wav'];
	shareMaterials = false;

	onMarbleContact(time: TimeState) {
		let marble = this.level.marble;
		let minePos = Util.vecThreeToOimo(this.worldPosition);
		let vec = marble.lastPos.sub(Util.vecThreeToOimo(this.worldPosition)).normalize(); // Use the last pos so that it's a little less RNG

		// Add velocity to the marble
		let explosionStrength = this.computeExplosionStrength(this.level.marble.body.getPosition().sub(minePos).length());
		marble.body.addLinearVelocity(vec.scale(explosionStrength));
		marble.slidingTimeout = 2;
		this.disappearTime = time.timeSinceLoad;
		this.setCollisionEnabled(false);

		AudioManager.play(this.sounds[0]);
		this.level.particles.createEmitter(landMineParticle, this.worldPosition);
		this.level.particles.createEmitter(landMineSmokeParticle, this.worldPosition);
		this.level.particles.createEmitter(landMineSparksParticle, this.worldPosition);
		// Normally, we would add a light here, but that's too expensive for THREE, apparently.

		this.level.replay.recordMarbleContact(this);
	}

	/** Computes the strength of the explosion (force) based on distance from it. */
	computeExplosionStrength(r: number) {
		// Figured out through testing by RandomityGuy
		if (r >= 10.25) return 0;
		if (r >= 10) return Util.lerp(30.0087, 30.7555, r - 10);

		// The explosion first becomes stronger the further you are away from it, then becomes weaker again (parabolic).
		let a = 0.071436222;
		let v = ((r - 5) ** 2) / (-4 * a) + 87.5;

		return v * 100/15;
	}

	tick(time: TimeState, onlyVisual: boolean) {
		if (onlyVisual) return;
		
		// Enable or disable the collision based on disappear time
		let visible = time.timeSinceLoad >= this.disappearTime + 15000;
		this.setCollisionEnabled(visible);
	}

	render(time: TimeState) {
		let opacity = Util.clamp((time.timeSinceLoad - (this.disappearTime + 15000)) / 1000, 0, 1);
		this.setOpacity(opacity);
	}
}

/** The fire particle. */
const landMineParticle = {
	ejectionPeriod: 0.2,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 2,
	velocityVariance: 1,
	emitterLifetime: 50,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: THREE.AdditiveBlending,
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
const landMineSmokeParticle = {
	ejectionPeriod: 0.5,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 0.8,
	velocityVariance: 0.4,
	emitterLifetime: 50,
	inheritedVelFactor: 0.25,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: THREE.NormalBlending,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 1200,
		lifetimeVariance: 300,
		dragCoefficient: 0.85,
		acceleration: -8,
		colors: [{r: 0.56, g: 0.36, b: 0.26, a: 1}, {r: 0.2, g: 0.2, b: 0.2, a: 1}, {r: 0, g: 0, b: 0, a: 0}],
		sizes: [1, 1.5, 2],
		times: [0, 0.5, 1]
	}
};
/** The sparks exploding away. */
const landMineSparksParticle = {
	ejectionPeriod: 1.5,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 13 / 2,
	velocityVariance: 6.75 / 5,
	emitterLifetime: 5000,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: THREE.AdditiveBlending,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 3000,
		lifetimeVariance: 1000,
		dragCoefficient: 0.75,
		acceleration: 0 ?? -8,
		colors: [{r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 1, g: 0.4, b: 0.3, a: 0}],
		sizes: [0.5, 0.5, 0.5],
		times: [0, 0.5, 1]
	}
};