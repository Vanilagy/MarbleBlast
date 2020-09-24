import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { gameButtons } from "./input";
import { state } from "./state";
import { PHYSICS_TICK_RATE } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";

const MARBLE_SIZE = 0.2;
export const MARBLE_ROLL_FORCE = 60;
const JUMP_IMPULSE = 7.5;

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

	constructor() {
		this.group = new THREE.Group();

		let textureMarble = ResourceManager.getTexture("shapes/balls/base.marble.png");

        let geometry = new THREE.SphereGeometry(MARBLE_SIZE, 64, 64);
		let sphere = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map: textureMarble, color: 0xffffff}));
		sphere.castShadow = true;
		sphere.receiveShadow = true;
		this.sphere = sphere;
		this.group.add(sphere);

		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = new OIMO.SphereGeometry(MARBLE_SIZE);
		shapeConfig.friction = 10;
		shapeConfig.restitution = 0.5;
		let shape = new OIMO.Shape(shapeConfig);

		let config = new OIMO.RigidBodyConfig();
		config.angularDamping = 3;
		let body = new OIMO.RigidBody(config);
		body.addShape(shape);
		body.setAutoSleep(false);

		this.body = body;
		this.shape = shape;
	}

	async init() {
		this.forcefield = new Shape();
		this.forcefield.dtsPath = "shapes/images/glow_bounce.dts";
		await this.forcefield.init();
		this.forcefield.setOpacity(0);
		this.group.add(this.forcefield.group);

		this.helicopter = new Shape();
		this.helicopter.dtsPath = "shapes/images/helicopter.dts";
		await this.helicopter.init();
		this.helicopter.setOpacity(0);
		this.group.add(this.helicopter.group);
	}

	handleControl(time: number) {
		let movementVec = new THREE.Vector3(0, 0, 0);

		if (gameButtons.up) movementVec.add(new THREE.Vector3(1, 0, 0));
		if (gameButtons.down) movementVec.add(new THREE.Vector3(-1, 0, 0));
		if (gameButtons.left) movementVec.add(new THREE.Vector3(0, 1, 0));
		if (gameButtons.right) movementVec.add(new THREE.Vector3(0, -1, 0));
		movementVec.multiplyScalar(MARBLE_ROLL_FORCE * 5 / PHYSICS_TICK_RATE);
		movementVec.applyAxisAngle(new THREE.Vector3(0, 0, 1), state.currentLevel.yaw);

		let quat = state.currentLevel.newOrientationQuat;
		movementVec.applyQuaternion(quat);

		let ohShit = Util.vecOimoToThree(state.currentLevel.currentUp).cross(movementVec);

		this.body.addAngularVelocity(new OIMO.Vec3(ohShit.x, ohShit.y, ohShit.z));

		let current = this.body.getContactLinkList();
		while (current) {
			let contact = current.getContact();
			if (contact.isTouching()) break;

			current = current.getNext();
		}

		if (current && gameButtons.jump) {
			let contact = current.getContact();
			let contactNormal = contact.getManifold().getNormal();

			if (contact.getShape2() === this.shape) contactNormal = contactNormal.scale(-1);
			this.setLinearVelocityInDirection(contactNormal, JUMP_IMPULSE, true);
		}

		if (!current) {
			let airVelocity = new OIMO.Vec3(movementVec.x, movementVec.y, movementVec.z);
			airVelocity = airVelocity.scale(2 / PHYSICS_TICK_RATE);
			this.body.addLinearVelocity(airVelocity);
		}

		if (time - this.shockAbsorberEnableTime < 5000) {
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0);
		} else if (time - this.superBounceEnableTime < 5000) {
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(2);
		} else {
			this.forcefield.setOpacity(0);
			this.shape.setRestitution(0.5);
		}

		if (time - this.helicopterEnableTime < 5000) {
			this.helicopter.setOpacity(1);
			state.currentLevel.setGravityIntensity(5);
		} else {
			this.helicopter.setOpacity(0);
			state.currentLevel.setGravityIntensity(20);
		}
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

	update() {
		let bodyPosition = this.body.getPosition();
		let bodyOrientation = this.body.getOrientation();
		this.group.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
		this.sphere.quaternion.set(bodyOrientation.x, bodyOrientation.y, bodyOrientation.z, bodyOrientation.w);
	}

	render(time: number) {
		this.forcefield.render(time);
		this.helicopter.render(time);
	}

	enableSuperBounce(time: number) {
		this.superBounceEnableTime = time;
	}

	enableShockAbsorber(time: number) {
		this.shockAbsorberEnableTime = time;
	}

	enableHelicopter(time: number) {
		this.helicopterEnableTime = time;
	}
}