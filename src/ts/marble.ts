import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { gameButtons } from "./input";
import { PHYSICS_TICK_RATE, TimeState, Level, GO_TIME } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";
import { AudioManager, AudioSource } from "./audio";

const MARBLE_SIZE = 0.2;
export const MARBLE_ROLL_FORCE = 40 || 40;
const JUMP_IMPULSE = 7.3 || 7.5; // For now, seems to fit more.

const bounceParticleOptions = {
	ejectionPeriod: 1,
	ambientVelocity: new THREE.Vector3(0, 0, 0.0),
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

/** Controls marble behavior and responds to player input. */
export class Marble {
	level: Level;
	group: THREE.Group;
	sphere: THREE.Mesh;
	shape: OIMO.Shape;
	body: OIMO.RigidBody;
	/** The predicted position of the marble in the next tick. */
	preemptivePosition: OIMO.Vec3;
	/** The predicted orientation of the marble in the next tick. */
	preemptiveOrientation: OIMO.Quat;

	/** Forcefield around the player shown during super bounce and shock absorber usage. */
	forcefield: Shape;
	/** Helicopter shown above the marble shown during gyrocopter usage. */
	helicopter: Shape;
	superBounceEnableTime = -Infinity;
	shockAbsorberEnableTime = -Infinity;
	helicopterEnableTime = -Infinity;
	helicopterSound: AudioSource = null;
	shockAbsorberSound: AudioSource = null;
	superBounceSound: AudioSource = null;

	lastPos = new OIMO.Vec3();
	lastVel = new OIMO.Vec3();
	lastAngVel = new OIMO.Vec3();
	/** Necessary for super speed. */
	lastContactNormal = new OIMO.Vec3(0, 0, 1);
	/** Keep track of when the last collision happened to avoid handling collision with the same object twice in a row. */
	collisionTimeout = 0;
	
	rollingSound: AudioSource;
	slidingSound: AudioSource;

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		this.group = new THREE.Group();

		// Create the 3D object
		let marbleTexture = await ResourceManager.getTexture("shapes/balls/base.marble.png");
        let geometry = new THREE.SphereBufferGeometry(MARBLE_SIZE, 32, 32);
		let sphere = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map: marbleTexture, color: 0xffffff}));
		sphere.castShadow = true;
		this.sphere = sphere;
		this.group.add(sphere);

		// Create the collision geometry
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = new OIMO.SphereGeometry(MARBLE_SIZE);
		shapeConfig.friction = 1;
		shapeConfig.restitution = 0.5;
		let shape = new OIMO.Shape(shapeConfig);

		let config = new OIMO.RigidBodyConfig();
		let body = new OIMO.RigidBody(config);
		body.addShape(shape);
		body.setAutoSleep(false);

		this.body = body;
		this.shape = shape;

		this.forcefield = new Shape();
		this.forcefield.dtsPath = "shapes/images/glow_bounce.dts";
		await this.forcefield.init(this.level);
		this.forcefield.setOpacity(0);
		this.forcefield.showSequences = false; // Hide the weird default animation it does
		this.sphere.add(this.forcefield.group);

		this.helicopter = new Shape();
		this.helicopter.dtsPath = "shapes/images/helicopter.dts";
		this.helicopter.castShadow = true;
		await this.helicopter.init(this.level);
		this.helicopter.setOpacity(0);
		this.group.add(this.helicopter.group);

		// Load the necessary rolling sounds
		await AudioManager.loadBuffers(["jump.wav", "bouncehard1.wav", "bouncehard2.wav", "bouncehard3.wav", "bouncehard4.wav", "rolling_hard.wav", "sliding.wav"]);

		this.rollingSound = AudioManager.createAudioSource('rolling_hard.wav');
		this.rollingSound.play();
		this.rollingSound.gain.gain.value = 0;
		this.rollingSound.node.loop = true;

		this.slidingSound = AudioManager.createAudioSource('sliding.wav');
		this.slidingSound.play();
		this.slidingSound.gain.gain.value = 0;
		this.slidingSound.node.loop = true;

		await Promise.all([this.rollingSound.promise, this.slidingSound.promise]);
	}

	tick(time: TimeState) {
		// Construct the raw movement vector from inputs
		let movementVec = new THREE.Vector3(0, 0, 0);
		if (gameButtons.up) movementVec.add(new THREE.Vector3(1, 0, 0));
		if (gameButtons.down) movementVec.add(new THREE.Vector3(-1, 0, 0));
		if (gameButtons.left) movementVec.add(new THREE.Vector3(0, 1, 0));
		if (gameButtons.right) movementVec.add(new THREE.Vector3(0, -1, 0));

		let inputStrength = movementVec.length();

		// Rotate the vector accordingly
		movementVec.multiplyScalar(MARBLE_ROLL_FORCE * 5 / PHYSICS_TICK_RATE);
		movementVec.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.level.yaw);

		let quat = this.level.newOrientationQuat;
		movementVec.applyQuaternion(quat);

		// Try to find a touching contact
		let current = this.body.getContactLinkList();
		let touching: OIMO.ContactLink;
		while (current) {
			let contact = current.getContact();
			if (contact.isTouching()) touching = current;

			current = current.getNext();
		}
		current = touching; // Take the last touching contact

		// The axis of rotation (for angular velocity) is the cross product of the current up vector and the movement vector, since the axis of rotation is perpendicular to both.
		let movementRotationAxis = this.level.currentUp.cross(Util.vecThreeToOimo(movementVec));

		this.collisionTimeout--;

		if (current) {
			// Update the contact to fix artifacts
			let contact = current.getContact();
			contact._updateManifold();
			contact._postSolve();

			let contactNormal = contact.getManifold().getNormal();
			let surfaceShape = contact.getShape2();
			if (surfaceShape === this.shape) {
				// Invert the normal based on shape order
				contactNormal = contactNormal.scale(-1);
				surfaceShape = contact.getShape1();
			}
			this.lastContactNormal = contactNormal;
			let inverseContactNormal = contactNormal.scale(-1);

			// How much the current surface is pointing up
			let contactNormalUpDot = Math.abs(contactNormal.dot(this.level.currentUp));
			let collisionTimeoutNeeded = false;

			// The rotation necessary to get from the up vector to the contact normal.
			let contactNormalRotation = new OIMO.Quat();
			contactNormalRotation.setArc(this.level.currentUp, contactNormal);
			movementRotationAxis.mulMat3Eq(contactNormalRotation.toMat3());

			// Implements sliding: If we hit the surface at an angle below 45°, and move in that approximate direction, we don't bounce.
			let dot0 = -contactNormal.dot(this.lastVel.clone().normalize());
			if (dot0 > 0.001 && Math.asin(dot0) <= Math.PI/4 && movementVec.length() > 0 && movementVec.dot(Util.vecOimoToThree(this.lastVel)) > 0) {
				dot0 = contactNormal.dot(this.body.getLinearVelocity().clone().normalize());
				let linearVelocity = this.body.getLinearVelocity();
				this.body.addLinearVelocity(contactNormal.scale(-dot0 * linearVelocity.length()));

				let newLength = this.body.getLinearVelocity().length();
				let diff = linearVelocity.length() - newLength;
				linearVelocity = this.body.getLinearVelocity();
				linearVelocity.normalize().scaleEq(newLength + diff * 2); // Give a small speedboost

				this.body.setLinearVelocity(linearVelocity);
			}

			// If we're using a shock absorber, give the marble a velocity boost on contact based on its angular velocity.
			outer:
			if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
				let dot = -this.lastVel.dot(contactNormal);
				if (dot < 0) break outer;

				let boost = this.lastAngVel.cross(contactNormal).scale(dot / 300);
				this.body.addLinearVelocity(boost);
			}

			// Create a certain velocity boost on collisions with walls based on angular velocity. This assists in making wall-hits feel more natural.
			outer:
			if (this.collisionTimeout <= 0) {
				let angularBoost = this.body.getAngularVelocity().cross(contactNormal).scale((1 - contactNormal.dot(this.level.currentUp)) * contactNormal.dot(this.body.getLinearVelocity()) / (Math.PI * 2) / 20);
				if (angularBoost.length() < 0.01) break outer;

				// Remove a bit of the current velocity so that the response isn't too extreme
				let currentVelocity = this.body.getLinearVelocity();
				let ratio = angularBoost.length() / currentVelocity.length();
				currentVelocity = currentVelocity.scale(1 / (1 + ratio * 0.5)).add(angularBoost);
				this.body.setLinearVelocity(currentVelocity);

				collisionTimeoutNeeded = true;
			}

			if (this.collisionTimeout <= 0 && (gameButtons.jump || this.level.jumpQueued) && contactNormalUpDot > 1e-10) {
				// Handle jumping
				this.setLinearVelocityInDirection(contactNormal, JUMP_IMPULSE + surfaceShape.getRigidBody().getLinearVelocity().dot(contactNormal), true, () => {
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
			let surfaceRelativeVelocity = this.body.getLinearVelocity().sub(surfaceShape.getRigidBody().getLinearVelocity());
			if (contactNormal.dot(surfaceRelativeVelocity) < 0.01) {
				let predictedMovement = this.body.getAngularVelocity().cross(this.level.currentUp).scale(1 / Math.PI / 2);
				// The expected movement based on the current angular velocity. If actual movement differs too much, we consider the marble to be "sliding".

				if (predictedMovement.dot(surfaceRelativeVelocity) < -0.00001 || (predictedMovement.length() > 0.5 && predictedMovement.length() > surfaceRelativeVelocity.length() * 1.5)) {
					this.slidingSound.gain.gain.value = 0.6;
					this.rollingSound.gain.gain.value = 0;
				} else {
					this.slidingSound.gain.gain.value = 0;
					let pitch = Util.clamp(surfaceRelativeVelocity.length() / 15, 0, 1) * 0.75 + 0.75;

					this.rollingSound.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), AudioManager.context.currentTime + 0.02);
					this.rollingSound.node.playbackRate.value = pitch;
				}
			} else {
				this.slidingSound.gain.gain.value = 0;
				this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
			}

			// Weaken the marble's angular power based on the friction and steepness of the surface
			let dot = Util.vecThreeToOimo(movementVec).normalize().dot(inverseContactNormal);
			let penalty = Math.max(0, dot - Math.max(0, (surfaceShape.getFriction() - 1.0)));
			movementRotationAxis = movementRotationAxis.scale(1 - penalty);

			// Handle velocity slowdown
			let angVel = this.body.getAngularVelocity();
			let direction = movementRotationAxis.clone().normalize();
			let dot2 = Math.max(0, angVel.dot(direction));
			angVel = angVel.sub(direction.scale(dot2));
			angVel = angVel.scale(0.02 ** (1 / PHYSICS_TICK_RATE));
			angVel = angVel.add(direction.scale(dot2));
		 	if (time.currentAttemptTime >= GO_TIME)	this.body.setAngularVelocity(angVel);

			if (dot2 + movementRotationAxis.length() > 12 * Math.PI*2 * inputStrength / contactNormalUpDot) {
				// Cap the rolling velocity
				let newLength = Math.max(0, 12 * Math.PI*2 * inputStrength / contactNormalUpDot - dot2);
				movementRotationAxis = movementRotationAxis.normalize().scale(newLength);
			}

			if (collisionTimeoutNeeded) this.collisionTimeout = 2;
		}

		// Handle airborne movement
		if (!current) {
			// Angular acceleration isn't quite as speedy
			movementRotationAxis = movementRotationAxis.scale(1/2);

			let airMovementVector = new OIMO.Vec3(movementVec.x, movementVec.y, movementVec.z);
			let airVelocity = (time.currentAttemptTime - this.helicopterEnableTime) < 5000 ? 5 : 3.2; // Change air velocity for the helicopter
			if (this.level.finishTime) airVelocity = 0;
			airMovementVector = airMovementVector.scale(airVelocity / PHYSICS_TICK_RATE);
			this.body.addLinearVelocity(airMovementVector);

			this.slidingSound.gain.gain.value = 0;
			this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
		}

		// Apply angular acceleration, but make sure the angular velocity doesn't exceed some maximum
		this.body.setAngularVelocity(Util.addToVectorCapped(this.body.getAngularVelocity(), movementRotationAxis, 120));

		this.lastPos = this.body.getPosition();
		this.lastVel = this.body.getLinearVelocity();
		this.lastAngVel = this.body.getAngularVelocity();

		// Store sound state in the replay
		let r = this.level.replay;
		if (r.canStore) {
			r.rollingSoundGain.push(this.rollingSound.gain.gain.value);
			r.rollingSoundPlaybackRate.push(this.rollingSound.node.playbackRate.value);
			r.slidingSoundGain.push(this.slidingSound.gain.gain.value);
		}	
	}

	updatePowerUpStates(time: TimeState) {
		if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
			// Show the shock absorber (takes precedence over super bounce)
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0);

			if (!this.shockAbsorberSound) {
				this.shockAbsorberSound = AudioManager.createAudioSource('superbounceactive.wav');
				this.shockAbsorberSound.node.loop = true;
				this.shockAbsorberSound.play();
			}
		} else if (time.currentAttemptTime - this.superBounceEnableTime < 5000) {
			// Show the super bounce
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(1.6); // Found through experimentation

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
		} else {
			// Stop both shock absorber and super bounce
			this.forcefield.setOpacity(0);
			this.shape.setRestitution(0.5);

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
			this.superBounceSound?.stop();
			this.superBounceSound = null;
		}
		if (time.currentAttemptTime - this.superBounceEnableTime < 5000 && !this.superBounceSound) {
			// Play the super bounce sound
			this.superBounceSound = AudioManager.createAudioSource('forcefield.wav');
			this.superBounceSound.node.loop = true;
			this.superBounceSound.play();
		}

		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) {
			// Show the helicopter
			this.helicopter.setOpacity(1);
			this.helicopter.setTransform(new THREE.Vector3(), this.level.newOrientationQuat, new THREE.Vector3(1, 1, 1));
			this.level.setGravityIntensity(5);
			
			if (!this.helicopterSound) {
				this.helicopterSound = AudioManager.createAudioSource('use_gyrocopter.wav');
				this.helicopterSound.node.loop = true;
				this.helicopterSound.play();
			}
		} else {
			// Stop the helicopter
			this.helicopter.setOpacity(0);
			this.level.setGravityIntensity(20);

			this.helicopterSound?.stop();
			this.helicopterSound = null;
		}
	}

	playJumpSound() {
		AudioManager.play(['jump.wav']);
	}

	playBounceSound(volume: number) {
		AudioManager.play(['bouncehard1.wav', 'bouncehard2.wav', 'bouncehard3.wav', 'bouncehard4.wav'], volume);
	}

	showBounceParticles() {
		this.level.particles.createEmitter(bounceParticleOptions, Util.vecOimoToThree(this.body.getPosition()));
	}

	/** Sets linear velocity in a specific direction, but capped. Used for things like jumping and bumpers. */
	setLinearVelocityInDirection(direction: OIMO.Vec3, magnitude: number, onlyIncrease: boolean, onIncrease: () => any = () => {}) {
		let unitVelocity = this.body.getLinearVelocity().clone().normalize();
		let dot = unitVelocity.dot(direction);
		let directionalSpeed = dot * this.body.getLinearVelocity().length();

		if ((directionalSpeed < magnitude || !onlyIncrease)) {
			let velocity = this.body.getLinearVelocity();
			velocity = velocity.sub(direction.scale(directionalSpeed));
			velocity = velocity.add(direction.scale(magnitude));

			this.body.setLinearVelocity(velocity);
			onIncrease();
		}
	}

	render(time: TimeState) {
		// Position based on current and predicted position and orientation
		let bodyPosition = Util.lerpOimoVectors(this.body.getPosition(), this.preemptivePosition, time.physicsTickCompletion);
		let bodyOrientation = this.body.getOrientation().slerp(this.preemptiveOrientation, time.physicsTickCompletion);
		this.group.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
		this.sphere.quaternion.set(bodyOrientation.x, bodyOrientation.y, bodyOrientation.z, bodyOrientation.w);

		this.forcefield.render(time);
		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) this.helicopter.render(time);
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

	reset() {
		this.body.setLinearVelocity(new OIMO.Vec3());
		this.body.setAngularVelocity(new OIMO.Vec3());
		this.superBounceEnableTime = -Infinity;
		this.shockAbsorberEnableTime = -Infinity;
		this.helicopterEnableTime = -Infinity;
		this.lastContactNormal = new OIMO.Vec3(0, 0, 1);
		this.lastVel = new OIMO.Vec3();
	}
}