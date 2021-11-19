import { RGBAColor, Util } from "./util";
import { Level } from "./level";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { renderer } from "./rendering";

const PATHS = ['particles/bubble.png', 'particles/saturn.png', 'particles/smoke.png', 'particles/spark.png', 'particles/star.png', 'particles/twirl.png'];
const MAX_PARTICLES_PER_GROUP = 2**14;
const MAX_UNINSTANCED_PARTICLES = 2**10;

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

interface ParticleGroup {
	mesh: THREE.Mesh,
	geometry: THREE.InstancedBufferGeometry,
	material: THREE.SpriteMaterial,
	particles: Particle[],
	instancePosition: THREE.InstancedBufferAttribute,
	instanceVelocity: THREE.InstancedBufferAttribute,
	instanceSpawnTime: THREE.InstancedBufferAttribute,
	instanceLifeTime: THREE.InstancedBufferAttribute,
	instanceInitialSpin: THREE.InstancedBufferAttribute
}

const billboard = new Float32Array([
	-0.5, -0.5, 0, 0, 0,
	0.5, -0.5, 0, 1, 0,
	0.5, 0.5, 0, 1, 1,
	-0.5, 0.5, 0, 0, 1
]);

/** Vertex shader for the particle rendering pipeline. Simulates the particle's trajectory on the GPU. */
const vertexShader = `
uniform vec2 center;
uniform float time;
uniform float acceleration;
uniform float spinSpeed;
uniform float dragCoefficient;
uniform vec4 times;
uniform vec4 sizes;
uniform mat4 colors;

attribute vec3 instancePosition;
attribute vec3 instanceVelocity;
attribute float instanceSpawnTime;
attribute float instanceLifeTime;
attribute float instanceInitialSpin;

varying vec4 color;

#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	float elapsed = time - instanceSpawnTime;
	float completion = clamp(elapsed / instanceLifeTime, 0.0, 1.0);

	if (completion == 1.0) {
		// We're dead, don't render
		gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	float velElapsed = elapsed / 1000.0;
	velElapsed = pow(velElapsed, 1.0 - dragCoefficient);

	// Compute the position
	vec3 particlePosition = instancePosition + instanceVelocity * (velElapsed + acceleration * velElapsed * velElapsed / 2.0);
	float rotation = instanceInitialSpin + spinSpeed * elapsed / 1000.0;

	// Check where we are in the times array
	int indexLow = 0;
	int indexHigh = 1;
	for (int i = 2; i < 4; ++i) {
		if (times[indexHigh] >= completion) break;

		indexLow = indexHigh;
		indexHigh = i;
	}
	if (times[1] > 1.0) indexHigh = indexLow;
	float t = (completion - times[indexLow]) / (times[indexHigh] - times[indexLow]);

	// Compute the color to send to the fragment shader
	color = mix(colors[indexLow], colors[indexHigh], t);
	color.a = pow(color.a, 1.5); // Adjusted because additive mixing can be kind of extreme

	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix * vec4( particlePosition, 1.0 );
	vec2 scale;
	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );
	scale *= mix(sizes[indexLow], sizes[indexHigh], t); // Adjust sizing
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}
`;

/** Fragment shader for the particle rendering pipeline. */
const fragmentShader = `
varying vec4 color;

#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = color; // Use the color passed along from the vertex shader
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	outgoingLight = diffuseColor.rgb;
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
}
`;

/** Manages emitters and particles. */
export class ParticleManager {
	level: Level;
	emitters: ParticleEmitter[] = [];
	particleGroups = new Map<ParticleOptions, ParticleGroup>();
	/** For non-instanced, legacy particles. */
	particles: Particle[] = [];

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		let promises: Promise<any>[] = [];

		// Preload all textures
		for (let path of PATHS) {
			promises.push(ResourceManager.getTexture(path));
		}

		await Promise.all(promises);
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
		let geometry = new THREE.InstancedBufferGeometry();
		geometry.instanceCount = 0; // Will change
		(geometry as any)._maxInstanceCount = Infinity;

