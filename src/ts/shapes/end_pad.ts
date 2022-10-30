import { Shape } from "../shape";
import { Util, Scheduler } from "../util";
import { ParticleEmitter } from "../particles";
import { Level, TimeState } from "../level";
import { Matrix4 } from "../math/matrix4";
import { Vector3 } from "../math/vector3";
import { Quaternion } from "../math/quaternion";
import { Euler } from "../math/euler";
import { BlendingType } from "../rendering/renderer";

/** The finish pad. */
export class EndPad extends Shape {
	dtsPath = "shapes/pads/endarea.dts";
	fireworks: Firework[] = [];
	sounds = ['firewrks.wav'];
	inArea = 0; // Used to only trigger the event once

	/** @param isMain Whether or not this pad is the main pad, meaning it has to be touched for the level to end. All other pads are purely cosmetic. */
	constructor(isMain: boolean) {
		super();

		if (!isMain) return;

		// Create the finish area collision geometry
		let height = 4.8;
		let radius = 1.7;
		let transform = new Matrix4();
		transform.compose(new Vector3(0, 0, height/2 + 0.2), new Quaternion().setFromEuler(new Euler(-Math.PI/2, 0, 0)), new Vector3(1, 1, 1));

		this.addCollider((scale: Vector3) => {
			// Create the finish area collision geometry
			// Scaling note: The actual height of the cylinder (here: the y scaling) doesn't change, it's always the same.
			let finishArea = Util.createCylinderConvexHull(radius, height/2, 64, new Vector3(scale.x, 1, scale.y));
			finishArea.margin = 0.005; // OIMO had a margin of 0.005 on every shape. We somewhat try to correct for that by adding it back here.

			return finishArea;
		}, (t: number) => {
			// These checks are to make sure touchFinish is only called once per contact with the collider. For it to be called again, the marble must leave the area again.
			let exit = this.inArea > 0;
			this.inArea = 2;
			if (exit) return;

			this.level.touchFinish(t);
		}, transform);
	}

	/** Starts the finish celebration firework at a given time. */
	spawnFirework(time: TimeState) {
		let firework = new Firework(this.level, this.worldPosition, time.timeSinceLoad);
		this.fireworks.push(firework);

		this.level.audio.play(this.sounds[0], 1, undefined, this.worldPosition);
	}

	tick(time: TimeState, onlyVisual: boolean) {
		if (onlyVisual) return;
		super.tick(time);

		// Tick the firework
		for (let firework of this.fireworks.slice()) {
			firework.tick(time.timeSinceLoad);
			if (time.timeSinceLoad - firework.spawnTime >= 10000) Util.removeFromArray(this.fireworks, firework); // We can safely remove the firework
		}

		this.inArea--;
	}
}

/** The ambient smoke coming up from the finish pad. */
export const fireworkSmoke = {
	ejectionPeriod: 100,
	ambientVelocity: new Vector3(0, 0, 1),
	ejectionVelocity: 0,
	velocityVariance: 0,
	emitterLifetime: 4000,
	spawnOffset() {
		let randomPointInCircle = Util.randomPointInUnitCircle();
		return new Vector3(randomPointInCircle.x * 1.6, randomPointInCircle.y * 1.6, Math.random() * 0.4 - 0.5);
	},
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/saturn.png',
		blending: BlendingType.Normal,
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

/** The trail of the red rockets. */
export const redTrail = {
	ejectionPeriod: 30,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 0,
	velocityVariance: 0,
	emitterLifetime: 10000,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: BlendingType.Normal,
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

/** The trail of the blue rockets. */
export const blueTrail = {
	ejectionPeriod: 30,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 0,
	velocityVariance: 0,
	emitterLifetime: 10000,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: BlendingType.Normal,
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

/** The explosion effect of the red rockets. */
export const redSpark = {
	ejectionPeriod: 1,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 0.8,
	velocityVariance: 0.25,
	emitterLifetime: 10,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/star.png',
		blending: BlendingType.Normal,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 500,
		lifetimeVariance: 50,
		dragCoefficient: 0.5,
		acceleration: 0,
		colors: [{r: 1, g: 1, b: 0, a: 1}, {r: 1, g: 1, b: 0, a: 1}, {r: 1, g: 0, b: 0, a: 0}],
		sizes: [0.2, 0.2, 0.2],
		times: [0, 0.5, 1]
	}
};

/** The explosion effect of the blue rockets. */
export const blueSpark = {
	ejectionPeriod: 1,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 0.5,
	velocityVariance: 0.25,
	emitterLifetime: 10,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/bubble.png',
		blending: BlendingType.Normal,
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
	targetPos: Vector3,
	spawnTime: number,
	lifetime: number
}

/** Handles the firework animation that plays on the finish pad upon level completion. */
class Firework extends Scheduler {
	level: Level;
	pos: Vector3;
	spawnTime: number;
	trails: Trail[] = [];
	/** The fireworks are spawned in waves, this controls how many are left. */
	wavesLeft = 4;

	constructor(level: Level, pos: Vector3, spawnTime: number) {
		super();

		this.level = level;
		this.pos = pos;
		this.spawnTime = spawnTime;

		this.level.particles.createEmitter(fireworkSmoke, this.pos); // Start the smoke
		this.doWave(this.spawnTime); // Start the first wave
	}

	tick(time: number) {
		this.tickSchedule(time);

		// Update the trails
		for (let trail of this.trails.slice()) {
			let completion = Util.clamp((time - trail.spawnTime) / trail.lifetime, 0, 1);
			completion = 1 - (1 - completion)**2; // ease-out

			// Make the trail travel along an arc (parabola, whatever)
			let pos = this.pos.clone().multiplyScalar(1 - completion).add(trail.targetPos.clone().multiplyScalar(completion));
			pos.sub(new Vector3(0, 0, 1).multiplyScalar(completion**2));
			trail.smokeEmitter.setPos(pos, time);

			if (completion === 1) {
				// The trail has reached its end, remove the emitter and spawn the explosion.
				this.level.particles.removeEmitter(trail.smokeEmitter);
				Util.removeFromArray(this.trails, trail);

				if (trail.type === 'red') {
					this.level.particles.createEmitter(redSpark, pos);
				} else {
					this.level.particles.createEmitter(blueSpark, pos);
				}
			}
		}
	}

	/** Spawns a bunch of trails going in random directions. */
	doWave(time: number) {
		let count = Math.floor(17 + Math.random() * 10);
		for (let i = 0; i < count; i++) this.spawnTrail(time);

		this.wavesLeft--;
		if (this.wavesLeft > 0) {
			let nextWaveTime = time + 500 + 1000 * Math.random();
			this.schedule(nextWaveTime, () => this.doWave(nextWaveTime));
		}
	}

	/** Spawns a red or blue trail going in a random direction with a random speed. */
	spawnTrail(time: number) {
		let type: 'red' | 'blue' = (Math.random() < 0.5)? 'red' : 'blue';

		let lifetime = 250 + Math.random() * 2000;
		let distanceFac = 0.5 + lifetime / 5000; // Make sure the firework doesn't travel a great distance way too quickly
		let emitter = this.level.particles.createEmitter((type === 'red')? redTrail : blueTrail, this.pos);
		let randomPointInCircle = Util.randomPointInUnitCircle();
		let targetPos = new Vector3(randomPointInCircle.x * 3, randomPointInCircle.y * 3, 1 + Math.sqrt(Math.random()) * 3).multiplyScalar(distanceFac).add(this.pos);

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