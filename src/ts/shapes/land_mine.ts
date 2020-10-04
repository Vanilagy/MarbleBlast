import { Shape } from "../shape";
import { state } from "../state";
import { Util } from "../util";
import { TimeState } from "../level";
import OIMO from "../declarations/oimo";
import { AudioManager } from "../audio";
import * as THREE from "three";

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
const landMineSparksParticle = {
	ejectionPeriod: 0.4,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 13 / 4,
	velocityVariance: 6.75 / 4,
	emitterLifetime: 100,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: THREE.AdditiveBlending,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 500,
		lifetimeVariance: 350,
		dragCoefficient: 0.75,
		acceleration: -8,
		colors: [{r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 1, g: 0.4, b: 0.3, a: 0}],
		sizes: [0.5, 0.25, 0.25],
		times: [0, 0.5, 1]
	}
};

export class LandMine extends Shape {
	dtsPath = "shapes/hazards/landmine.dts";
	disappearTime = -Infinity;
	sounds = ['explode1.wav'];

	onMarbleContact(contact: OIMO.Contact, time: TimeState) {
		let marble = this.level.marble;
		let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(this.worldPosition)).normalize();

		marble.body.addLinearVelocity(vec.scale(10));
		this.disappearTime = time.timeSinceLoad;

		AudioManager.play(this.sounds[0]);
		this.level.particles.createEmitter(landMineParticle, this.worldPosition);
		this.level.particles.createEmitter(landMineSmokeParticle, this.worldPosition);
		this.level.particles.createEmitter(landMineSparksParticle, this.worldPosition);
		// Normally, we would add a light here, but that's too expensive for THREE, apparently.
	}

	tick(time: TimeState, onlyVisual: boolean) {
		if (onlyVisual) return;
		
		let visible = time.timeSinceLoad >= this.disappearTime + 5000;
		this.setCollisionEnabled(visible);
	}

	render(time: TimeState) {
		let opacity = Util.clamp((time.timeSinceLoad - (this.disappearTime + 5000)) / 1000, 0, 1);
		this.setOpacity(opacity);
	}
}