		// Set up stuff describing the billboard geometry
		let interleavedBuffer = new THREE.InterleavedBuffer(billboard, 5);
		geometry.setIndex([0, 1, 2,	0, 2, 3]);
		geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0, false));
		geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(interleavedBuffer, 2, 3, false));

		// Set up all instanced attributes
		const B = THREE.InstancedBufferAttribute;
		let instancePosition = new B(new Float32Array(3 * MAX_PARTICLES_PER_GROUP), 3);
		let instanceVelocity = new B(new Float32Array(3 * MAX_PARTICLES_PER_GROUP), 3);
		let instanceSpawnTime = new B(new Float32Array(MAX_PARTICLES_PER_GROUP), 1);
		let instanceLifeTime = new B(new Float32Array(MAX_PARTICLES_PER_GROUP), 1);
		let instanceInitialSpin = new B(new Float32Array(MAX_PARTICLES_PER_GROUP), 1);

		geometry.setAttribute('instancePosition', instancePosition);
		geometry.setAttribute('instanceVelocity', instanceVelocity);
		geometry.setAttribute('instanceSpawnTime', instanceSpawnTime);
		geometry.setAttribute('instanceLifeTime', instanceLifeTime);
		geometry.setAttribute('instanceInitialSpin', instanceInitialSpin);

		let material = new THREE.SpriteMaterial({ map: ResourceManager.getTextureFromCache(o.texture), depthWrite: false });
		material.blending = o.blending;
		let mesh = new THREE.Mesh(geometry, material);
		(mesh as any).center = new THREE.Vector2(0.5, 0.5); // Sprite has this too, so we gotta add it
		this.level.scene.add(mesh);
		mesh.frustumCulled = false;
		mesh.renderOrder = 1337; // Something high to ensure correct rendering with other transparent objects

		material.onBeforeCompile = (shader) => {
			// Replace the shaders with our own
			shader.vertexShader = vertexShader;
			shader.fragmentShader = fragmentShader;

			let colorsMatrix = new THREE.Matrix4();
			colorsMatrix.set(
				o.colors[0]?.r || 0, o.colors[0]?.g || 0, o.colors[0]?.b || 0, o.colors[0]?.a || 0,
				o.colors[1]?.r || 0, o.colors[1]?.g || 0, o.colors[1]?.b || 0, o.colors[1]?.a || 0,
				o.colors[2]?.r || 0, o.colors[2]?.g || 0, o.colors[2]?.b || 0, o.colors[2]?.a || 0,
				o.colors[3]?.r || 0, o.colors[3]?.g || 0, o.colors[3]?.b || 0, o.colors[3]?.a || 0
			);
			colorsMatrix.transpose();

			// Set all the values that are true for every particle of this type
			Object.assign(shader.uniforms, {
				time: { value: 0 },
				acceleration: { value: o.acceleration },
				spinSpeed: { value: Util.degToRad(o.spinSpeed) },
				dragCoefficient: { value: o.dragCoefficient },
				times: { value: new THREE.Vector4(o.times[0] ?? Infinity, o.times[1] ?? Infinity, o.times[2] ?? Infinity, o.times[3] ?? Infinity) },
				sizes: { value: new THREE.Vector4(o.sizes[0] || 0, o.sizes[1] || 0, o.sizes[2] || 0, o.sizes[3] || 0) },
				colors: { value: colorsMatrix }
			});
			material.userData = shader;
		};

		let group: ParticleGroup = {
			mesh: mesh,
			geometry: geometry,
			material: material,
			particles: [],
			instancePosition,
			instanceVelocity,
			instanceSpawnTime,
			instanceLifeTime,
			instanceInitialSpin
		};
		return group;
	}

	getTime() {
		return this.level.timeState.timeSinceLoad;
	}

	createEmitter(options: ParticleEmitterOptions, initialPos: THREE.Vector3, getPos?: () => THREE.Vector3, spawnSphereSquish?: THREE.Vector3) {
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
		// Update all the particle groups
		for (let [, group] of this.particleGroups) {
			let shader = group.material.userData as THREE.Shader;
			if (!shader.uniforms) continue;
			shader.uniforms.time.value = time;

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
					group.geometry.instanceCount--;
					i--;
				}
			}

			group.mesh.visible = group.geometry.instanceCount > 0;
		}

		// Update the non-instanced legacy particles
		for (let i = 0; i < this.particles.length; i++) {
			let particle = this.particles[i];
			let alive = particle.render(time);

			if (!alive) {
				this.level.scene.remove(particle.sprite);
				this.particles.splice(i--, 1);
			}
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
	spawnSphereSquish: THREE.Vector3;

	constructor(options: ParticleEmitterOptions, manager: ParticleManager, getPos?: () => THREE.Vector3, spawnSphereSquish?: THREE.Vector3) {
		this.o = options;
		this.manager = manager;
		this.getPos = getPos;
		this.spawnSphereSquish = spawnSphereSquish ?? new THREE.Vector3(1, 1, 1);
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
		let randomPointOnSphere = new THREE.Vector3(Util.randomGaussian(), Util.randomGaussian(), Util.randomGaussian()).normalize();
		randomPointOnSphere.multiply(this.spawnSphereSquish);
		// Compute the total velocity
		let vel = this.vel.clone().multiplyScalar(this.o.inheritedVelFactor).add(randomPointOnSphere.multiplyScalar(this.o.ejectionVelocity + this.o.velocityVariance * (Math.random() * 2 - 1))).add(this.o.ambientVelocity);

		let instanced = Util.supportsInstancing(renderer);
		if (instanced) {
			let group = this.manager.getParticleGroup(this.o.particleOptions);
			if (group.particles.length === MAX_PARTICLES_PER_GROUP) return;

			let particle = new Particle(this.o.particleOptions, this.manager, time, pos, vel, false);
			particle.applyToGroup(group, group.particles.length);
			group.particles.push(particle);
			group.geometry.instanceCount++;
		} else {
			// We got no fancy instancing to use, fall back to the old version
			let particle = new Particle(this.o.particleOptions, this.manager, time, pos, vel, true);
			this.manager.level.scene.add(particle.sprite);
			this.manager.particles.push(particle);

			if (this.manager.particles.length > MAX_UNINSTANCED_PARTICLES) {
				// Remove the oldest one
				let popped = this.manager.particles.shift();
				this.manager.level.scene.remove(popped.sprite);
			}
		}
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

		return clone as ParticleEmitterOptions;
	}
}

