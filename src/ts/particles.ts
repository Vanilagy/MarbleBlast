import { RGBAColor, Util } from "./util";
import { Level } from "./level";
import * as THREE from "three";
import { ResourceManager } from "./resources";

/** The options for a single particle. */
interface ParticleOptions {
	texture: string,
	/** Which blending mode to use. */
	blending: number,
	/** The spinning speed in degrees per second. */
	spinSpeed: number,
	spinRandomMin: number,
	spinRandomMax: number,
	lifetime: number,
	lifetimeVariance: number,
	dragCoefficient: number,
	/** Acceleration along the velocity vector. */
	acceleration: number,
	colors: RGBAColor[],
	sizes: number[],	
	/** Determines at what percentage of lifetime the corresponding colors and sizes are in effect. */
	times: number[]
}

/** The options for a particle emitter. */
export interface ParticleEmitterOptions {
	/** The time between particle ejections. */
	ejectionPeriod: number,
	/** A fixed velocity to add to each particle. */
	ambientVelocity: THREE.Vector3,
	/** The particle is ejected in a random direction with this velocity. */
	ejectionVelocity: number,
	velocityVariance: number,
	emitterLifetime: number,
	/** How much of the emitter's own velocity the particle should inherit. */
	inheritedVelFactor: number,
	/** Computes a spawn offset for each particle. */
	spawnOffset?: () => THREE.Vector3,
	particleOptions: ParticleOptions
}

/** Manages emitters and particles. */
export class ParticleManager {
	level: Level;
	emitters: ParticleEmitter[] = [];
	particles: Particle[] = [];

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		let promises: Promise<any>[] = [];

		// Preload all textures
		for (let path of ['particles/bubble.png', 'particles/saturn.png', 'particles/smoke.png', 'particles/spark.png', 'particles/star.png', 'particles/twirl.png']) {
			promises.push(ResourceManager.getTexture(path));
		}

		await Promise.all(promises);
	}

	getTime() {
		return this.level.timeState.timeSinceLoad;
	}

	addParticle(particle: Particle) {
		this.particles.push(particle);
		this.level.scene.add(particle.sprite);
	}

	removeParticle(particle: Particle) {
		Util.removeFromArray(this.particles, particle);
		this.level.scene.remove(particle.sprite);
	}

	createEmitter(options: ParticleEmitterOptions, initialPos: THREE.Vector3, getPos?: () => THREE.Vector3) {
		let emitter = new ParticleEmitter(options, this, getPos);
		emitter.currPos = getPos?.() ?? initialPos.clone();
		emitter.currPosTime = this.getTime();
		emitter.spawn(this.getTime());

		this.emitters.push(emitter);
		return emitter;
	}

	removeEmitter(emitter: ParticleEmitter) {
		Util.removeFromArray(this.emitters, emitter);
	}

	removeEverything() {
		for (let particle of this.particles.slice()) this.removeParticle(particle);
		for (let emitter of this.emitters.slice()) this.removeEmitter(emitter);
	}

	tick() {
		let time = this.getTime();

		for (let emitter of this.emitters) {
			if (emitter.getPos) emitter.setPos(emitter.getPos(), time);
			emitter.tick(time);
		}
	}

	render(time: number) {
		for (let i = 0; i < this.particles.length; i++) {
			this.particles[i].render(time);
		}
	}
}

export class ParticleEmitter {
	o: ParticleEmitterOptions;
	manager: ParticleManager;
	spawnTime: number;
	lastEmitTime: number;
	currentWaitPeriod: number;

	lastPos: THREE.Vector3;
	lastPosTime: number;
	currPos: THREE.Vector3;
	currPosTime: number;
	vel = new THREE.Vector3();
	getPos: () => THREE.Vector3;

	constructor(options: ParticleEmitterOptions, manager: ParticleManager, getPos?: () => THREE.Vector3) {
		this.o = options;
		this.manager = manager;
		this.getPos = getPos;
	}

	spawn(time: number) {
		this.spawnTime = time;
		this.emit(time);
	}

	tick(time: number) {
		// Cap the amount of particles emitted in such a case to prevent lag
		if (time - this.lastEmitTime >= 1000) this.lastEmitTime = time - 1000;

		// Spawn as many particles as needed
		while (this.lastEmitTime + this.currentWaitPeriod <= time) {
			this.emit(this.lastEmitTime + this.currentWaitPeriod);

			let completion = Util.clamp((this.lastEmitTime - this.spawnTime) / this.o.emitterLifetime, 0, 1);
			if (completion === 1) {
				this.manager.removeEmitter(this);
				return;
			}	
		}
	}

	/** Emit a single particle. */
	emit(time: number) {
		this.lastEmitTime = time;
		this.currentWaitPeriod = this.o.ejectionPeriod;

		let pos = this.getPosAtTime(time).clone();
		if (this.o.spawnOffset) pos.add(this.o.spawnOffset()); // Call the spawnOffset function if it's there

		// This isn't necessarily uniform but it's fine for the purpose.
		let randomPointOnSphere = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
		// Compute the total velocity
		let vel = this.vel.clone().multiplyScalar(this.o.inheritedVelFactor).add(randomPointOnSphere.multiplyScalar(this.o.ejectionVelocity + this.o.velocityVariance * (Math.random() * 2 - 1))).add(this.o.ambientVelocity);

		let particle = new Particle(this.o.particleOptions, this.manager, time, pos, vel);
		this.manager.addParticle(particle);
	}

