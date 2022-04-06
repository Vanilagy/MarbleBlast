import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { Util } from "../util";
import { Collision } from "./collision";
import { CollisionShape } from "./collision_shape";
import { World } from "./world";

export enum RigidBodyType {
	Dynamic,
	Static // Has infinite mass and doesn't get affected by external forces such as gravity
}

let v1 = new Vector3();
let q1 = new Quaternion();

export class RigidBody {
	world: World = null;
	type: RigidBodyType = RigidBodyType.Dynamic;
	/** Disabled bodies will be skipped in the simulation loop. */
	enabled = true;

	position = new Vector3();
	orientation = new Quaternion();

	linearVelocity = new Vector3();
	angularVelocity = new Vector3();
	gravity = new Vector3();

	prevPosition = new Vector3();
	prevOrientation = new Quaternion();
	prevLinearVelocity = new Vector3();
	prevAngularVelocity = new Vector3();
	/** Indicates whether the previous values are valid, i.e. have been set. */
	prevValid = false;

	/** The shapes that make up this rigid body. */
	shapes: CollisionShape[] = [];
	/** The list of collisions this body was a part of in the last simulation step. */
	collisions: Collision[] = [];
	/** Bodies with lower evaluation order will be evaluated first in the simulation loop. */
	evaluationOrder = 0;
	inContactCcd = new Set<CollisionShape>();
	newInContactCcd = new Set<CollisionShape>();

	userData: any;

	transformPoint(p: Vector3) {
		return p.applyQuaternion(this.orientation).add(this.position);
	}

	transformPointInv(p: Vector3) {
		q1.copy(this.orientation).conjugate();
		return p.sub(this.position).applyQuaternion(q1);
	}

	/** Updates this body's position and orientation based on its linear and angular velocities. */
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

	applyTranslation(translation: Vector3) {
		this.position.add(translation);
	}

	applyRotation(rotation: Vector3) {
		q1.setFromAxisAngle(v1.copy(rotation).normalize(), rotation.length());
		this.orientation.multiplyQuaternions(q1, this.orientation).normalize();
	}

	storePrevious() {
		this.prevPosition.copy(this.position);
		this.prevOrientation.copy(this.orientation);
		this.prevLinearVelocity.copy(this.linearVelocity);
		this.prevAngularVelocity.copy(this.angularVelocity);

		this.prevValid = true;
	}

	/** Reverts this body's state to a linearly interpolated state between the current and last states. */
	revert(t: number) {
		let posEq = this.position.equals(this.prevPosition);
		let oriEq = this.orientation.equals(this.prevOrientation);

		if (!posEq || !oriEq) {
			this.position.lerpVectors(this.prevPosition, this.position, t);
			q1.copy(this.orientation);
			this.orientation.copy(this.prevOrientation).slerp(q1, t);
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

	/** Updates this body's collision shapes' bounding boxes and positions in the octree. */
	syncShapes() {
		for (let i = 0; i < this.shapes.length; i++) {
			let shape = this.shapes[i];
			shape.updateBoundingBox();
		}
	}

	/** Gets the relative motion vector of this body and `b2`. */
	getRelativeMotionVector(dst: Vector3, b2: RigidBody) {
		return dst.copy(this.position).sub(this.prevPosition).sub(b2.position).add(b2.prevPosition);
	}

	updateCollisions(to?: Collision[]) {
		if (!this.enabled) return;
		if (this.type !== RigidBodyType.Dynamic) {
			throw new Error("Can only manually recompute collisions for dynamic rigid bodies.");
		}

		// Remove our collisions for the other bodies and for ourselves
		for (let collision of this.collisions) {
			let otherBody = (collision.s1.body === this)? collision.s2.body : collision.s1.body;
			otherBody.collisions.splice(otherBody.collisions.indexOf(collision), 1);
		}
		this.collisions.length = 0;

		if (to) {
			this.collisions.push(...to);

			for (let collision of this.collisions) {
				let otherBody = (collision.s1.body === this)? collision.s2.body : collision.s1.body;
				otherBody.collisions.push(collision);
			}
		} else {
			this.world.cachedBroadphaseResults.clear();
			this.world.computeCollisions(this.shapes, false);
		}
	}

	/* eslint-disable  @typescript-eslint/no-unused-vars */
	onBeforeIntegrate(dt: number) {}
	onAfterIntegrate(dt: number) {}
	onBeforeCollisionResponse(t: number, dt: number) {}
	onAfterCollisionResponse(t: number, dt: number) {}
}