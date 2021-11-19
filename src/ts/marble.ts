import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { isPressed, gamepadAxes, normalizedJoystickHandlePosition } from "./input";
import { PHYSICS_TICK_RATE, TimeState, Level } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";
import { AudioManager, AudioSource } from "./audio";
import { StorageManager } from "./storage";
import { MisParser, MissionElementType } from "./parsing/mis_parser";
import { ParticleEmitter, ParticleEmitterOptions } from "./particles";
import { camera, marbleReflectionCamera, marbleReflectionRenderTarget, renderer } from "./rendering";
import { state } from "./state";

const DEFAULT_RADIUS = 0.2;
const ULTRA_RADIUS = 0.3;
const MEGA_MARBLE_RADIUS = 0.6666;
export const MARBLE_ROLL_FORCE = 40 || 40;
const TELEPORT_FADE_DURATION = 500;

export const bounceParticleOptions: ParticleEmitterOptions = {
	ejectionPeriod: 1,
	ambientVelocity: new THREE.Vector3(0, 0, 0),
	ejectionVelocity: 2.6,
	velocityVariance: 0.25 * 0.5,
	emitterLifetime: 4,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/star.png',
		blending: THREE.NormalBlending,
		spinSpeed: 90,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 500,
		lifetimeVariance: 100,
		dragCoefficient: 0.5,
		acceleration: -2,
		colors: [{r: 0.9, g: 0, b: 0, a: 1}, {r: 0.9, g: 0.9, b: 0, a: 1}, {r: 0.9, g: 0.9, b: 0, a: 0}],
		sizes: [0.25, 0.25, 0.25],
		times: [0, 0.75, 1]
	}
};

const blastParticleOptions: ParticleEmitterOptions = {
	ejectionPeriod: 0.9,
	ambientVelocity: new THREE.Vector3(0, 0, -0.3),
	ejectionVelocity: 3,
	velocityVariance: 0.4,
	emitterLifetime: 300,
	inheritedVelFactor: 0.25,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: THREE.AdditiveBlending,
		spinSpeed: 20,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 600,
		lifetimeVariance: 250,
		dragCoefficient: 0.2,
		acceleration: -0.1,
		colors: [{r: 25/255, g: 244/255, b: 255/255, a: 0.2}, {r: 25/255, g: 244/255, b: 255/255, a: 1}, {r: 25/255, g: 244/255, b: 255/255, a: 1}, {r: 25/255, g: 244/255, b: 255/255, a: 0}],
		sizes: [0.1, 0.1, 0.1],
		times: [0, 0.2, 0.75, 1]
	}
};
const blastMaxParticleOptions = ParticleEmitter.cloneOptions(blastParticleOptions);
blastMaxParticleOptions.ejectionVelocity = 4;
blastMaxParticleOptions.ejectionPeriod = 0.7;
blastMaxParticleOptions.particleOptions.dragCoefficient = 0.3;
blastMaxParticleOptions.particleOptions.colors = blastMaxParticleOptions.particleOptions.colors.map(x => { x.r = 255/255; x.g = 159/255; x.b = 25/255; return x; });

