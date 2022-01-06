import { RGBAColor, Util } from "./util";
import { Level } from "./level";
import { ResourceManager } from "./resources";
import { VertexBuffer, VertexBufferGroup } from "./rendering/vertex_buffer";
import { BlendingType, Renderer } from "./rendering/renderer";
import { Texture } from "./rendering/texture";
import { Vector3 } from "./math/vector3";
import { Matrix4 } from "./math/matrix4";

const PATHS = ['particles/bubble.png', 'particles/saturn.png', 'particles/smoke.png', 'particles/spark.png', 'particles/star.png', 'particles/twirl.png'];
const MAX_PARTICLES_PER_GROUP = 2**14;

/** The options for a single particle. */
interface ParticleOptions {
	texture: string,
	/** Which blending mode to use. */
	blending: BlendingType,
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
	ambientVelocity: Vector3,
	/** The particle is ejected in a random direction with this velocity. */
	ejectionVelocity: number,
	velocityVariance: number,
	emitterLifetime: number,
	/** How much of the emitter's own velocity the particle should inherit. */
	inheritedVelFactor: number,
	/** Computes a spawn offset for each particle. */
	spawnOffset?: () => Vector3,
	particleOptions: ParticleOptions
}

/** Particles with identical options are collected into a single group to be rendered together. */
interface ParticleGroup {
	particles: Particle[],
	vertexBuffer: VertexBuffer,
	uniforms: {
		acceleration: number,
		spinSpeed: number,
		dragCoefficient: number,
		times: Float32Array,
		sizes: Float32Array,
		colors: Float32Array
	}
}

// These two buffers define the geometry of the billboard:

const positions = new Float32Array(Array(MAX_PARTICLES_PER_GROUP).fill([ // Note we only have 2 values per vertex here, since a billboard is a 2D thing (z always 0)
	-0.5, -0.5,
	0.5, -0.5,
	0.5, 0.5,
	-0.5, 0.5
]).flat());

const uvs = new Float32Array(Array(MAX_PARTICLES_PER_GROUP).fill([
	0, 0,
	1, 0,
	1, 1,
	0, 1
]).flat());

const indices: number[] = [];
for (let i = 0; i < MAX_PARTICLES_PER_GROUP; i++) indices.push(
	4*i + 0, 4*i + 1, 4*i + 2, 4*i + 0, 4*i + 2, 4*i + 3
);

/** Manages emitters and particles. */
export class ParticleManager {
	renderer: Renderer;
	level: Level;
	emitters: ParticleEmitter[] = [];
	particleGroups = new Map<ParticleOptions, ParticleGroup>();
	/** For non-instanced, legacy particles. */
	particles: Particle[] = [];
	currentRenderTime: number;

	positionBuffer: VertexBuffer;
	uvBuffer: VertexBuffer;
	bufferGroup: VertexBufferGroup;
	indexBuffer: WebGLBuffer;

	constructor(level: Level) {
		this.level = level;
	}

	async init(renderer: Renderer) {
		this.renderer = renderer;
		let { gl } = renderer;

		// Setup the vertex buffers that will be used to draw all particles
		this.positionBuffer = new VertexBuffer(renderer, positions, { 'position': 2 });
		this.uvBuffer = new VertexBuffer(renderer, uvs, { 'uv': 2 });
		this.bufferGroup = new VertexBufferGroup([this.positionBuffer, this.uvBuffer]);

		this.indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

		let promises: Promise<Texture>[] = [];

		// Preload all textures so we can load them instantly from cache later
		for (let path of PATHS) {
			promises.push(ResourceManager.getTexture(path));
		}

		let textures = await Promise.all(promises);
		for (let texture of textures) texture.getGLTexture(renderer); // Also preload the GL texture
	}

	/** Gets or creates a particle group for the given options. */
	getParticleGroup(o: ParticleOptions) {
		let group = this.particleGroups.get(o);
		if (!group) {
			group = this.createParticleGroup(o);
			this.particleGroups.set(o, group);
		}

		return group;
	}

