import { RGBAColor, Util } from "./util";
import { Level } from "./level";
import * as THREE from "three";
import { ResourceManager } from "./resources";

interface ParticleOptions {
	texture: string,
	blending: number,
	spinSpeed: number,
	spinRandomMin: number,
	spinRandomMax: number,
	lifetime: number,
	lifetimeVariance: number,
	dragCoefficient: number,
	acceleration: number,
	colors: RGBAColor[],
	sizes: number[],
	times: number[]
}

interface ParticleEmitterOptions {
	ejectionPeriod: number,
	ambientVelocity: THREE.Vector3,
	ejectionVelocity: number,
	velocityVariance: number,
	emitterLifetime: number,
	inheritedVelFactor: number,
	spawnOffset?: () => THREE.Vector3,
	particleOptions: ParticleOptions
}

export class ParticleManager {
	level: Level;
	emitters: ParticleEmitter[] = [];
	particles: Particle[] = [];

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		let promises: Promise<any>[] = [];

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
		while (this.lastEmitTime + this.currentWaitPeriod <= time) {
			this.emit(this.lastEmitTime + this.currentWaitPeriod);

			let completion = Util.clamp((this.lastEmitTime - this.spawnTime) / this.o.emitterLifetime, 0, 1);
			if (completion === 1) {
				this.manager.removeEmitter(this);
				return;
			}	
		}
	}

	emit(time: number) {
		this.lastEmitTime = time;
		this.currentWaitPeriod = this.o.ejectionPeriod;

		let pos = this.getPosAtTime(time).clone();
		if (this.o.spawnOffset) pos.add(this.o.spawnOffset());

		let randomPointOnSphere = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
		let vel = this.vel.clone().multiplyScalar(this.o.inheritedVelFactor).add(randomPointOnSphere.multiplyScalar(this.o.ejectionVelocity + this.o.velocityVariance * (Math.random() * 2 - 1))).add(this.o.ambientVelocity);

		let particle = new Particle(this.o.particleOptions, this.manager, time, pos, vel);
		this.manager.addParticle(particle);
	}

	getPosAtTime(time: number) {
		if (!this.lastPos) return this.currPos;
		
		let completion = Util.clamp((time - this.lastPosTime) / (this.currPosTime - this.lastPosTime), 0, 1);
		return this.lastPos.clone().multiplyScalar(1 - completion).add(this.currPos.clone().multiplyScalar(completion));
	}

	setPos(pos: THREE.Vector3, time: number) {
		this.lastPos = this.currPos;
		this.lastPosTime = this.currPosTime;
		this.currPos = pos.clone();
		this.currPosTime = time;
		this.vel = this.currPos.clone().sub(this.lastPos).multiplyScalar(1000 / (this.currPosTime - this.lastPosTime));
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
			this.manager.removeParticle(this);
			return;
		}

		let velElapsed = elapsed / 1000;
		velElapsed = velElapsed ** (1 - this.o.dragCoefficient);

		let pos = this.pos.clone().add(this.vel.clone().multiplyScalar(velElapsed + this.o.acceleration * velElapsed**2 / 2));
		this.sprite.position.copy(pos);

		this.material.rotation = Util.degToRad(this.initialSpin + this.o.spinSpeed * elapsed / 1000);

		let indexLow = 0;
		let indexHigh = 1;
		for (let i = 2; i < this.o.times.length; i++) {
			if (this.o.times[indexHigh] >= completion) break;

			indexLow = indexHigh;
			indexHigh = i;
		}

		if (this.o.times.length === 1) indexHigh = indexLow;
		let t = (completion - this.o.times[indexLow]) / (this.o.times[indexHigh] - this.o.times[indexLow]);

		let color = Util.lerpColors(this.o.colors[indexLow], this.o.colors[indexHigh], t);
		this.material.color.setRGB(color.r, color.g, color.b);
		this.material.opacity = color.a**1.5; // Adjusted because additive mixing can be kind of extreme

		this.sprite.scale.setScalar(Util.lerp(this.o.sizes[indexLow], this.o.sizes[indexHigh], t));
	}
}