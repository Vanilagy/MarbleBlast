import { Shape } from "../shape";
import * as THREE from "three";
import { state } from "../state";
import { Util, Scheduler } from "../util";
import { ParticleEmitter } from "../particles";
import { TimeState } from "../level";
import OIMO from "../declarations/oimo";
import { AudioManager } from "../audio";

export class EndPad extends Shape {
	dtsPath = "shapes/pads/endarea.dts";
	fireworks: Firework[] = [];
	sounds = ['firewrks.wav'];
	inArea = 0; // Used to only trigger the event once

	constructor() {
		super();

		let height = 4;
		let radius = 1.5;
		let finishArea = new OIMO.CylinderGeometry(radius, height/2);
		let transform = new THREE.Matrix4();
		transform.compose(new THREE.Vector3(0, 0, height/2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), new THREE.Vector3(1, 1, 1));
		this.addCollider(finishArea, () => {
			let exit = this.inArea > 0;
			this.inArea = 2;
			if (exit) return;

			state.currentLevel.touchFinish();
		}, transform);
	}

	spawnFirework(time: TimeState) {
		let firework = new Firework(this.worldPosition, time.timeSinceLoad);
		this.fireworks.push(firework);

		AudioManager.play(this.sounds[0], 1, AudioManager.soundGain, this.worldPosition);
	}

	tick(time: TimeState) {
		super.tick(time);

		for (let firework of this.fireworks.slice()) {
			firework.tick(time.timeSinceLoad);
			if (time.timeSinceLoad - firework.spawnTime >= 10000) Util.removeFromArray(this.fireworks, firework); // We can safely remove the firework
		}

		this.inArea--;
	}
}

const fireworkSmoke = {
	ejectionPeriod: 100,
	ambientVelocity: new THREE.Vector3(0, 0, 1),
	ejectionVelocity: 0,
	velocityVariance: 0,
	emitterLifetime: 4000,
	spawnOffset() {
		let randomPointInCircle = Util.randomPointInUnitCircle();
		return new THREE.Vector3(randomPointInCircle.x * 1.6, randomPointInCircle.y * 1.6, Math.random() * 0.4 - 0.5);
	},
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/saturn.png',
		blending: THREE.NormalBlending,
		spinSpeed: 0,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 2000,
		lifetimeVariance: 200,
		dragCoefficient: 0.5,
		acceleration: 0,
		colors: [{r: 1, g: 1, b: 0, a: 0}, {r: 1, g: 0, b: 0, a: 1}, {r: 1, g: 0, b: 0, a: 0}],
		sizes: [0.1, 0.2, 0.3],
		times: [0, 0.2, 1]
	}
};

const redTrail = {
	ejectionPeriod: 30,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 0,
	velocityVariance: 0,
	emitterLifetime: 10000,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: THREE.NormalBlending,
		spinSpeed: 0,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 600,
		lifetimeVariance: 100,
		dragCoefficient: 0,
		acceleration: 0,
		colors: [{r: 1, g: 1, b: 0, a: 1}, {r: 1, g: 0, b: 0, a: 1}, {r: 1, g: 0, b: 0, a: 0}],
		sizes: [0.1, 0.05, 0.01],
		times: [0, 0.5, 1]
	}
};

const blueTrail = {
	ejectionPeriod: 30,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 0,
	velocityVariance: 0,
	emitterLifetime: 10000,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: THREE.NormalBlending,
		spinSpeed: 0,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 600,
		lifetimeVariance: 100,
		dragCoefficient: 0,
		acceleration: 0,
		colors: [{r: 0, g: 0, b: 1, a: 1}, {r: 0.5, g: 0.5, b: 1, a: 1}, {r: 1, g: 1, b: 1, a: 0}],
		sizes: [0.1, 0.05, 0.01],
		times: [0, 0.5, 1]
	}
};

