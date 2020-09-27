import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { gameButtons } from "./input";
import { state } from "./state";
import { PHYSICS_TICK_RATE, TimeState } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";

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
	lastVel = new OIMO.Vec3();

	async init() {
		this.group = new THREE.Group();

		let textureMarble = await ResourceManager.getTexture("shapes/balls/base.marble.png");

        let geometry = new THREE.SphereGeometry(MARBLE_SIZE, 64, 64);
		let sphere = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map: textureMarble, color: 0xffffff}));
		sphere.castShadow = true;
		sphere.receiveShadow = true;
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

		if (current) {
			let contact = current.getContact();
			let contactNormal = contact.getManifold().getNormal();
			let surfaceShape = contact.getShape2();
			if (surfaceShape === this.shape) {
				contactNormal = contactNormal.scale(-1);
				surfaceShape = contact.getShape1();
			}
			this.lastContactNormal = contactNormal;
			let inverseContactNormal = contactNormal.scale(-1);

			let dot0 = contactNormal.dot(this.lastVel.clone().normalize());
			if (dot0 > -0.4 && dot0 < -0.001) {
				dot0 = contactNormal.dot(this.body.getLinearVelocity().clone().normalize());
				let linearVelocity = this.body.getLinearVelocity();
				this.body.addLinearVelocity(contactNormal.scale(-dot0 * linearVelocity.length()));
			}

			outer:
			if (this.wallHitBoosterTimeout-- <= 0) {
				let angularBoost = this.body.getAngularVelocity().cross(contactNormal).scale((1 - contactNormal.dot(state.currentLevel.currentUp)) * contactNormal.dot(this.body.getLinearVelocity()) / (Math.PI * 2) / 20);
				if (angularBoost.length() < 0.01) break outer;

				let currentVelocity = this.body.getLinearVelocity();
				let ratio = angularBoost.length() / currentVelocity.length();
				currentVelocity = currentVelocity.scale(1 / (1 + ratio * 0.5)).add(angularBoost);
				this.body.setLinearVelocity(currentVelocity);

				this.wallHitBoosterTimeout = 1;
			}

			if (gameButtons.jump && Math.abs(contactNormal.dot(state.currentLevel.currentUp)) > 1e-10) {
				this.setLinearVelocityInDirection(contactNormal, JUMP_IMPULSE + surfaceShape.getRigidBody().getLinearVelocity().dot(contactNormal), true);
			}

			let dot = Util.vecThreeToOimo(movementVec).normalize().dot(inverseContactNormal);
			let penalty = Math.max(0, dot - Math.max(0, (surfaceShape.getFriction() - 1.0)));

			movementRotationAxis = movementRotationAxis.scale(1 - penalty);

			let angVel = this.body.getAngularVelocity();
			let direction = movementRotationAxis.clone().normalize();
			let dot2 = Math.max(0, angVel.dot(direction));
			angVel = angVel.sub(direction.scale(dot2));
			angVel = angVel.scale(0.15 ** (1 / PHYSICS_TICK_RATE));
			angVel = angVel.add(direction.scale(dot2));
			this.body.setAngularVelocity(angVel);

			if (dot2 + movementRotationAxis.length() > 12 * Math.PI*2 * inputStrength) {
				let newLength = Math.max(0, 12 * Math.PI*2 * inputStrength - dot2);
				movementRotationAxis = movementRotationAxis.normalize().scale(newLength);
			}
		} else {
			movementRotationAxis = movementRotationAxis.scale(1/2);

			let airMovementVector = new OIMO.Vec3(movementVec.x, movementVec.y, movementVec.z);
			let airVelocity = (time.currentAttemptTime - this.helicopterEnableTime) < 5000 ? 5 : 3;
			airMovementVector = airMovementVector.scale(airVelocity / PHYSICS_TICK_RATE);
			this.body.addLinearVelocity(airMovementVector);
		}

		this.body.setAngularVelocity(Util.addToVectorCapped(this.body.getAngularVelocity(), movementRotationAxis, 100));

		if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0);
		} else if (time.currentAttemptTime - this.superBounceEnableTime < 5000) {
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(1.6); // Found through experimentation
		} else {
			this.forcefield.setOpacity(0);
			this.shape.setRestitution(0.5);
		}

		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) {
			this.helicopter.setOpacity(1);
			state.currentLevel.setGravityIntensity(5);
		} else {
			this.helicopter.setOpacity(0);
			state.currentLevel.setGravityIntensity(20);
		}

		this.lastVel = this.body.getLinearVelocity();
	}

	setLinearVelocityInDirection(direction: OIMO.Vec3, magnitude: number, onlyIncrease: boolean) {
		let unitVelocity = this.body.getLinearVelocity().clone().normalize();
		let dot = unitVelocity.dot(direction);
		let directionalSpeed = dot * this.body.getLinearVelocity().length();

		if ((directionalSpeed < magnitude || !onlyIncrease)) {
			let velocity = this.body.getLinearVelocity();
			velocity = velocity.sub(direction.scale(directionalSpeed));
			velocity = velocity.add(direction.scale(magnitude));

			this.body.setLinearVelocity(velocity);
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