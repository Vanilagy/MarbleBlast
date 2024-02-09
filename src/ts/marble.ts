import { ResourceManager } from "./resources";
import { isPressed, gamepadAxes, normalizedJoystickHandlePosition, getPressedFlag } from "./input";
import { TimeState, Level, GO_TIME, PHYSICS_TICK_RATE } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";
import { AudioSource } from "./audio";
import { StorageManager } from "./storage";
import { MisParser, MissionElementType } from "./parsing/mis_parser";
import { ParticleEmitter, ParticleEmitterOptions } from "./particles";
import { state } from "./state";
import { Group } from "./rendering/group";
import { Geometry } from "./rendering/geometry";
import { Material } from "./rendering/material";
import { Texture } from "./rendering/texture";
import { Mesh } from "./rendering/mesh";
import { CubeTexture } from "./rendering/cube_texture";
import { CubeCamera } from "./rendering/cube_camera";
import { mainRenderer } from "./ui/misc";
import { RigidBody } from "./physics/rigid_body";
import { BallCollisionShape } from "./physics/collision_shape";
import { Collision } from "./physics/collision";
import { Vector3 } from "./math/vector3";
import { Quaternion } from "./math/quaternion";
import { Euler } from "./math/euler";
import { BlendingType } from "./rendering/renderer";

const DEFAULT_RADIUS = 0.2;
const ULTRA_RADIUS = 0.3;
const MEGA_MARBLE_RADIUS = 0.6666;
export const MARBLE_ROLL_FORCE = 40 || 40;
const TELEPORT_FADE_DURATION = 500;

