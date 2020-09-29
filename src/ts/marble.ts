import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { gameButtons } from "./input";
import { state } from "./state";
import { PHYSICS_TICK_RATE, TimeState } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";
import { AudioManager, AudioSource } from "./audio";

const MARBLE_SIZE = 0.2;
export const MARBLE_ROLL_FORCE = 40;
const JUMP_IMPULSE = 7 || 7.5; // For now, seems to fit more.

export class Marble {
	group: THREE.Group;
	sphere: THREE.Mesh;
	body: OIMO.RigidBody;

	shape: OIMO.Shape;
	forcefield: Shape;
	helicopter: Shape;

	superBounceEnableTime = -Infinity;
	shockAbsorberEnableTime = -Infinity;
	helicopterEnableTime = -Infinity;
	lastContactNormal = new OIMO.Vec3(0, 0, 1);
	wallHitBoosterTimeout = 0;
	collisionTimeout = 0;
	lastVel = new OIMO.Vec3();
	rollingSound: AudioSource;
	slidingSound: AudioSource;
	helicopterSound: AudioSource = null;
	shockAbsorberSound: AudioSource = null;
	superBounceSound: AudioSource = null;

	async init() {
		this.group = new THREE.Group();

		let textureMarble = await ResourceManager.getTexture("shapes/balls/base.marble.png");

        let geometry = new THREE.SphereGeometry(MARBLE_SIZE, 32, 32);
		let sphere = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map: textureMarble, color: 0xffffff}));
		sphere.castShadow = true;
		this.sphere = sphere;
		this.group.add(sphere);

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
		await this.forcefield.init();
		this.forcefield.setOpacity(0);
		this.forcefield.showSequences = false;
		this.sphere.add(this.forcefield.group);

		this.helicopter = new Shape();
		this.helicopter.dtsPath = "shapes/images/helicopter.dts";
		await this.helicopter.init();
		this.helicopter.setOpacity(0);
		this.group.add(this.helicopter.group);

		await AudioManager.loadBuffers(["jump.wav", "bouncehard1.wav", "bouncehard2.wav", "bouncehard3.wav", "bouncehard4.wav", "rolling_hard.wav", "sliding.wav"]);

		this.rollingSound = await AudioManager.createAudioSource('rolling_hard.wav');
		this.rollingSound.play();
		this.rollingSound.gain.gain.value = 0;
		this.rollingSound.node.loop = true;

		this.slidingSound = await AudioManager.createAudioSource('sliding.wav');
		this.slidingSound.play();
		this.slidingSound.gain.gain.value = 0;
		this.slidingSound.node.loop = true;
	}

	handleControl(time: TimeState) {
		let movementVec = new THREE.Vector3(0, 0, 0);

		if (gameButtons.up) movementVec.add(new THREE.Vector3(1, 0, 0));
		if (gameButtons.down) movementVec.add(new THREE.Vector3(-1, 0, 0));
		if (gameButtons.left) movementVec.add(new THREE.Vector3(0, 1, 0));
		if (gameButtons.right) movementVec.add(new THREE.Vector3(0, -1, 0));

		let inputStrength = movementVec.length();

		movementVec.multiplyScalar(MARBLE_ROLL_FORCE * 5 / PHYSICS_TICK_RATE);
		movementVec.applyAxisAngle(new THREE.Vector3(0, 0, 1), state.currentLevel.yaw);

		let quat = state.currentLevel.newOrientationQuat;
		movementVec.applyQuaternion(quat);

		let current = this.body.getContactLinkList();
		while (current) {
			let contact = current.getContact();
			if (contact.isTouching()) break;

			current = current.getNext();
		}

		let movementRotationAxis = state.currentLevel.currentUp.cross(Util.vecThreeToOimo(movementVec));

		this.collisionTimeout--;

		if (current) {
			let contact = current.getContact();
			contact._updateManifold();
			contact._postSolve();
			
			let contactNormal = contact.getManifold().getNormal();
			let surfaceShape = contact.getShape2();
			if (surfaceShape === this.shape) {
				contactNormal = contactNormal.scale(-1);
				surfaceShape = contact.getShape1();
			}
			this.lastContactNormal = contactNormal;
			let inverseContactNormal = contactNormal.scale(-1);

			let contactNormalUpDot = Math.abs(contactNormal.dot(state.currentLevel.currentUp));
			let collisionTimeoutNeeded = false;

			let contactNormalRotation = new OIMO.Quat();
			contactNormalRotation.setArc(state.currentLevel.currentUp, contactNormal);
			movementRotationAxis.mulMat3Eq(contactNormalRotation.toMat3());

			let dot0 = contactNormal.dot(this.lastVel.clone().normalize());
			if (dot0 > -0.4 && dot0 < -0.001) {
				dot0 = contactNormal.dot(this.body.getLinearVelocity().clone().normalize());
				let linearVelocity = this.body.getLinearVelocity();
				this.body.addLinearVelocity(contactNormal.scale(-dot0 * linearVelocity.length()));
			}

			outer:
			if (this.collisionTimeout <= 0) {
				let angularBoost = this.body.getAngularVelocity().cross(contactNormal).scale((1 - contactNormal.dot(state.currentLevel.currentUp)) * contactNormal.dot(this.body.getLinearVelocity()) / (Math.PI * 2) / 20);
				if (angularBoost.length() < 0.01) break outer;

				let currentVelocity = this.body.getLinearVelocity();
				let ratio = angularBoost.length() / currentVelocity.length();
				currentVelocity = currentVelocity.scale(1 / (1 + ratio * 0.5)).add(angularBoost);
				this.body.setLinearVelocity(currentVelocity);

				collisionTimeoutNeeded = true;
			}

			let jumpSoundPlayed = false;
			if (this.collisionTimeout <= 0 && gameButtons.jump && contactNormalUpDot > 1e-10) {
				this.setLinearVelocityInDirection(contactNormal, JUMP_IMPULSE + surfaceShape.getRigidBody().getLinearVelocity().dot(contactNormal), true, () => {
					AudioManager.play(['jump.wav']);
					jumpSoundPlayed = true;
					collisionTimeoutNeeded = true;
				});
			}

			if (!jumpSoundPlayed && this.collisionTimeout <= 0) {
				let impactVelocity = -contactNormal.dot(this.lastVel.sub(surfaceShape.getRigidBody().getLinearVelocity()));
				let volume = Util.clamp(impactVelocity / 15, 0, 1);

				if (impactVelocity > 1) {
					AudioManager.play(['bouncehard1.wav', 'bouncehard2.wav', 'bouncehard3.wav', 'bouncehard4.wav'], volume);
					collisionTimeoutNeeded = true;
				}
			}

			let surfaceRelativeVelocity = this.body.getLinearVelocity().sub(surfaceShape.getRigidBody().getLinearVelocity());
			if (contactNormal.dot(surfaceRelativeVelocity) < 0.0001) {
				let predictedMovement = this.body.getAngularVelocity().cross(state.currentLevel.currentUp).scale(1 / Math.PI / 2);

				if (predictedMovement.dot(surfaceRelativeVelocity) < -0.00001 || (predictedMovement.length() > 0.5 && predictedMovement.length() > surfaceRelativeVelocity.length() * 1.5)) {
					this.slidingSound.gain.gain.value = 0.6;
					this.rollingSound.gain.gain.value = 0;
				} else {
					this.slidingSound.gain.gain.value = 0;
					let pitch = Util.clamp(surfaceRelativeVelocity.length() / 15, 0, 1) * 0.75 + 0.75;

					this.rollingSound.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), AudioManager.context.currentTime + 0.02)
					this.rollingSound.node.playbackRate.value = pitch;
				}
			} else {
				this.slidingSound.gain.gain.value = 0;
				this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02)
			}

			let dot = Util.vecThreeToOimo(movementVec).normalize().dot(inverseContactNormal);
			let penalty = Math.max(0, dot - Math.max(0, (surfaceShape.getFriction() - 1.0)));

			movementRotationAxis = movementRotationAxis.scale(1 - penalty);

			let angVel = this.body.getAngularVelocity();
			let direction = movementRotationAxis.clone().normalize();
			let dot2 = Math.max(0, angVel.dot(direction));
			angVel = angVel.sub(direction.scale(dot2));
			angVel = angVel.scale(0.02 ** (1 / PHYSICS_TICK_RATE));
			angVel = angVel.add(direction.scale(dot2));
			this.body.setAngularVelocity(angVel);

			if (dot2 + movementRotationAxis.length() > 12 * Math.PI*2 * inputStrength / contactNormalUpDot) {
				let newLength = Math.max(0, 12 * Math.PI*2 * inputStrength / contactNormalUpDot - dot2);
				movementRotationAxis = movementRotationAxis.normalize().scale(newLength);
			}

			if (collisionTimeoutNeeded) this.collisionTimeout = 2;
		}

		if (!current) {
			movementRotationAxis = movementRotationAxis.scale(1/2);

			let airMovementVector = new OIMO.Vec3(movementVec.x, movementVec.y, movementVec.z);
			let airVelocity = (time.currentAttemptTime - this.helicopterEnableTime) < 5000 ? 5 : 3;
			airMovementVector = airMovementVector.scale(airVelocity / PHYSICS_TICK_RATE);
			this.body.addLinearVelocity(airMovementVector);

			this.slidingSound.gain.gain.value = 0;
			//this.rollingSound.gain.gain.setValueAtTime(this.rollingSound.gain.gain.value, AudioManager.context.currentTime);
			this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
		}

		this.body.setAngularVelocity(Util.addToVectorCapped(this.body.getAngularVelocity(), movementRotationAxis, 100));

		if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0);

			if (!this.shockAbsorberSound) {
				AudioManager.createAudioSource('superbounceactive.wav').then((source) => {
					this.shockAbsorberSound = source;
					this.shockAbsorberSound.node.loop = true;
					this.shockAbsorberSound.play();
				});
			}
		} else if (time.currentAttemptTime - this.superBounceEnableTime < 5000) {
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(1.6); // Found through experimentation

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
		} else {
			this.forcefield.setOpacity(0);
			this.shape.setRestitution(0.5);

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
			this.superBounceSound?.stop();
			this.superBounceSound = null;
		}
		if (time.currentAttemptTime - this.superBounceEnableTime < 5000 && !this.superBounceSound) {
			AudioManager.createAudioSource('forcefield.wav').then((source) => {
				this.superBounceSound = source;
				this.superBounceSound.node.loop = true;
				this.superBounceSound.play();
			});
		}

		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) {
			this.helicopter.setOpacity(1);
			state.currentLevel.setGravityIntensity(5);
			
			if (!this.helicopterSound) {
				AudioManager.createAudioSource('use_gyrocopter.wav').then((source) => {
					this.helicopterSound = source;
					this.helicopterSound.node.loop = true;
					this.helicopterSound.play();
				});
			}
		} else {
			this.helicopter.setOpacity(0);
			state.currentLevel.setGravityIntensity(20);

			this.helicopterSound?.stop();
			this.helicopterSound = null;
		}

		this.lastVel = this.body.getLinearVelocity();
	}

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
		let bodyPosition = this.body.getPosition();
		let bodyOrientation = this.body.getOrientation();
		this.group.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
		this.sphere.quaternion.set(bodyOrientation.x, bodyOrientation.y, bodyOrientation.z, bodyOrientation.w);

		this.forcefield.render(time);
		this.helicopter.tick(time);
		this.helicopter.render(time);
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
		this.superBounceEnableTime = -Infinity;
		this.shockAbsorberEnableTime = -Infinity;
		this.helicopterEnableTime = -Infinity;
		this.lastContactNormal = new OIMO.Vec3(0, 0, 1);
		this.wallHitBoosterTimeout = 0;
		this.lastVel = new OIMO.Vec3();
	}
}