const redSpark = {
	ejectionPeriod: 1,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 1,
	velocityVariance: 0.25,
	emitterLifetime: 10,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/star.png',
		blending: THREE.NormalBlending,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 500,
		lifetimeVariance: 50,
		dragCoefficient: 0,
		acceleration: 0,
		colors: [{r: 1, g: 1, b: 0, a: 1}, {r: 1, g: 1, b: 0, a: 1}, {r: 1, g: 0, b: 0, a: 0}],
		sizes: [0.2, 0.2, 0.2],
		times: [0, 0.5, 1]
	}
};

const blueSpark = {
	ejectionPeriod: 1,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 0.5,
	velocityVariance: 0.25,
	emitterLifetime: 10,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/bubble.png',
		blending: THREE.NormalBlending,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 2000,
		lifetimeVariance: 200,
		dragCoefficient: 0,
		acceleration: 0,
		colors: [{r: 0, g: 0, b: 1, a: 1}, {r: 0.5, g: 0.5, b: 1, a: 1}, {r: 1, g: 1, b: 1, a: 0}],
		sizes: [0.2, 0.2, 0.2],
		times: [0, 0.5, 1]
	}
};

interface Trail {
	type: 'red' | 'blue',
	smokeEmitter: ParticleEmitter,
	targetPos: THREE.Vector3,
	spawnTime: number,
	lifetime: number
}

class Firework extends Scheduler {
	pos: THREE.Vector3;
	spawnTime: number;
	trails: Trail[] = [];
	wavesLeft = 4;

	constructor(pos: THREE.Vector3, spawnTime: number) {
		super();

		this.pos = pos;
		this.spawnTime = spawnTime;

		state.currentLevel.particles.createEmitter(fireworkSmoke, this.pos);
		this.doWave(this.spawnTime);
	}

	tick(time: number) {
		this.tickSchedule(time);

		for (let trail of this.trails.slice()) {
			let completion = Util.clamp((time - trail.spawnTime) / trail.lifetime, 0, 1);
			completion = 1 - (1 - completion)**2;

			let pos = this.pos.clone().multiplyScalar(1 - completion).add(trail.targetPos.clone().multiplyScalar(completion));
			pos.sub(new THREE.Vector3(0, 0, 1).multiplyScalar(completion**2));
			trail.smokeEmitter.setPos(pos, time);

			if (completion === 1) {
				state.currentLevel.particles.removeEmitter(trail.smokeEmitter);
				Util.removeFromArray(this.trails, trail);

				if (trail.type === 'red') {
					state.currentLevel.particles.createEmitter(redSpark, pos);
				} else {
					state.currentLevel.particles.createEmitter(blueSpark, pos);
				}
			}
		}
	}

	doWave(time: number) {
		let count = Math.floor(15 + Math.random() * 10);
		for (let i = 0; i < count; i++) this.spawnTrail(time);

		this.wavesLeft--;
		if (this.wavesLeft > 0) {
			let nextWaveTime = time + 500 + 1000 * Math.random();
			this.schedule(nextWaveTime, () => this.doWave(nextWaveTime));
		}
	}

	spawnTrail(time: number) {
		let type: 'red' | 'blue' = (Math.random() < 0.5)? 'red' : 'blue';

		let lifetime = 250 + Math.random() * 2000;
		let distanceFac = 0.5 + lifetime / 5000;
		let emitter = state.currentLevel.particles.createEmitter((type === 'red')? redTrail : blueTrail, this.pos);
		let randomPointInCircle = Util.randomPointInUnitCircle();
		let targetPos = new THREE.Vector3(randomPointInCircle.x * 4, randomPointInCircle.y * 4, 1 + Math.sqrt(Math.random()) * 3).multiplyScalar(distanceFac).add(this.pos);

		let trail: Trail = {
			type: type,
			smokeEmitter: emitter,
			targetPos: targetPos,
			spawnTime: time,
			lifetime: lifetime
		};
		this.trails.push(trail);
	}
}