export const bounceParticleOptions: ParticleEmitterOptions = {
	ejectionPeriod: 1,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 2.6,
	velocityVariance: 0.25 * 0.5,
	emitterLifetime: 3, // Spawn 4 particles
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/star.png',
		blending: BlendingType.Normal,
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
	ambientVelocity: new Vector3(0, 0, -0.3),
	ejectionVelocity: 3,
	velocityVariance: 0.4,
	emitterLifetime: 300,
	inheritedVelFactor: 0.25,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: BlendingType.Additive,
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

/** Controls marble behavior and responds to player input. */
export class Marble {
	level: Level;
	group: Group;
	innerGroup: Group;
	sphere: Mesh;
	ballShape: Shape;
	/** The predicted position of the marble in the next tick. */
	predictedPosition = new Vector3();
	/** The predicted orientation of the marble in the next tick. */
	predictedOrientation = new Quaternion();

	body: RigidBody;
	/** Main collision shape of the marble. */
	shape: BallCollisionShape;
	/** First auxiliary collision shape of the marble; being twice as big as the normal shape, it's responsible for colliding with shapes such as gems and power-ups. */
	largeAuxShape: BallCollisionShape;
	/** Second auxiliary collision shape of the marble; is responsible for colliding with triggers. */
	smallAuxShape: BallCollisionShape;

	/** The radius of the marble. */
	radius: number = null;
	/** The default jump impulse of the marble. */
	jumpImpulse = 0 || 7.3; // For now, seems to fit more than the "actual" 7.5.
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

	lastMovementVec = new Vector3();
	beforeVel = new Vector3();
	beforeAngVel = new Vector3();
	/** Necessary for super speed. */
	lastContactNormal = new Vector3();
	slidingTimeout = 0;

	rollingSound: AudioSource;
	rollingMegaMarbleSound: AudioSource;
	slidingSound: AudioSource;

	cubeMap: CubeTexture;
	cubeCamera: CubeCamera;

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		this.group = new Group();
		this.innerGroup = new Group();
		this.group.add(this.innerGroup);

		if (this.level.mission.misFile.marbleAttributes["jumpImpulse"] !== undefined)
			this.jumpImpulse = MisParser.parseNumber(this.level.mission.misFile.marbleAttributes["jumpImpulse"]);
		if (this.level.mission.misFile.marbleAttributes["bounceRestitution"] !== undefined)
			this.bounceRestitution = MisParser.parseNumber(this.level.mission.misFile.marbleAttributes["bounceRestitution"]);

		// Get the correct texture
		let marbleTexture: Texture;
		let customTextureBlob = this.level.offlineSettings?.marbleTexture !== undefined ? this.level.offlineSettings.marbleTexture : await StorageManager.databaseGet('keyvalue', 'marbleTexture');
		if (customTextureBlob) {
			try {
				let url = ResourceManager.getUrlToBlob(customTextureBlob);
				marbleTexture = await ResourceManager.getTexture(url, '');
			} catch (e) {
				console.error("Failed to load custom marble texture:", e);
			}
		} else {
			marbleTexture = await ResourceManager.getTexture("shapes/balls/base.marble.png");
		}

		let has2To1Texture = marbleTexture.image.width === marbleTexture.image.height * 2;

		if (this.isReflective()) {
			this.cubeMap = new CubeTexture(mainRenderer, 128);
			this.cubeCamera = new CubeCamera(0.025, this.level.camera.far);
		}

		const addMarbleReflectivity = (m: Material) => {
			m.envMap = this.cubeMap;
			m.envMapZUp = false;
			m.reflectivity = 0.7;
			m.useFresnel = true;
			m.useAccurateReflectionRay = true;
		};

		// Create the 3D object
		if (has2To1Texture || (this.level.mission.modification === 'ultra' && !customTextureBlob)) {
			let ballShape = new Shape();
			ballShape.shareMaterials = false;
			ballShape.dtsPath = 'shapes/balls/pack1/pack1marble.dts';
			ballShape.castShadows = true;
			ballShape.materialPostprocessor = m => {
				m.normalizeNormals = true; // We do this so that the marble doesn't get darker the larger it gets
				m.flipY = true;

				if (this.isReflective()) addMarbleReflectivity(m);
			};

			if (customTextureBlob) ballShape.matNamesOverride['base.marble'] = marbleTexture;
			await ballShape.init(this.level);
			this.innerGroup.add(ballShape.group);
			this.ballShape = ballShape;
		}

		let geometry = Geometry.createSphereGeometry(1, 32, 16);
		let sphereMaterial = new Material();
		sphereMaterial.diffuseMap = marbleTexture;
		sphereMaterial.normalizeNormals = true;
		sphereMaterial.flipY = true;

		if (this.isReflective()) addMarbleReflectivity(sphereMaterial);

		// Create the sphere's mesh
		let sphere = new Mesh(geometry, [sphereMaterial]);
		sphere.castShadows = true;
		this.sphere = sphere;
		this.innerGroup.add(sphere);

		// Create the physics stuff
		this.body = new RigidBody();
		this.body.evaluationOrder = 1000; // Make sure this body's handlers are called after all the other ones (interiors, shapes, etc)
		let colShape = new BallCollisionShape(0); // We'll update the radius later
		colShape.restitution = this.bounceRestitution;
		this.shape = colShape;
		this.body.addCollisionShape(colShape);

		let largeAuxShape = new BallCollisionShape(0);
		largeAuxShape.collisionDetectionMask = 0b10;
		largeAuxShape.collisionResponseMask = 0;
		this.body.addCollisionShape(largeAuxShape);

		let smallAuxShape = new BallCollisionShape(0);
		smallAuxShape.collisionDetectionMask = 0b100;
		smallAuxShape.collisionResponseMask = 0;
		this.body.addCollisionShape(smallAuxShape);

		colShape.broadphaseShape = largeAuxShape;
		smallAuxShape.broadphaseShape = largeAuxShape;

		this.largeAuxShape = largeAuxShape;
		this.smallAuxShape = smallAuxShape;

		this.body.onBeforeIntegrate = this.onBeforeIntegrate.bind(this);
		this.body.onAfterIntegrate = this.onAfterIntegrate.bind(this);
		this.body.onBeforeCollisionResponse = this.onBeforeCollisionResponse.bind(this);
		this.body.onAfterCollisionResponse = this.onAfterCollisionResponse.bind(this);

		// Set the marble's default orientation to be close to actual MBP
		this.body.orientation.setFromEuler(new Euler(Math.PI/2, Math.PI * 7/6, 0));

		this.forcefield = new Shape();
		this.forcefield.dtsPath = "shapes/images/glow_bounce.dts";
		await this.forcefield.init(this.level);
		this.forcefield.setOpacity(0);
		this.forcefield.showSequences = false; // Hide the weird default animation it does
		this.innerGroup.add(this.forcefield.group);

		this.helicopter = new Shape();
		// Easter egg: Due to an iconic bug where the helicopter would instead look like a glow bounce, this can now happen 0.1% of the time.
		this.helicopter.dtsPath = (Math.random() < 1 / 1000)? "shapes/images/glow_bounce.dts" : "shapes/images/helicopter.dts";
		this.helicopter.castShadows = true;
		await this.helicopter.init(this.level);
		this.helicopter.setOpacity(0);
		this.group.add(this.helicopter.group);

		// Load the necessary rolling sounds
		let toLoad = ["jump.wav", "bouncehard1.wav", "bouncehard2.wav", "bouncehard3.wav", "bouncehard4.wav", "rolling_hard.wav", "sliding.wav"];
		if (this.level.mission.hasBlast) toLoad.push("blast.wav");
		await this.level.audio.loadBuffers(toLoad);

		this.rollingSound = this.level.audio.createAudioSource('rolling_hard.wav');
		this.rollingSound.play();
		this.rollingSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
		this.rollingSound.setLoop(true);

		// Check if we need to prep a Mega Marble sound
		if (this.level.mission.allElements.some(x => x._type === MissionElementType.Item && x.datablock?.toLowerCase() === 'megamarbleitem')) {
			this.rollingMegaMarbleSound = this.level.audio.createAudioSource('mega_roll.wav');
			this.rollingMegaMarbleSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
			this.rollingMegaMarbleSound.setLoop(true);
		}

		this.slidingSound = this.level.audio.createAudioSource('sliding.wav');
		this.slidingSound.play();
		this.slidingSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
		this.slidingSound.setLoop(true);

		await Promise.all([this.rollingSound.promise, this.slidingSound.promise, this.rollingMegaMarbleSound?.promise]);
	}

	/** Returns true iff the marble should use special reflective shaders. */
	isReflective() {
		if (this.level.offlineSettings?.reflectiveMarble !== undefined)
			return this.level.offlineSettings.reflectiveMarble;
		return (StorageManager.data.settings.marbleReflectivity === 2 || (StorageManager.data.settings.marbleReflectivity === 0 && this.level.mission.modification === 'ultra')) && !Util.isIOS();
		// On some iOS devices, the reflective marble is invisible. That implies a shader compilation error but I sadly cannot check the console on there so we're just disabling them for all iOS devices.
	}

	findBestCollision(withRespectTo: (c: Collision) => number) {
		let bestCollision: Collision;
		let bestCollisionValue = -Infinity;
		for (let collision of this.body.collisions) {
			if (collision.s1 !== this.shape) continue; // Could also be an aux collider that caused the collision but we don't wanna count that here

			let value = withRespectTo(collision);

			if (value > bestCollisionValue) {
				bestCollision = collision;
				bestCollisionValue = value;
			}
		}

		if (!bestCollision) return null;

		let contactNormal = bestCollision.normal;
		let contactShape = bestCollision.s2;
		if (bestCollision.s1 !== this.body.shapes[0]) {
			contactNormal.negate();
			contactShape = bestCollision.s2;
		}

		// How much the current surface is pointing up
		let contactNormalUpDot = Math.abs(contactNormal.dot(this.level.currentUp));

		return { collision: bestCollision, contactNormal, contactShape, contactNormalUpDot };
	}

	onBeforeIntegrate(dt: number) {
		let allowUserInput = !state.menu.finishScreen.showing;

		// Construct the raw movement vector from inputs
		let movementVec = new Vector3(0, 0, 0);
		if (isPressed('up')) movementVec.add(new Vector3(1, 0, 0));
		if (isPressed('down')) movementVec.add(new Vector3(-1, 0, 0));
		if (isPressed('left')) movementVec.add(new Vector3(0, 1, 0));
		if (isPressed('right')) movementVec.add(new Vector3(0, -1, 0));

		// Add gamepad input and restrict if necessary
		movementVec.add(new Vector3(-gamepadAxes.marbleY, -gamepadAxes.marbleX));
		if (normalizedJoystickHandlePosition) movementVec.add(new Vector3(
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

		if (!allowUserInput) movementVec.multiplyScalar(0);
		let inputStrength = movementVec.length();

		// Rotate the vector accordingly
		movementVec.multiplyScalar(MARBLE_ROLL_FORCE * 5 * dt);
		movementVec.applyAxisAngle(new Vector3(0, 0, 1), this.level.yaw);

		let quat = this.level.newOrientationQuat;
		movementVec.applyQuaternion(quat);

		this.lastMovementVec.copy(movementVec);

		// The axis of rotation (for angular velocity) is the cross product of the current up vector and the movement vector, since the axis of rotation is perpendicular to both.
		let movementRotationAxis = this.level.currentUp.clone().cross(movementVec);

		let bestCollision = this.findBestCollision(c => c.normal.dot(this.level.currentUp));

		if (bestCollision) {
			let { collision, contactNormal, contactNormalUpDot } = bestCollision;

			// The rotation necessary to get from the up vector to the contact normal.
			let contactNormalRotation = new Quaternion().setFromUnitVectors(this.level.currentUp, contactNormal);
			movementRotationAxis.applyQuaternion(contactNormalRotation);

			// Weaken the marble's angular power based on the friction and steepness of the surface
			let dot = -movementVec.clone().normalize().dot(contactNormal);
			let penalty = Math.max(0, dot - Math.max(0, (collision.s2Friction - 1.0)));
			movementRotationAxis.multiplyScalar(1 - penalty);

			// Apply angular velocity changes
			let angVel = this.body.angularVelocity;

			// Subtract the movement axis so it doesn't get slowed down
			let direction = movementRotationAxis.clone().normalize();
			let dot2 = Math.max(0, angVel.dot(direction));
			angVel.addScaledVector(direction, -dot2);

			// Subtract the "surface rotation axis", this ensures we can roll down hills quickly
			let surfaceRotationAxis = this.level.currentUp.clone().cross(contactNormal);
			let dot3 = Math.max(angVel.dot(surfaceRotationAxis), 0);
			angVel.addScaledVector(surfaceRotationAxis, -dot3);

			angVel.multiplyScalar(0.02 ** (Math.min(1, collision.friction) * dt)); // Handle velocity slowdown

			// Add them back
			angVel.addScaledVector(surfaceRotationAxis, dot3);
			angVel.addScaledVector(direction, dot2);

			if (angVel.length() > 300 * this.speedFac) angVel.multiplyScalar(300 * this.speedFac / angVel.length()); // Absolute max angular speed

			if (dot2 + movementRotationAxis.length() > 12 * Math.PI*2 * inputStrength / contactNormalUpDot * this.speedFac) {
				// Cap the rolling velocity
				let newLength = Math.max(0, 12 * Math.PI*2 * inputStrength / contactNormalUpDot * this.speedFac - dot2);
				movementRotationAxis.normalize().multiplyScalar(newLength);
			}
		} else {
			// Handle airborne movement
			// Angular acceleration isn't quite as speedy
			movementRotationAxis.multiplyScalar(1/2);

			let time = this.level.timeState;

			let airMovementVector = movementVec.clone();
			let airVelocity = (time.currentAttemptTime - this.helicopterEnableTime) < 5000 ? 5 : 3.2; // Change air velocity for the helicopter
			if (this.level.finishTime) airVelocity = 0;
			airMovementVector.multiplyScalar(airVelocity * dt);
			//this.body.addLinearVelocity(airMovementVector);
			this.body.linearVelocity.add(airMovementVector);

			this.slidingSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
			this.rollingSound.gain.gain.linearRampToValueAtTime(0, this.level.audio.currentTime + 0.02);
			this.rollingMegaMarbleSound?.gain.gain.linearRampToValueAtTime(0, this.level.audio.currentTime + 0.02);
		}

		movementRotationAxis.multiplyScalar(this.speedFac);
		// Apply angular acceleration, but make sure the angular velocity doesn't exceed some maximum
		Util.addToVectorCapped(this.body.angularVelocity, movementRotationAxis, 120 * this.speedFac);

		if (this.level.finishTime) this.body.linearVelocity.multiplyScalar(0.9);

		if (allowUserInput && this.level.heldPowerUp && (isPressed('use') || this.level.useQueued) && getPressedFlag('use')) {
			this.level.replay.recordUsePowerUp(this.level.heldPowerUp);
			this.level.heldPowerUp.use(0);
			this.level.useQueued = false;
		}
		if (allowUserInput && (isPressed('blast') || this.level.blastQueued) && getPressedFlag('blast')) {
			this.useBlast();
			this.level.blastQueued = false;
		}

		this.slidingTimeout--;
	}

	onAfterIntegrate() {
		// We'll need these for collision response lata
		this.beforeVel.copy(this.body.linearVelocity);
		this.beforeAngVel.copy(this.body.angularVelocity);

		let time = this.level.timeState;
		let playReplay = this.level.replay.mode === 'playback';

		if (time.currentAttemptTime < GO_TIME && !playReplay) {
			// Lock the marble to the space above the start pad

			let { position: startPosition } = this.level.getStartPositionAndOrientation();
			let position = this.body.position;
			position.x = startPosition.x;
			position.y = startPosition.y;

			let vel = this.body.linearVelocity;
			vel.x = vel.y = 0;

			let angVel = this.body.angularVelocity;
			// Cap the angular velocity so it doesn't go haywire
			if (angVel.length() > 60) angVel.normalize().multiplyScalar(60);

			this.shape.friction = 0;
		} else {
			this.shape.friction = 1;
		}
	}

	onBeforeCollisionResponse() {
		// Nothing.
	}

	onAfterCollisionResponse() {
		let bestCollision = this.findBestCollision(c => c.normal.dot(this.level.currentUp));
		if (!bestCollision) return;

		let { collision, contactNormal, contactShape, contactNormalUpDot } = bestCollision;

		this.lastContactNormal.copy(contactNormal);

		let lastSurfaceRelativeVelocity = this.beforeVel.clone().sub(contactShape.body.linearVelocity);
		let surfaceRelativeVelocity = this.body.linearVelocity.clone().sub(contactShape.body.linearVelocity);
		let maxDotSlide = 0.5; // 30°

		// Implements sliding: If we hit the surface at an angle below 45°, and have movement keys pressed, we don't bounce.
		let dot0 = -contactNormal.dot(lastSurfaceRelativeVelocity.clone().normalize());
		let slidinigEligible = contactNormalUpDot > 0.1; // Kinda arbitrary rn, it's about 84°, definitely makes sure we don't slide on walls
		if (slidinigEligible && this.slidingTimeout <= 0 && dot0 > 0.001 && dot0 <= maxDotSlide && this.lastMovementVec.length() > 0) {
			let dot = contactNormal.dot(surfaceRelativeVelocity);
			let linearVelocity = this.body.linearVelocity;
			let originalLength = linearVelocity.length();
			linearVelocity.addScaledVector(contactNormal, -dot); // Remove all velocity in the direction of the surface normal

			let newLength = linearVelocity.length();
			let diff = originalLength - newLength;
			linearVelocity.normalize().multiplyScalar(newLength + diff * 2); // Give a small speedboost
		}

		// If we're using a shock absorber or we're on a low-restitution surface, give the marble a velocity boost on contact based on its angular velocity.
		outer:
		if (collision.restitution < 0.5) {
			let dot = -this.beforeVel.dot(contactNormal);
			if (dot < 0) break outer;

			let boost = this.beforeAngVel.clone().cross(contactNormal).multiplyScalar(2 * (0.5 - collision.restitution) * dot / 300 / 0.98); // 0.98 fac because shock absorber used to have 0 rest but now 0.01
			this.body.linearVelocity.add(boost);
		}

		// Create a certain velocity boost on collisions with walls based on angular velocity. This assists in making wall-hits feel more natural.
		let angularBoost = this.body.angularVelocity.clone().cross(contactNormal).multiplyScalar((1 - Math.abs(contactNormalUpDot)) * contactNormal.dot(this.body.linearVelocity) / (Math.PI * 2) / 15);
		if (angularBoost.length() >= 0.01) {
			// Remove a bit of the current velocity so that the response isn't too extreme
			let currentVelocity = this.body.linearVelocity;
			let ratio = angularBoost.length() / currentVelocity.length();
			currentVelocity.multiplyScalar(1 / (1 + ratio * 0.5)).add(angularBoost);
		}

		// Handle jumping
		if (contactNormalUpDot > 1e-6 && !state.menu.finishScreen.showing && (isPressed('jump') || this.level.jumpQueued)) {
			this.setLinearVelocityInDirection(contactNormal, this.jumpImpulse + contactShape.body.linearVelocity.dot(contactNormal), true, () => {
				this.playJumpSound();
				if (this.level.replay.canStore) this.level.replay.jumpSoundTimes.push(this.level.replay.currentTickIndex);
			});
			this.level.jumpQueued = false;
		}

		// Create bounce particles
		let mostPowerfulCollision = this.findBestCollision(c => {
			return -c.normal.dot(this.beforeVel.clone().sub(c.s2.body.linearVelocity));
		});
		let impactVelocity = -mostPowerfulCollision.contactNormal.dot(this.beforeVel.clone().sub(contactShape.body.linearVelocity));
		if (impactVelocity > 6) this.showBounceParticles();

		// Handle bounce sound
		let volume = Util.clamp((impactVelocity / 12)**1.5, 0, 1);
		if (impactVelocity > 1) {
			// Play a collision impact sound
			this.playBounceSound(volume);
			if (this.level.replay.canStore) this.level.replay.bounceTimes.push({ tickIndex: this.level.replay.currentTickIndex, volume: volume, showParticles: impactVelocity > 6 });
		}

		// Handle rolling and sliding sounds
		if (contactNormal.dot(surfaceRelativeVelocity) < 0.01) {
			let predictedMovement = this.body.angularVelocity.clone().cross(this.level.currentUp).multiplyScalar(1 / Math.PI / 2);
			// The expected movement based on the current angular velocity. If actual movement differs too much, we consider the marble to be "sliding".

			if (predictedMovement.dot(surfaceRelativeVelocity) < -0.00001 || (predictedMovement.length() > 0.5 && predictedMovement.length() > surfaceRelativeVelocity.length() * 1.5)) {
				this.slidingSound.gain.gain.setValueAtTime(0.6, this.level.audio.currentTime);
				this.rollingSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
				if (this.rollingMegaMarbleSound) this.rollingMegaMarbleSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
			} else {
				this.slidingSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
				let pitch = Util.clamp(surfaceRelativeVelocity.length() / 15, 0, 1) * 0.75 + 0.75;

				this.rollingSound.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), this.level.audio.currentTime + 0.02);
				this.rollingMegaMarbleSound?.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), this.level.audio.currentTime + 0.02);
				this.rollingSound.setPlaybackRate(pitch);
				this.rollingMegaMarbleSound?.setPlaybackRate(pitch);
			}
		} else {
			this.slidingSound.gain.gain.setValueAtTime(0, this.level.audio.currentTime);
			this.rollingSound.gain.gain.linearRampToValueAtTime(0, this.level.audio.currentTime + 0.02);
			this.rollingMegaMarbleSound?.gain.gain.linearRampToValueAtTime(0, this.level.audio.currentTime + 0.02);
		}
	}

	tick(time: TimeState) {
		if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
			// Show the shock absorber (takes precedence over super bounce)
			this.forcefield.setOpacity(1);
			this.shape.restitution = 0.01;  // Yep it's not actually zero

			if (!this.shockAbsorberSound) {
				this.shockAbsorberSound = this.level.audio.createAudioSource('superbounceactive.wav');
				this.shockAbsorberSound.setLoop(true);
				this.shockAbsorberSound.play();
			}
		} else if (time.currentAttemptTime - this.superBounceEnableTime < 5000) {
			// Show the super bounce
			this.forcefield.setOpacity(1);
			this.shape.restitution = 0.9;

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
		} else {
			// Stop both shock absorber and super bounce
			this.forcefield.setOpacity(0);
			this.shape.restitution = this.bounceRestitution;

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
			this.superBounceSound?.stop();
			this.superBounceSound = null;
		}
		if (time.currentAttemptTime - this.superBounceEnableTime < 5000 && !this.superBounceSound) {
			// Play the super bounce sound
			this.superBounceSound = this.level.audio.createAudioSource('forcefield.wav');
			this.superBounceSound.setLoop(true);
			this.superBounceSound.play();
		}

		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) {
			// Show the helicopter
			this.helicopter.setOpacity(1);
			this.helicopter.setTransform(new Vector3(0, 0, this.radius - DEFAULT_RADIUS).applyQuaternion(this.level.newOrientationQuat), this.level.newOrientationQuat, new Vector3(1, 1, 1));
			this.level.setGravityIntensity(this.level.defaultGravity * 0.25);

			if (!this.helicopterSound) {
				this.helicopterSound = this.level.audio.createAudioSource('use_gyrocopter.wav');
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
			this.body.linearVelocity.addScaledVector(this.level.currentUp, 6); // There's a small yeet upwards
			this.rollingSound.stop();
			this.rollingMegaMarbleSound?.play();
		} else if (time.currentAttemptTime - this.megaMarbleEnableTime >= 10000) {
			this.setRadius(this.level.mission.hasUltraMarble? ULTRA_RADIUS : DEFAULT_RADIUS);
			this.rollingSound.play();
			this.rollingMegaMarbleSound?.stop();
		}
	}

	playJumpSound() {
		this.level.audio.play(['jump.wav']);
	}

	playBounceSound(volume: number) {
		let prefix = (this.radius === MEGA_MARBLE_RADIUS)? 'mega_' : '';
		this.level.audio.play(['bouncehard1.wav', 'bouncehard2.wav', 'bouncehard3.wav', 'bouncehard4.wav'].map(x => prefix + x), volume);
	}

	showBounceParticles() {
		this.level.particles.createEmitter(bounceParticleOptions, this.body.position, null,
			new Vector3(1, 1, 1).addScaledVector(Util.absVector(this.level.currentUp.clone()), -0.8));
	}

	/** Sets linear velocity in a specific direction, but capped. Used for things like jumping and bumpers. */
	setLinearVelocityInDirection(direction: Vector3, magnitude: number, onlyIncrease: boolean, onIncrease: () => any = () => {}) {
		let unitVelocity = this.body.linearVelocity.clone().normalize();
		let dot = unitVelocity.dot(direction);
		let directionalSpeed = dot * this.body.linearVelocity.length();

		if (directionalSpeed < magnitude || !onlyIncrease) {
			let velocity = this.body.linearVelocity;
			velocity.addScaledVector(direction, -directionalSpeed);
			velocity.addScaledVector(direction, magnitude);

			if (directionalSpeed < magnitude) onIncrease();
		}
	}

	/** Predicts the position of the marble in the next physics tick to allow for smooth, interpolated rendering. */
	calculatePredictiveTransforms() {
		let pos = this.body.position;
		let orientation = this.body.orientation;
		let linVel = this.body.linearVelocity;
		let angVel = this.body.angularVelocity;

		// Naive: Just assume the marble moves as if nothing was in its way and it continued with its current velocity.
		let predictedPosition = pos.clone().addScaledVector(linVel, 1 / PHYSICS_TICK_RATE).addScaledVector(this.level.world.gravity, 1 / PHYSICS_TICK_RATE**2 / 2);
		let movementDiff = predictedPosition.clone().sub(pos);

		let dRotation = angVel.clone().multiplyScalar(1 / PHYSICS_TICK_RATE);
		let dRotationLength = dRotation.length();
		let dq = new Quaternion().setFromAxisAngle(dRotation.normalize(), dRotationLength);
		let predictedOrientation = dq.multiply(orientation);

		// See if we hit something, do this to prevent clipping through things
		let hits = this.level.world.castShape(this.shape, movementDiff, 1);
		let hit = hits.find(x => !this.body.collisions.some(y => y.s2 === x.shape)); // Filter out hits with shapes we're already touching
		let lambda = hit?.lambda ?? 1;

		this.predictedPosition.lerpVectors(pos, predictedPosition, lambda);
		this.predictedOrientation.copy(orientation).slerp(predictedOrientation, lambda);
	}

	render(time: TimeState) {
		// Position based on current and predicted position and orientation
		this.group.position.copy(this.body.position).lerp(this.predictedPosition, time.physicsTickCompletion);
		this.innerGroup.orientation.copy(this.body.orientation).slerp(this.predictedOrientation, time.physicsTickCompletion);

		this.group.recomputeTransform();
		this.innerGroup.recomputeTransform();

		this.forcefield.render(time);
		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) this.helicopter.render(time);

		// Update the teleporting look:

		let teleportFadeCompletion = 0;

		if (this.teleportEnableTime !== null) teleportFadeCompletion = Util.clamp((time.currentAttemptTime - this.teleportEnableTime) / TELEPORT_FADE_DURATION, 0, 1);
		if (this.teleportDisableTime !== null) teleportFadeCompletion = Util.clamp(1 - (time.currentAttemptTime - this.teleportDisableTime) / TELEPORT_FADE_DURATION, 0, 1);

		if (teleportFadeCompletion > 0) {
			this.sphere.opacity = Util.lerp(1, 0.25, teleportFadeCompletion);
		} else {
			this.sphere.opacity = Number(!this.ballShape);
		}
	}

	renderReflection() {
		if (!this.isReflective()) return;

		this.cubeCamera.position.copy(this.group.position);
		this.cubeMap.render(this.level.scene, this.cubeCamera, 4);
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

		let impulse = this.level.currentUp.clone().multiplyScalar(Math.max(Math.sqrt(this.level.blastAmount), this.level.blastAmount) * 10);
		this.body.linearVelocity.add(impulse);
		this.level.audio.play('blast.wav');
		this.level.particles.createEmitter(
			(this.level.blastAmount > 1)? blastMaxParticleOptions : blastParticleOptions,
			null,
			() => this.body.position.clone().addScaledVector(this.level.currentUp, -this.radius * 0.4),
			new Vector3(1, 1, 1).addScaledVector(Util.absVector(this.level.currentUp.clone()), -0.8)
		);

		this.level.blastAmount = 0;
		this.level.replay.recordUseBlast();
	}

	/** Updates the radius of the marble both visually and physically. */
	setRadius(radius: number) {
		if (this.radius === radius) return;

		this.radius = radius;
		this.sphere.scale.setScalar(radius);
		this.sphere.recomputeTransform();
		this.ballShape?.setTransform(new Vector3(), new Quaternion(), new Vector3().setScalar(radius / DEFAULT_RADIUS));

		this.shape.radius = radius;
		this.shape.updateInertiaTensor();
		this.largeAuxShape.radius = 2 * radius;
		this.smallAuxShape.radius = radius;

		this.body.syncShapes();

		this.forcefield.group.scale.setScalar(this.radius / DEFAULT_RADIUS);
		this.forcefield.group.recomputeTransform();
	}

	reset() {
		this.body.linearVelocity.setScalar(0);
		this.body.angularVelocity.setScalar(0);
		this.superBounceEnableTime = -Infinity;
		this.shockAbsorberEnableTime = -Infinity;
		this.helicopterEnableTime = -Infinity;
		this.teleportEnableTime = null;
		this.teleportDisableTime = null;
		this.megaMarbleEnableTime = -Infinity;
		this.lastContactNormal.set(0, 0, 0);
		this.beforeVel.set(0, 0, 0);
		this.beforeAngVel.set(0, 0, 0);
		this.slidingTimeout = 0;
		this.predictedPosition.copy(this.body.position);
		this.predictedOrientation.copy(this.body.orientation);
		this.setRadius(this.level.mission.hasUltraMarble? ULTRA_RADIUS : DEFAULT_RADIUS);
	}

	dispose() {
		this.cubeMap?.dispose();
	}
}