	createParticleGroup(o: ParticleOptions) {
		let attributes = {
			'particleSpawnTime': 1,
			'particleLifetime': 1,
			'particlePosition': 3,
			'particleVelocity': 3,
			'particleInitialSpin': 1
		};
		const floatsPerParticle = Object.values(attributes).reduce((a, b) => a + b, 0);
		const vertsPerParticle = 4;
		let buffer = new Float32Array(floatsPerParticle * vertsPerParticle * MAX_PARTICLES_PER_GROUP); // Make the buffer large enough so that we won't ever have to worry about not being able to fit enough particles in
		let vertexBuffer = new VertexBuffer(this.renderer, buffer, attributes);

		let colorsMatrix = new Matrix4();
		colorsMatrix.set(
			o.colors[0]?.r || 0, o.colors[0]?.g || 0, o.colors[0]?.b || 0, o.colors[0]?.a || 0,
			o.colors[1]?.r || 0, o.colors[1]?.g || 0, o.colors[1]?.b || 0, o.colors[1]?.a || 0,
			o.colors[2]?.r || 0, o.colors[2]?.g || 0, o.colors[2]?.b || 0, o.colors[2]?.a || 0,
			o.colors[3]?.r || 0, o.colors[3]?.g || 0, o.colors[3]?.b || 0, o.colors[3]?.a || 0
		);
		colorsMatrix.transpose();

		// Set all the values that are true for every particle of this type
		let uniforms: ParticleGroup['uniforms'] = {
			acceleration: o.acceleration,
			spinSpeed: Util.degToRad(o.spinSpeed),
			dragCoefficient: o.dragCoefficient,
			times: new Float32Array([o.times[0] ?? Infinity, o.times[1] ?? Infinity, o.times[2] ?? Infinity, o.times[3] ?? Infinity]),
			sizes: new Float32Array([o.sizes[0] || 0, o.sizes[1] || 0, o.sizes[2] || 0, o.sizes[3] || 0]),
			colors: new Float32Array(colorsMatrix.elements)
		};

		let group: ParticleGroup = {
			vertexBuffer: vertexBuffer,
			uniforms,
			particles: []
		};

		return group;
	}

	getTime() {
		return this.level.timeState.timeSinceLoad;
	}

	createEmitter(options: ParticleEmitterOptions, initialPos: Vector3, getPos?: () => Vector3, spawnSphereSquish?: Vector3) {
		let emitter = new ParticleEmitter(options, this, getPos, spawnSphereSquish);
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

		for (let i = 0; i < this.emitters.length; i++) {
			let emitter = this.emitters[i];
			if (emitter.getPos) emitter.setPos(emitter.getPos(), time);
			let alive = emitter.tick(time);
			if (!alive) this.emitters.splice(i--, 1);
		}
	}

	render(time: number) {
		this.currentRenderTime = time;

		// Update all the particle groups
		for (let [, group] of this.particleGroups) {
			for (let i = 0; i < group.particles.length; i++) {
				let particle = group.particles[i];
				let dead = !particle.isAlive(time);

				if (dead) {
					if (i < group.particles.length - 1) {
						// Since we want the array to be contiguous, swap in the last particle in the list to fill the hole
						group.particles[i] = group.particles[group.particles.length - 1];
						group.particles[i].applyToGroup(group, i);
					}

					group.particles.length--;
					i--;
				}
			}

			group.vertexBuffer.update();
		}
	}

	dispose() {
		for (let [, group] of this.particleGroups) {
			group.vertexBuffer.dispose();
		}
	}
}

export class ParticleEmitter {
	o: ParticleEmitterOptions;
	manager: ParticleManager;
	spawnTime: number;
	lastEmitTime: number;
	currentWaitPeriod: number;

	lastPos: Vector3;
	lastPosTime: number;
	currPos: Vector3;
	currPosTime: number;
	vel = new Vector3();
	getPos: () => Vector3;
	spawnSphereSquish: Vector3;

	constructor(options: ParticleEmitterOptions, manager: ParticleManager, getPos?: () => Vector3, spawnSphereSquish?: Vector3) {
		this.o = options;
		this.manager = manager;
		this.getPos = getPos;
		this.spawnSphereSquish = spawnSphereSquish ?? new Vector3(1, 1, 1);
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
			if (completion === 1) return false;
		}