	/** Computes the interpolated emitter position at a point in time. */
	getPosAtTime(time: number) {
		if (!this.lastPos) return this.currPos;
		
		let completion = Util.clamp((time - this.lastPosTime) / (this.currPosTime - this.lastPosTime), 0, 1);
		return Util.lerpThreeVectors(this.lastPos, this.currPos, completion);
	}

	setPos(pos: THREE.Vector3, time: number) {
		this.lastPos = this.currPos;
		this.lastPosTime = this.currPosTime;
		this.currPos = pos.clone();
		this.currPosTime = time;
		this.vel = this.currPos.clone().sub(this.lastPos).multiplyScalar(1000 / (this.currPosTime - this.lastPosTime));
	}
	
	static cloneOptions(options: ParticleEmitterOptions) {
		let clone = Util.jsonClone(options);
		clone.ambientVelocity = new THREE.Vector3(options.ambientVelocity.x, options.ambientVelocity.y, options.ambientVelocity.z);
		clone.spawnOffset = options.spawnOffset;

		return clone;
	}
}

class Particle {
	o: ParticleOptions;
	manager: ParticleManager;
	material: THREE.SpriteMaterial;
	sprite: THREE.Sprite;

	spawnTime: number;
	pos: THREE.Vector3;
	vel: THREE.Vector3;
	lifetime: number;
	initialSpin: number;

	constructor(options: ParticleOptions, manager: ParticleManager, spawnTime: number, pos: THREE.Vector3, vel: THREE.Vector3) {
		this.o = options;
		this.manager = manager;

		this.material = new THREE.SpriteMaterial({ map: ResourceManager.getTextureFromCache(this.o.texture), depthWrite: false });
		this.material.blending = this.o.blending;
		this.sprite = new THREE.Sprite(this.material);

		this.spawnTime = spawnTime;
		this.pos = pos;
		this.vel = vel;

		this.lifetime = this.o.lifetime + this.o.lifetimeVariance * (Math.random() * 2 - 1);
		this.initialSpin = Util.lerp(this.o.spinRandomMin, this.o.spinRandomMax, Math.random());
	}

	render(time: number) {
		let elapsed = time - this.spawnTime;
		let completion = Util.clamp(elapsed / this.lifetime, 0, 1);

		if (completion === 1) {
			// The particle can die
			this.manager.removeParticle(this);
			return;
		}

		let velElapsed = elapsed / 1000;
		velElapsed = velElapsed ** (1 - this.o.dragCoefficient); // Somehow slow down velocity over time based on the drag coefficient

		// Compute the position
		let pos = this.pos.clone().add(this.vel.clone().multiplyScalar(velElapsed + this.o.acceleration * velElapsed**2 / 2));
		this.sprite.position.copy(pos);

		this.material.rotation = Util.degToRad(this.initialSpin + this.o.spinSpeed * elapsed / 1000);

		// Check where we are in the times array
		let indexLow = 0;
		let indexHigh = 1;
		for (let i = 2; i < this.o.times.length; i++) {
			if (this.o.times[indexHigh] >= completion) break;

			indexLow = indexHigh;
			indexHigh = i;
		}

		if (this.o.times.length === 1) indexHigh = indexLow;
		let t = (completion - this.o.times[indexLow]) / (this.o.times[indexHigh] - this.o.times[indexLow]);

		// Adjust color
		let color = Util.lerpColors(this.o.colors[indexLow], this.o.colors[indexHigh], t);
		this.material.color.setRGB(color.r, color.g, color.b);
		this.material.opacity = color.a**1.5; // Adjusted because additive mixing can be kind of extreme

		// Adjust sizing
		this.sprite.scale.setScalar(Util.lerp(this.o.sizes[indexLow], this.o.sizes[indexHigh], t));
	}
}

export const particleNodeEmittersEmitterOptions = {
	MarbleTrailEmitter: {
		ejectionPeriod: 5,
		ambientVelocity: new THREE.Vector3(0, 0, 0),
		ejectionVelocity: 0,
		velocityVariance: 0.25,
		emitterLifetime: 10000,
		inheritedVelFactor: 0,
		particleOptions: {
			texture: 'particles/smoke.png',
			blending: THREE.NormalBlending,
			spinSpeed: 0,
			spinRandomMin: 0,
			spinRandomMax: 0,
			lifetime: 100,
			lifetimeVariance: 10,
			dragCoefficient: 0,
			acceleration: 0,
			colors: [{r: 1, g: 1, b: 0, a: 0}, {r: 1, g: 1, b: 0, a: 1}, {r: 1, g: 1, b: 1, a: 0}],
			sizes: [0.4, 0.4, 0.4],
			times: [0, 0.15, 1]
		}
	},
	LandMineEmitter: {
		ejectionPeriod: 10,
		ambientVelocity: new THREE.Vector3(0, 0, 0),
		ejectionVelocity: 0.5,
		velocityVariance: 0.25,
		emitterLifetime: Infinity,
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
	}
};