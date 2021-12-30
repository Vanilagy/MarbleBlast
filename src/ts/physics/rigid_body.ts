import THREE from "three";
import { Util } from "../util";
import { Collision } from "./collision";
import { CollisionShape } from "./collision_shape";
import { World } from "./world";

export enum RigidBodyType {
	Dynamic,
	Static
}

let dq = new THREE.Quaternion();
let t1 = new THREE.Vector3();
let q1 = new THREE.Quaternion();

export class RigidBody {
	world: World = null;
	type: RigidBodyType = RigidBodyType.Dynamic;
	enabled = true;

	position = new THREE.Vector3();
	orientation = new THREE.Quaternion();

	linearVelocity = new THREE.Vector3();
	angularVelocity = new THREE.Vector3();
	
	prevPosition = new THREE.Vector3();
	prevOrientation = new THREE.Quaternion();
	prevLinearVelocity = new THREE.Vector3();
	prevAngularVelocity = new THREE.Vector3();
	prevValid = false;

	shapes: CollisionShape[] = [];
	collisions: Collision[] = [];

	transformPoint(p: THREE.Vector3) {
		return p.applyQuaternion(this.orientation).add(this.position);
	}

	transformPointInv(p: THREE.Vector3) {
		q1.copy(this.orientation).conjugate();
		return p.sub(this.position).applyQuaternion(q1);
	}

	integrate(dt: number) {
		if (this.type !== RigidBodyType.Dynamic) return;

		let translation = this.linearVelocity.clone().multiplyScalar(dt);
		let rotation = this.angularVelocity.clone().multiplyScalar(dt);

		if (translation.lengthSq() === 0 && rotation.lengthSq() === 0) {
			return; // No need to integrate
		}

		this.applyTranslation(translation);
		this.applyRotation(rotation);

		this.syncShapes();
	}

	applyTranslation(translation: THREE.Vector3) {
		this.position.add(translation);
	}

	applyRotation(rotation: THREE.Vector3) {
		dq.setFromAxisAngle(t1.copy(rotation).normalize(), rotation.length());
		this.orientation.multiplyQuaternions(dq, this.orientation).normalize();
	}

	storePrevious() {
		this.prevPosition.copy(this.position);
		this.prevOrientation.copy(this.orientation);
		this.prevLinearVelocity.copy(this.linearVelocity);
		this.prevAngularVelocity.copy(this.angularVelocity);

		this.prevValid = true;
	}

	revert(t: number) {
		let posEq = this.position.equals(this.prevPosition);
		let oriEq = this.orientation.equals(this.prevOrientation);

		if (!posEq || !oriEq) {
			this.position.lerpVectors(this.prevPosition, this.position, t);
			q1.copy(this.orientation);
			this.orientation.copy(this.prevOrientation).slerp(q1, t);

			this.syncShapes();
		}

		this.linearVelocity.lerpVectors(this.prevLinearVelocity, this.linearVelocity, t);
		this.angularVelocity.lerpVectors(this.prevAngularVelocity, this.angularVelocity, t);
	}

	addCollisionShape(shape: CollisionShape) {
		if (shape.body) {
			throw new Error("Shape has already been added to a RigidBody.");
		}

		this.shapes.push(shape);
		shape.body = this;
		shape.updateBoundingBox();

		if (this.type === RigidBodyType.Static) {
			shape.mass = Infinity;
			shape.invInertia.multiplyScalar(0);
		}
	}

	removeCollisionShape(shape: CollisionShape) {
		if (!this.shapes.includes(shape)) return;

		Util.removeFromArray(this.shapes, shape);
		shape.body = null;
	}
	
	syncShapes() {
		for (let i = 0; i < this.shapes.length; i++) {
			let shape = this.shapes[i];
			shape.updateBoundingBox();
		}
	}

	getRelativeMotionVector(dst: THREE.Vector3, b2: RigidBody) {
		return dst.copy(this.position).sub(this.prevPosition).sub(b2.position).add(b2.prevPosition);
	}

	/* eslint-disable  @typescript-eslint/no-unused-vars */
	onBeforeIntegrate(dt: number) {}
	onBeforeCollisionResponse(t: number, dt: number) {}
	onAfterCollisionResponse(t: number, dt: number) {}
}