class Particle {
	o: ParticleOptions;
	manager: ParticleManager;

	// For legacy non-instanced rendering:
	material: THREE.SpriteMaterial;
	sprite: THREE.Sprite;

	spawnTime: number;
	pos: THREE.Vector3;
	vel: THREE.Vector3;
	lifetime: number;
	initialSpin: number;

	constructor(options: ParticleOptions, manager: ParticleManager, spawnTime: number, pos: THREE.Vector3, vel: THREE.Vector3, createSprite: boolean) {
		this.o = options;
		this.manager = manager;

		this.spawnTime = spawnTime;
		this.pos = pos;
		this.vel = vel;

		this.lifetime = this.o.lifetime + this.o.lifetimeVariance * (Math.random() * 2 - 1);
		this.initialSpin = Util.lerp(this.o.spinRandomMin, this.o.spinRandomMax, Math.random());

		if (createSprite) {
			this.material = new THREE.SpriteMaterial({ map: ResourceManager.getTextureFromCache(this.o.texture), depthWrite: false });
			this.material.blending = this.o.blending;
			this.sprite = new THREE.Sprite(this.material);
			this.sprite.renderOrder = 1337;
		}
	}

	/** Writes this particle's starting state into vertex buffers so that it can be simulated on the GPU. */
	applyToGroup(group: ParticleGroup, index: number) {
		group.instanceSpawnTime.setX(index, this.spawnTime);
		group.instanceLifeTime.setX(index, this.lifetime);
		group.instancePosition.setXYZ(index, this.pos.x, this.pos.y, this.pos.z);
		group.instanceVelocity.setXYZ(index, this.vel.x, this.vel.y, this.vel.z);
		group.instanceInitialSpin.setX(index, Util.degToRad(this.initialSpin));

		group.instanceSpawnTime.needsUpdate = true;
		group.instanceLifeTime.needsUpdate = true;
		group.instancePosition.needsUpdate = true;
		group.instanceVelocity.needsUpdate = true;
		group.instanceInitialSpin.needsUpdate = true;
	}

	isAlive(time: number) {
		let elapsed = time - this.spawnTime;
		let completion = Util.clamp(elapsed / this.lifetime, 0, 1);

		return completion < 1;
	}

	render(time: number) {
		let elapsed = time - this.spawnTime;
		let completion = Util.clamp(elapsed / this.lifetime, 0, 1);

		if (completion === 1) {
			// The particle is dead
			return false;
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

		return true;
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