		return true;
	}

	/** Emit a single particle. */
	emit(time: number) {
		this.lastEmitTime = time;
		this.currentWaitPeriod = this.o.ejectionPeriod;

		let pos = this.getPosAtTime(time).clone();
		if (this.o.spawnOffset) pos.add(this.o.spawnOffset()); // Call the spawnOffset function if it's there

		// Generate a point uniformly chosen on a sphere's surface.
		let randomPointOnSphere = new Vector3().randomDirection();
		randomPointOnSphere.multiply(this.spawnSphereSquish);
		// Compute the total velocity
		let vel = this.vel.clone().multiplyScalar(this.o.inheritedVelFactor).add(randomPointOnSphere.multiplyScalar(this.o.ejectionVelocity + this.o.velocityVariance * (Math.random() * 2 - 1))).add(this.o.ambientVelocity);

		let group = this.manager.getParticleGroup(this.o.particleOptions);
		if (group.particles.length === MAX_PARTICLES_PER_GROUP) return;

		let particle = new Particle(this.o.particleOptions, this.manager, time, pos, vel);
		particle.applyToGroup(group, group.particles.length);
		group.particles.push(particle);
	}

	/** Computes the interpolated emitter position at a point in time. */
	getPosAtTime(time: number) {
		if (!this.lastPos) return this.currPos;

		let completion = Util.clamp((time - this.lastPosTime) / (this.currPosTime - this.lastPosTime), 0, 1);
		return this.lastPos.clone().lerp(this.currPos, completion);
	}

	setPos(pos: Vector3, time: number) {
		this.lastPos = this.currPos;
		this.lastPosTime = this.currPosTime;
		this.currPos = pos.clone();
		this.currPosTime = time;
		this.vel = this.currPos.clone().sub(this.lastPos).multiplyScalar(1000 / (this.currPosTime - this.lastPosTime));
	}

	static cloneOptions(options: ParticleEmitterOptions) {
		let clone = Util.jsonClone(options);
		clone.ambientVelocity = new Vector3(options.ambientVelocity.x, options.ambientVelocity.y, options.ambientVelocity.z);
		clone.spawnOffset = options.spawnOffset;

		return clone as ParticleEmitterOptions;
	}
}

class Particle {
	o: ParticleOptions;
	manager: ParticleManager;

	spawnTime: number;
	pos: Vector3;
	vel: Vector3;
	lifetime: number;
	initialSpin: number;

	constructor(options: ParticleOptions, manager: ParticleManager, spawnTime: number, pos: Vector3, vel: Vector3) {
		this.o = options;
		this.manager = manager;

		this.spawnTime = spawnTime;
		this.pos = pos;
		this.vel = vel;

		this.lifetime = this.o.lifetime + this.o.lifetimeVariance * (Math.random() * 2 - 1);
		this.initialSpin = Util.lerp(this.o.spinRandomMin, this.o.spinRandomMax, Math.random());
	}

	/** Writes this particle's starting state into vertex buffers so that it can be simulated on the GPU. */
	applyToGroup(group: ParticleGroup, index: number) {
		let data = [
			this.spawnTime,
			this.lifetime,
			this.pos.x, this.pos.y, this.pos.z,
			this.vel.x, this.vel.y, this.vel.z,
			Util.degToRad(this.initialSpin)
		];

		// Update the data about the particle for each of the vertices. Yeah, it's a bit redundant, but name a better way. Data texture, you say? 😂
		let buf = group.vertexBuffer;
		buf.set(data, 4 * index * buf.stride + 0 * buf.stride);
		buf.set(data, 4 * index * buf.stride + 1 * buf.stride);
		buf.set(data, 4 * index * buf.stride + 2 * buf.stride);
		buf.set(data, 4 * index * buf.stride + 3 * buf.stride);
	}

	isAlive(time: number) {
		let elapsed = time - this.spawnTime;
		let completion = Util.clamp(elapsed / this.lifetime, 0, 1);

		return completion < 1;
	}
}

export const particleNodeEmittersEmitterOptions = {
	MarbleTrailEmitter: {
		ejectionPeriod: 5,
		ambientVelocity: new Vector3(0, 0, 0),
		ejectionVelocity: 0,
		velocityVariance: 0.25,
		emitterLifetime: 10000,
		inheritedVelFactor: 0,
		particleOptions: {
			texture: 'particles/smoke.png',
			blending: BlendingType.Normal,
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
		ambientVelocity: new Vector3(0, 0, 0),
		ejectionVelocity: 0.5,
		velocityVariance: 0.25,
		emitterLifetime: Infinity,
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
	}
};