const applyReflectiveMarbleShader = (shader: THREE.Shader) => {
	shader.vertexShader = `
		varying vec3 vTransformedNormal;
	` + shader.vertexShader;
	shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', `
		#include <defaultnormal_vertex>
		vTransformedNormal = transformedNormal;
	`);
	
	shader.fragmentShader = `
		${Util.isSafari()? '#define SAFARI': ''} // This browser is just fucking stupid man idk
		varying vec3 vPosition;
		varying vec3 vTransformedNormal;
		uniform sampler2D selfMadeEnvMap;

		#ifdef SAFARI
		float tanh(float x) {
			return (exp(2.0 * x) - 1.0) / (exp(2.0 * x) + 1.0);
		}
		#endif
		#ifdef SAFARI
		float atanh(float x) {
			return 0.5 * log((1.0 + x) / (1.0 - x));
		}
		#endif
		float sigmoid(float x) {
			return 0.5 + 0.5 * tanh(2.0 * x - 1.0);
		}
		float invSigmoid(float x) {
			return 0.5 + 0.5 * atanh(2.0 * x - 1.0);
		}
	` + shader.fragmentShader;
	shader.fragmentShader = shader.fragmentShader.replace('#include <envmap_fragment>', `
		/*
		 * The idea here is the following: Our env map is in a normal perspective projection, and we want to map points on the sphere to where
		 * they would reflect off in the texture. The following math just performs some trig to find out the UV coords that correspond to the
		 * surface normal to create an accurate reflection.
		*/

		vec3 normal = normalize(vTransformedNormal);
		float fovHalves = 150.0 * PI / 180.0 / 2.0;
		float xAngle = -asin(normalize(normal * vec3(1, 0, 1)).x);
		float yAngle = asin(normalize(normal * vec3(0, 1, 1)).y);

		float u = tan(xAngle) / tan(fovHalves);
		float v = tan(yAngle) / tan(fovHalves);
		u = (u + 1.0) / 2.0;
		v = (v + 1.0) / 2.0;

		//float reflectAmount = invSigmoid(0.01 + 0.98 * texture2D(map, vUv).a);
		//reflectAmount = max(0.25, reflectAmount);
		float reflectAmount = 0.3; // For now
		reflectAmount -= 0.7 * (2.0 * normal.z - 1.0); // Fresnel thingy
		reflectAmount = sigmoid(reflectAmount);
		reflectAmount = 0.95 * reflectAmount;

		outgoingLight = mix(outgoingLight, texture2D(selfMadeEnvMap, vec2(u, v)).rgb, reflectAmount);

		#include <envmap_fragment>
	`);

	shader.uniforms.selfMadeEnvMap =  { value: marbleReflectionRenderTarget.texture };
};

/** Controls marble behavior and responds to player input. */
export class Marble {
	level: Level;
	group: THREE.Group;
	innerGroup: THREE.Group;
	sphere: THREE.Mesh;
	ballShape: Shape;
	shape: OIMO.Shape;
	body: OIMO.RigidBody;
	marbleTexture: THREE.Texture;
	/** The predicted position of the marble in the next tick. */
	predictedPosition: OIMO.Vec3;
	/** The predicted orientation of the marble in the next tick. */
	predictedOrientation: OIMO.Quat;

	/** The radius of the marble. */
	radius = DEFAULT_RADIUS;
	/** The default jump impulse of the marble. */
	jumpImpulse = 7.3; // For now, seems to fit more.
	/** The default restitution of the marble. */
	bounceRestitution = 0.5;

	get speedFac() {
		return DEFAULT_RADIUS / this.radius;
	}

	/** Forcefield around the player shown during super bounce and shock absorber usage. */
	forcefield: Shape;
	/** Helicopter shown above the marble shown during gyrocopter usage. */
	helicopter: Shape;
	superBounceEnableTime = -Infinity;
	shockAbsorberEnableTime = -Infinity;
	helicopterEnableTime = -Infinity;
	megaMarbleEnableTime = -Infinity;
	helicopterSound: AudioSource = null;
	shockAbsorberSound: AudioSource = null;
	superBounceSound: AudioSource = null;
	teleportEnableTime: number;
	teleportDisableTime: number;

	lastPos = new OIMO.Vec3();
	lastVel = new OIMO.Vec3();
	lastAngVel = new OIMO.Vec3();
	/** Necessary for super speed. */
	lastContactNormal = new OIMO.Vec3(0, 0, 1);
	/** Keep track of when the last collision happened to avoid handling collision with the same object twice in a row. */
	collisionTimeout = 0;
	slidingTimeout = 0;
	
	rollingSound: AudioSource;
	rollingMegaMarbleSound: AudioSource;
	slidingSound: AudioSource;

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		this.group = new THREE.Group();
		this.innerGroup = new THREE.Group();
		this.group.add(this.innerGroup);

		if (this.level.mission.misFile.marbleAttributes["jumpImpulse"] !== undefined) 
			this.jumpImpulse = MisParser.parseNumber(this.level.mission.misFile.marbleAttributes["jumpImpulse"]);
		if (this.level.mission.misFile.marbleAttributes["bounceRestitution"] !== undefined) 
			this.bounceRestitution = MisParser.parseNumber(this.level.mission.misFile.marbleAttributes["bounceRestitution"]);

		// Get the correct texture
		let marbleTexture: THREE.Texture;
		let customTextureBlob = await StorageManager.databaseGet('keyvalue', 'marbleTexture');
		if (customTextureBlob) {
			try {
				let url = ResourceManager.getUrlToBlob(customTextureBlob);
				marbleTexture = await ResourceManager.getTexture(url, false, '');
			} catch (e) {
				console.error("Failed to load custom marble texture:", e);
			}
		} else {
			marbleTexture = await ResourceManager.getTexture("shapes/balls/base.marble.png");
		}
		marbleTexture.flipY = true; // Because THREE.js UVs are different from what Torque would do
		this.marbleTexture = marbleTexture;

		let has2To1Texture = marbleTexture.image.width === marbleTexture.image.height * 2;

		// Create the 3D object
		if (has2To1Texture || (this.level.mission.modification === 'ultra' && !customTextureBlob)) {
			let ballShape = new Shape();
			ballShape.shareMaterials = false;
			ballShape.dtsPath = 'shapes/balls/pack1/pack1marble.dts';
			ballShape.castShadow = true;
			ballShape.normalizeVertexNormals = true; // We do this so that the marble doesn't get darker the larger it gets
			if (this.isReflective()) ballShape.onBeforeMaterialCompile = applyReflectiveMarbleShader;
			if (customTextureBlob) ballShape.matNamesOverride['base.marble'] = marbleTexture;
			await ballShape.init(this.level);
			this.innerGroup.add(ballShape.group);
			this.ballShape = ballShape;
		}

		let geometry = new THREE.SphereBufferGeometry(1, 32, 16);
		let sphereMaterial = new THREE.MeshLambertMaterial({ map: marbleTexture, color: 0xffffff });
		let sphere = new THREE.Mesh(geometry, sphereMaterial);
		sphere.material.onBeforeCompile = shader => shader.vertexShader = '#define NORMALIZE_TRANSFORMED_NORMAL\n' + shader.vertexShader; // Same thing as with ballShape
		sphere.castShadow = true;
		this.sphere = sphere;
		this.innerGroup.add(sphere);

		sphere.material.onBeforeCompile = shader => {
			shader.vertexShader = '#define NORMALIZE_TRANSFORMED_NORMAL\n' + shader.vertexShader; // Same thing as with ballShape
			if (this.isReflective()) applyReflectiveMarbleShader(shader);
		};
		sphere.material.customProgramCacheKey = () => sphere.material.onBeforeCompile.toString() + (this.isReflective()? applyReflectiveMarbleShader.toString() : null);

		// Create the collision geometry
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = new OIMO.SphereGeometry(1);
		shapeConfig.friction = 1;
		shapeConfig.restitution = this.bounceRestitution;
		let shape = new OIMO.Shape(shapeConfig);
		this.shape = shape;

		let config = new OIMO.RigidBodyConfig();
		let body = new OIMO.RigidBody(config);
		body.setAutoSleep(false);
		body.addShape(shape);
		this.body = body;

		// Set the marble's default orientation to be close to actual MBP
		let mat3 = body.getRotation();
		mat3.fromEulerXyz(new OIMO.Vec3(Math.PI/2, Math.PI * 7/6));
		body.setRotation(mat3);

		this.forcefield = new Shape();
		this.forcefield.dtsPath = "shapes/images/glow_bounce.dts";
		await this.forcefield.init(this.level);
		this.forcefield.setOpacity(0);
		this.forcefield.showSequences = false; // Hide the weird default animation it does
		this.innerGroup.add(this.forcefield.group);

		this.helicopter = new Shape();
		// Easter egg: Due to an iconic bug where the helicopter would instead look like a glow bounce, this can now happen 0.1% of the time.
		this.helicopter.dtsPath = (Math.random() < 1 / 1000)? "shapes/images/glow_bounce.dts" : "shapes/images/helicopter.dts";
		this.helicopter.castShadow = true;
		await this.helicopter.init(this.level);
		this.helicopter.setOpacity(0);
		this.group.add(this.helicopter.group);

		// Load the necessary rolling sounds
		let toLoad = ["jump.wav", "bouncehard1.wav", "bouncehard2.wav", "bouncehard3.wav", "bouncehard4.wav", "rolling_hard.wav", "sliding.wav"];
		if (this.level.mission.hasBlast) toLoad.push("blast.wav");
		await AudioManager.loadBuffers(toLoad);

		this.rollingSound = AudioManager.createAudioSource('rolling_hard.wav');
		this.rollingSound.play();
		this.rollingSound.gain.gain.value = 0;
		this.rollingSound.setLoop(true);

		// Check if we need to prep a Mega Marble sound
		if (this.level.mission.allElements.some(x => x._type === MissionElementType.Item && x.datablock?.toLowerCase() === 'megamarbleitem')) {
			this.rollingMegaMarbleSound = AudioManager.createAudioSource('mega_roll.wav');
			this.rollingMegaMarbleSound.gain.gain.value = 0;
			this.rollingMegaMarbleSound.setLoop(true);
		}

		this.slidingSound = AudioManager.createAudioSource('sliding.wav');
		this.slidingSound.play();
		this.slidingSound.gain.gain.value = 0;
		this.slidingSound.setLoop(true);

		await Promise.all([this.rollingSound.promise, this.slidingSound.promise, this.rollingMegaMarbleSound?.promise]);
	}

	/** Returns true iff the marble should use special reflective shaders. */
	isReflective() {
		return (StorageManager.data.settings.marbleReflectivity === 2 || (StorageManager.data.settings.marbleReflectivity === 0 && this.level.mission.modification === 'ultra')) && !Util.isIOS();
		// On some iOS devices, the reflective marble is invisible. That implies a shader compilation error but I sadly cannot check the console on there so we're just disabling them for all iOS devices.
	}

	tick(time: TimeState) {
		// Construct the raw movement vector from inputs
		let movementVec = new THREE.Vector3(0, 0, 0);
		if (isPressed('up')) movementVec.add(new THREE.Vector3(1, 0, 0));
		if (isPressed('down')) movementVec.add(new THREE.Vector3(-1, 0, 0));
		if (isPressed('left')) movementVec.add(new THREE.Vector3(0, 1, 0));
		if (isPressed('right')) movementVec.add(new THREE.Vector3(0, -1, 0));
		
		// Add gamepad input and restrict if necessary
		movementVec.add(new THREE.Vector3(-gamepadAxes.marbleY, -gamepadAxes.marbleX));
		if (normalizedJoystickHandlePosition) movementVec.add(new THREE.Vector3(
			-Util.signedSquare(normalizedJoystickHandlePosition.y),
			-Util.signedSquare(normalizedJoystickHandlePosition.x)
		));
		if (movementVec.x > 1.0)
			movementVec.x = 1.0;
		if (movementVec.x < -1.0)
			movementVec.x = -1.0;
		if (movementVec.y > 1.0)
			movementVec.y = 1.0;
		if (movementVec.y < -1.0)
			movementVec.y = -1.0;

		if (state.menu.finishScreen.showing) movementVec.multiplyScalar(0);
		let inputStrength = movementVec.length();

		// Rotate the vector accordingly
		movementVec.multiplyScalar(MARBLE_ROLL_FORCE * 5 / PHYSICS_TICK_RATE);
		movementVec.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.level.yaw);

		let quat = this.level.newOrientationQuat;
		movementVec.applyQuaternion(quat);

		// Try to find a touching contact
		let current = this.body.getContactLinkList();
		let touching: OIMO.ContactLink;
		let allContactNormals: OIMO.Vec3[] = []; // Keep a list of all contact normals here
		while (current) {
			let contact = current.getContact();
			if (contact.isTouching()) {
				touching = current;
				
				// Update the contact to fix artifacts
				let contact = current.getContact();
				contact._updateManifold();
				contact._postSolve();

				let contactNormal = contact.getManifold().getNormal();
				let surfaceShape = contact.getShape2();
				if (surfaceShape === this.shape) {
					// Invert the normal based on shape order
					contactNormal.scaleEq(-1);
					surfaceShape = contact.getShape1();
				}

				allContactNormals.push(contactNormal);
			}

			current = current.getNext();
		}
		current = touching; // Take the last touching contact. Only doing collision logic with one contact normal might seem questionable, but keep in mind that there almost always will be only one.

		// The axis of rotation (for angular velocity) is the cross product of the current up vector and the movement vector, since the axis of rotation is perpendicular to both.
		let movementRotationAxis = this.level.currentUp.cross(Util.vecThreeToOimo(movementVec));

		this.collisionTimeout--;
		this.slidingTimeout--;

		if (current) {
			let contact = current.getContact();
			//let contactNormal = contact.getManifold().getNormal();
			let surfaceShape = contact.getShape2();
			if (surfaceShape === this.shape) surfaceShape = contact.getShape1();
			let contactNormal = Util.last(allContactNormals);
			this.lastContactNormal = contactNormal;
			let inverseContactNormal = contactNormal.scale(-1);

			// How much the current surface is pointing up
			let contactNormalUpDot = Math.abs(contactNormal.dot(this.level.currentUp));
			let collisionTimeoutNeeded = false;

			// The rotation necessary to get from the up vector to the contact normal.
			let contactNormalRotation = new OIMO.Quat();
			contactNormalRotation.setArc(this.level.currentUp, contactNormal);
			movementRotationAxis.mulMat3Eq(contactNormalRotation.toMat3());

			let lastSurfaceRelativeVelocity = this.lastVel.sub(surfaceShape.getRigidBody().getLinearVelocity());
			let surfaceRelativeVelocity = this.body.getLinearVelocity().subEq(surfaceShape.getRigidBody().getLinearVelocity());
			let maxDotSlide = 0.5; // 30°

			// Implements sliding: If we hit the surface at an angle below 45°, and have movement keys pressed, we don't bounce.
			let dot0 = -contactNormal.dot(lastSurfaceRelativeVelocity.clone().normalize());
			if (this.slidingTimeout <= 0 && dot0 > 0.001 && dot0 <= maxDotSlide && movementVec.length() > 0) {
				let dot = contactNormal.dot(surfaceRelativeVelocity);
				let linearVelocity = this.body.getLinearVelocity();
				let originalLength = linearVelocity.length();
				linearVelocity.addScaledEq(contactNormal, -dot); // Remove all velocity in the direction of the surface normal

				let newLength = this.body.getLinearVelocity().length();
				let diff = originalLength - newLength;
				linearVelocity.normalize().scaleEq(newLength + diff * 2); // Give a small speedboost

				this.body.setLinearVelocity(linearVelocity);
			}

			let combinedRestitution = surfaceShape.getRestitution() * this.shape.getRestitution();

			// If we're using a shock absorber or we're on a low-restitution surface, give the marble a velocity boost on contact based on its angular velocity.
			outer:
			if (combinedRestitution < 0.5) {
				let dot = -this.lastVel.dot(contactNormal);
				if (dot < 0) break outer;

				let boost = this.lastAngVel.cross(contactNormal).scaleEq(2 * (0.5 - combinedRestitution) * dot / 300 / 0.98); // 0.98 fac because shock absorber used to have 0 rest but now 0.01
				this.body.addLinearVelocity(boost);
			}

			// Create a certain velocity boost on collisions with walls based on angular velocity. This assists in making wall-hits feel more natural.
			outer:
			if (this.collisionTimeout <= 0) {
				let angularBoost = this.body.getAngularVelocity().cross(contactNormal).scaleEq((1 - Math.abs(contactNormal.dot(this.level.currentUp))) * contactNormal.dot(this.body.getLinearVelocity()) / (Math.PI * 2) / 15);
				if (angularBoost.length() < 0.01) break outer;

				// Remove a bit of the current velocity so that the response isn't too extreme
				let currentVelocity = this.body.getLinearVelocity();
				let ratio = angularBoost.length() / currentVelocity.length();
				currentVelocity.scaleEq(1 / (1 + ratio * 0.5)).addEq(angularBoost);
				this.body.setLinearVelocity(currentVelocity);

				collisionTimeoutNeeded = true;
			}

			// See if, out of all contact normals, there is one that's not at a 90° angle to the up vector.
			let allContactNormalUpDots = allContactNormals.map(x => Math.abs(x.dot(this.level.currentUp)));
			if (this.collisionTimeout <= 0 && !state.menu.finishScreen.showing && (isPressed('jump') || this.level.jumpQueued) && allContactNormalUpDots.some(x => x > 1e-10)) {
				// Handle jumping
				this.setLinearVelocityInDirection(contactNormal, this.jumpImpulse + surfaceShape.getRigidBody().getLinearVelocity().dot(contactNormal), true, () => {
					this.playJumpSound();
					collisionTimeoutNeeded = true;
					if (this.level.replay.canStore) this.level.replay.jumpSoundTimes.push(this.level.replay.currentTickIndex);
				});
			}

			let impactVelocity = -contactNormal.dot(this.lastVel.sub(surfaceShape.getRigidBody().getLinearVelocity()));
			if (this.collisionTimeout <= 0) {
				// Create bounce particles
				if (impactVelocity > 6) this.showBounceParticles();

				let volume = Util.clamp((impactVelocity / 12)**1.5, 0, 1);

				if (impactVelocity > 1) {
					// Play a collision impact sound
					this.playBounceSound(volume);
					collisionTimeoutNeeded = true;
					if (this.level.replay.canStore) this.level.replay.bounceTimes.push({ tickIndex: this.level.replay.currentTickIndex, volume: volume, showParticles: impactVelocity > 6 });
				}
			}

			// Handle rolling and sliding sounds
			if (contactNormal.dot(surfaceRelativeVelocity) < 0.01) {
				let predictedMovement = this.body.getAngularVelocity().cross(this.level.currentUp).scaleEq(1 / Math.PI / 2);
				// The expected movement based on the current angular velocity. If actual movement differs too much, we consider the marble to be "sliding".

				if (predictedMovement.dot(surfaceRelativeVelocity) < -0.00001 || (predictedMovement.length() > 0.5 && predictedMovement.length() > surfaceRelativeVelocity.length() * 1.5)) {
					this.slidingSound.gain.gain.value = 0.6;
					this.rollingSound.gain.gain.value = 0;
					if (this.rollingMegaMarbleSound) this.rollingMegaMarbleSound.gain.gain.value = 0;
				} else {
					this.slidingSound.gain.gain.value = 0;
					let pitch = Util.clamp(surfaceRelativeVelocity.length() / 15, 0, 1) * 0.75 + 0.75;

					this.rollingSound.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), AudioManager.context.currentTime + 0.02);
					this.rollingMegaMarbleSound?.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), AudioManager.context.currentTime + 0.02);
					this.rollingSound.setPlaybackRate(pitch);
					this.rollingMegaMarbleSound?.setPlaybackRate(pitch);
				}
			} else {
				this.slidingSound.gain.gain.value = 0;
				this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
				this.rollingMegaMarbleSound?.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
			}

			// Weaken the marble's angular power based on the friction and steepness of the surface
			let dot = Util.vecThreeToOimo(movementVec).normalize().dot(inverseContactNormal);
			let penalty = Math.max(0, dot - Math.max(0, (surfaceShape.getFriction() - 1.0)));
			movementRotationAxis.scaleEq(1 - penalty);

			let combinedFriction = surfaceShape.getFriction() * this.shape.getFriction();

			// Apply angular velocity changes
			let angVel = this.body.getAngularVelocity();

			// Subtract the movement axis so it doesn't get slowed down
			let direction = movementRotationAxis.clone().normalize();
			let dot2 = Math.max(0, angVel.dot(direction));
			angVel.addScaledEq(direction, -dot2);

			// Subtract the "surface rotation axis", this ensures we can roll down hills quickly
			let surfaceRotationAxis = this.level.currentUp.cross(contactNormal);
			let dot3 = Math.max(angVel.dot(surfaceRotationAxis), 0);
			angVel.addScaledEq(surfaceRotationAxis, -dot3);

			angVel.scaleEq(0.02 ** (Math.min(1, combinedFriction) / PHYSICS_TICK_RATE)); // Handle velocity slowdown

			// Add them back
			angVel.addScaledEq(surfaceRotationAxis, dot3);
			angVel.addScaledEq(direction, dot2);

			if (angVel.length() > 285 * this.speedFac) angVel.scaleEq(285 * this.speedFac / angVel.length()); // Absolute max angular speed
			this.body.setAngularVelocity(angVel);

			if (dot2 + movementRotationAxis.length() > 12 * Math.PI*2 * inputStrength / contactNormalUpDot * this.speedFac) {
				// Cap the rolling velocity
				let newLength = Math.max(0, 12 * Math.PI*2 * inputStrength / contactNormalUpDot * this.speedFac - dot2);
				movementRotationAxis = movementRotationAxis.normalize().scaleEq(newLength);
			}

			if (collisionTimeoutNeeded) this.collisionTimeout = 2;
		}

		// Handle airborne movement
		if (!current) {
			// Angular acceleration isn't quite as speedy
			movementRotationAxis.scaleEq(1/2);

			let airMovementVector = new OIMO.Vec3(movementVec.x, movementVec.y, movementVec.z);
			let airVelocity = (time.currentAttemptTime - this.helicopterEnableTime) < 5000 ? 5 : 3.2; // Change air velocity for the helicopter
			if (this.level.finishTime) airVelocity = 0;
			airMovementVector.scaleEq(airVelocity / PHYSICS_TICK_RATE);
			this.body.addLinearVelocity(airMovementVector);

			this.slidingSound.gain.gain.value = 0;
			this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
			this.rollingMegaMarbleSound?.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
		}

		movementRotationAxis.scaleEq(this.speedFac);
		// Apply angular acceleration, but make sure the angular velocity doesn't exceed some maximum
		this.body.setAngularVelocity(Util.addToVectorCapped(this.body.getAngularVelocity(), movementRotationAxis, 120 * this.speedFac));

		this.lastPos = this.body.getPosition();
		this.lastVel = this.body.getLinearVelocity();
		this.lastAngVel = this.body.getAngularVelocity();

		// Store sound state in the replay
		let r = this.level.replay;
		if (r.canStore) {
			r.rollingSoundGain.push(this.rollingSound.gain.gain.value);
			r.rollingSoundPlaybackRate.push((this.rollingSound.node as AudioBufferSourceNode).playbackRate.value);
			r.slidingSoundGain.push(this.slidingSound.gain.gain.value);
		}
	}

	updatePowerUpStates(time: TimeState) {
		if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
			// Show the shock absorber (takes precedence over super bounce)
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0.01);  // Yep it's not actually zero

			if (!this.shockAbsorberSound) {
				this.shockAbsorberSound = AudioManager.createAudioSource('superbounceactive.wav');
				this.shockAbsorberSound.setLoop(true);
				this.shockAbsorberSound.play();
			}
		} else if (time.currentAttemptTime - this.superBounceEnableTime < 5000) {
			// Show the super bounce
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0.9);

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
		} else {
			// Stop both shock absorber and super bounce
			this.forcefield.setOpacity(0);
			this.shape.setRestitution(this.bounceRestitution);

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
			this.superBounceSound?.stop();
			this.superBounceSound = null;
		}
		if (time.currentAttemptTime - this.superBounceEnableTime < 5000 && !this.superBounceSound) {
			// Play the super bounce sound
			this.superBounceSound = AudioManager.createAudioSource('forcefield.wav');
			this.superBounceSound.setLoop(true);
			this.superBounceSound.play();
		}

		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) {
			// Show the helicopter
			this.helicopter.setOpacity(1);
			this.helicopter.setTransform(new THREE.Vector3(0, 0, this.radius - DEFAULT_RADIUS).applyQuaternion(this.level.newOrientationQuat), this.level.newOrientationQuat, new THREE.Vector3(1, 1, 1));
			this.level.setGravityIntensity(this.level.defaultGravity * 0.25);
			
			if (!this.helicopterSound) {
				this.helicopterSound = AudioManager.createAudioSource('use_gyrocopter.wav');
				this.helicopterSound.setLoop(true);
				this.helicopterSound.play();
			}
		} else {
			// Stop the helicopter
			this.helicopter.setOpacity(0);
			this.level.setGravityIntensity(this.level.defaultGravity);

			this.helicopterSound?.stop();
			this.helicopterSound = null;
		}

		if (this.radius !== MEGA_MARBLE_RADIUS && time.currentAttemptTime - this.megaMarbleEnableTime < 10000) {
			this.setRadius(MEGA_MARBLE_RADIUS);
			this.body.addLinearVelocity(this.level.currentUp.scale(6)); // There's a small yeet upwards
			this.rollingSound.stop();
			this.rollingMegaMarbleSound?.play();
		} else if (time.currentAttemptTime - this.megaMarbleEnableTime >= 10000) {
			this.setRadius(this.level.mission.hasUltraMarble? ULTRA_RADIUS : DEFAULT_RADIUS);
			this.rollingSound.play();
			this.rollingMegaMarbleSound?.stop();
		}
	}

	playJumpSound() {
		AudioManager.play(['jump.wav']);
	}

	playBounceSound(volume: number) {
		let prefix = (this.radius === MEGA_MARBLE_RADIUS)? 'mega_' : '';
		AudioManager.play(['bouncehard1.wav', 'bouncehard2.wav', 'bouncehard3.wav', 'bouncehard4.wav'].map(x => prefix + x), volume);
	}

	showBounceParticles() {
		this.level.particles.createEmitter(bounceParticleOptions, Util.vecOimoToThree(this.body.getPosition()));
	}

	/** Sets linear velocity in a specific direction, but capped. Used for things like jumping and bumpers. */
	setLinearVelocityInDirection(direction: OIMO.Vec3, magnitude: number, onlyIncrease: boolean, onIncrease: () => any = () => {}) {
		let unitVelocity = this.body.getLinearVelocity().clone().normalize();
		let dot = unitVelocity.dot(direction);
		let directionalSpeed = dot * this.body.getLinearVelocity().length();

		if (directionalSpeed < magnitude || !onlyIncrease) {
			let velocity = this.body.getLinearVelocity();
			velocity.addScaledEq(direction, -directionalSpeed);
			velocity.addScaledEq(direction, magnitude);

			this.body.setLinearVelocity(velocity);
			if (directionalSpeed < magnitude) onIncrease();
		}
	}

	/** Predicts the position of the marble in the next physics tick to allow for smooth, interpolated rendering. */
	calculatePredictiveTransforms() {
		let vel = this.body.getLinearVelocity();
		let pos = this.body.getPosition();
		let orientation = this.body.getOrientation();

		// Naive: Just assume the marble moves as if nothing was in its way and it continued with its current velocity.
		let predictedPosition = pos.add(vel.scale(1 / PHYSICS_TICK_RATE)).addEq(this.level.physics.world.getGravity().scale(1 / PHYSICS_TICK_RATE**2 / 2));
		let finalPredictedPosition = predictedPosition;
		let movementDiff = predictedPosition.sub(pos);

		let physics = this.level.physics;
		let minFraction = Infinity;
		let transform = this.body.getTransform();
		transform.setPosition(transform.getPosition().sub(movementDiff));

		// To prevent interpolating the marble into surfaces, perform a convex cast and check for any intersections.
		physics.world.convexCast(physics.marbleGeometry, transform, movementDiff.scale(10), {
			process(shape, hit) {
				if (shape.getRigidBody().getType() !== OIMO.RigidBodyType.STATIC) return;
				let fraction = hit.fraction * 10 - 1; // Readjust the fraction to the correct interval
				if (fraction < 0 || fraction > 1) return;
				if (fraction >= minFraction) return;

				minFraction = fraction;
				finalPredictedPosition = Util.lerpOimoVectors(pos, predictedPosition, fraction);
			}
		});

		let angVel = this.body.getAngularVelocity();
		let threeOrientation = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
		let changeQuat = new THREE.Quaternion();
		changeQuat.setFromAxisAngle(Util.vecOimoToThree(angVel).normalize(), angVel.length() / PHYSICS_TICK_RATE);
		changeQuat.multiply(threeOrientation);
		let predictedOrientation = new OIMO.Quat(threeOrientation.x, threeOrientation.y, threeOrientation.z, threeOrientation.w);

		this.predictedPosition = finalPredictedPosition;
		this.predictedOrientation = predictedOrientation;
	}

	render(time: TimeState) {
		// Position based on current and predicted position and orientation
		let bodyPosition = Util.lerpOimoVectors(this.body.getPosition(), this.predictedPosition, time.physicsTickCompletion);
		let bodyOrientation = this.body.getOrientation().slerp(this.predictedOrientation, time.physicsTickCompletion);
		this.group.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
		this.innerGroup.quaternion.set(bodyOrientation.x, bodyOrientation.y, bodyOrientation.z, bodyOrientation.w);

		this.forcefield.render(time);
		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) this.helicopter.render(time);

		// Update the teleporting look:

		let mat = this.sphere.material as THREE.MeshLambertMaterial;
		let teleportFadeCompletion = 0;

		if (this.teleportEnableTime !== null) teleportFadeCompletion = Util.clamp((time.currentAttemptTime - this.teleportEnableTime) / TELEPORT_FADE_DURATION, 0, 1);
		if (this.teleportDisableTime !== null) teleportFadeCompletion = Util.clamp(1 - (time.currentAttemptTime - this.teleportDisableTime) / TELEPORT_FADE_DURATION, 0, 1);

		if (teleportFadeCompletion > 0) {
			if (mat.map) {
				mat.map = null;
				mat.needsUpdate = true;
			}
			mat.opacity = Util.lerp(1, 0.25, teleportFadeCompletion);
			mat.transparent = true;
			mat.flatShading = true;
			this.sphere.castShadow = false;
			this.sphere.visible = true;
		} else {
			if (!mat.map) {
				mat.map = this.marbleTexture;
				mat.needsUpdate = true;
			}
			mat.opacity = 1;
			mat.transparent = false;
			mat.flatShading = false;
			this.sphere.castShadow = true;
			this.sphere.visible = !this.ballShape;
		}
	}

	renderReflection() {
		if (!this.isReflective()) return;
		
		marbleReflectionCamera.position.copy(camera.position);
		marbleReflectionCamera.quaternion.copy(camera.quaternion);
		Util.cameraLookAtDirect(marbleReflectionCamera, this.group.position);
		marbleReflectionCamera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), Math.PI); // Flip it 180
		marbleReflectionCamera.position.copy(this.group.position);

		this.group.visible = false; // To avoid framebuffer recursion ("feedback loop")
		let renderTargetBefore = renderer.getRenderTarget();
		renderer.setRenderTarget(marbleReflectionRenderTarget);
		renderer.render(this.level.scene, marbleReflectionCamera);
		renderer.setRenderTarget(renderTargetBefore);
		this.group.visible = true;
	}

	enableSuperBounce(time: TimeState) {
		this.superBounceEnableTime = time.currentAttemptTime;
	}

	enableShockAbsorber(time: TimeState) {
		this.shockAbsorberEnableTime = time.currentAttemptTime;
	}

	enableHelicopter(time: TimeState) {
		this.helicopterEnableTime = time.currentAttemptTime;
	}

	enableTeleportingLook(time: TimeState) {
		let completion = (this.teleportDisableTime !== null)? Util.clamp((time.currentAttemptTime - this.teleportDisableTime) / TELEPORT_FADE_DURATION, 0, 1) : 1;
		this.teleportEnableTime = time.currentAttemptTime - TELEPORT_FADE_DURATION * (1 - completion);
		this.teleportDisableTime = null;
	}
	
	disableTeleportingLook(time: TimeState) {
		let completion = Util.clamp((time.currentAttemptTime - this.teleportEnableTime) / TELEPORT_FADE_DURATION, 0, 1) ?? 1;
		this.teleportDisableTime = time.currentAttemptTime - TELEPORT_FADE_DURATION * (1 - completion);
		this.teleportEnableTime = null;
	}

	enableMegaMarble(time: TimeState) {
		this.megaMarbleEnableTime = time.currentAttemptTime;
	}

	useBlast() {
		if (this.level.blastAmount < 0.2 || !this.level.mission.hasBlast) return;

		let impulse = this.level.currentUp.scale(Math.max(Math.sqrt(this.level.blastAmount), this.level.blastAmount) * 10);
		this.body.addLinearVelocity(impulse);
		AudioManager.play('blast.wav');
		this.level.particles.createEmitter(
			(this.level.blastAmount > 1)? blastMaxParticleOptions : blastParticleOptions,
			null,
			() => Util.vecOimoToThree(this.body.getPosition().addScaledEq(this.level.currentUp, -this.radius * 0.4)),
			new THREE.Vector3(1, 1, 1).addScaledVector(Util.absVector(Util.vecOimoToThree(this.level.currentUp)), -0.8)
		);

		this.level.blastAmount = 0;
		this.level.replay.recordUseBlast();
	}

	/** Updates the radius of the marble both visually and physically. */
	setRadius(radius: number) {
		this.radius = radius;
		this.sphere.scale.setScalar(radius);
		this.ballShape?.setTransform(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3().setScalar(radius / DEFAULT_RADIUS));

		let geom = this.body.getShapeList()._geom as OIMO.SphereGeometry;
		geom._radius = radius;
		geom._gjkMargin = radius;
		this.body.addShape(null); // I hacked OIMO a bit, this will trigger a recompute of the mass and stuff

		this.forcefield.group.scale.setScalar(this.radius / DEFAULT_RADIUS);
	}

	reset() {
		this.body.setLinearVelocity(new OIMO.Vec3());
		this.body.setAngularVelocity(new OIMO.Vec3());
		this.superBounceEnableTime = -Infinity;
		this.shockAbsorberEnableTime = -Infinity;
		this.helicopterEnableTime = -Infinity;
		this.teleportEnableTime = null;
		this.teleportDisableTime = null;
		this.megaMarbleEnableTime = -Infinity;
		this.lastContactNormal = new OIMO.Vec3(0, 0, 1);
		this.lastVel = new OIMO.Vec3();
		this.collisionTimeout = 0;
		this.slidingTimeout = 0;
		this.predictedPosition = this.body.getPosition();
		this.predictedOrientation = this.body.getOrientation();
		this.setRadius(this.level.mission.hasUltraMarble? ULTRA_RADIUS : DEFAULT_RADIUS);

		let mat = this.sphere.material as THREE.MeshLambertMaterial;
		mat.map = this.marbleTexture;
		mat.needsUpdate = true;
	}
}