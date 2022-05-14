import { Box3 } from "../math/box3";
import { Matrix3 } from "../math/matrix3";
import { Matrix4 } from "../math/matrix4";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { OctreeObject } from "./octree";
import { RigidBody } from "./rigid_body";

let v1 = new Vector3();
let v2 = new Vector3();
let v3 = new Vector3();
let v4 = new Vector3();
let v5 = new Vector3();
let m1 = new Matrix4();
let q1 = new Quaternion();

/** Represents a convex collision shape. */
export abstract class CollisionShape implements OctreeObject {
	/** The body this shape belongs to. */
	body: RigidBody = null;
	boundingBox = new Box3();
	/** The collision margin of this shape, can be used to make the shape thiccer in all directions. */
	margin = 0;
	/** If set, this shape will be used instead for broadphase collision detection (allows for better caching). */
	broadphaseShape: CollisionShape = null;
	collisionDetectionMask = 0b1;
	collisionResponseMask = 0b1;

	friction = 1;
	restitution = 1;
	mass = 1;
	inertia = new Matrix3();
	invInertia = new Matrix3();

	/** Material overrides allow a single collision shape to have more than one material (i.e. friction and restitution). These properties are described by a direction vector (intended to be the normal vector of the face the material applies) to, and the material with the highest dot product with the collision normal is chosen. */
	materialOverrides = new Map<Vector3, { friction: number, restitution: number }>();

	userData: any;

	abstract updateInertiaTensor(): void;
	abstract support(dst: Vector3, direction: Vector3): Vector3;
	abstract getCenter(dst: Vector3): Vector3;

	updateBoundingBox() {
		m1.compose(this.body.position, this.body.orientation, v1.setScalar(1));
		this.boundingBox.applyMatrix4(m1); // Puts a bounding box around the translated bounding box

		this.boundingBox.min.subScalar(this.margin);
		this.boundingBox.max.addScalar(this.margin);

		if (this.body.prevValid) {
			// Extend the bounding box towards the previous position for CCD purposes
			let translation = v1.copy(this.body.position).sub(this.body.prevPosition);
			v2.copy(this.boundingBox.min).sub(translation); // Go backwards
			v3.copy(this.boundingBox.max).sub(translation);
			this.boundingBox.expandByPoint(v2).expandByPoint(v3);
		}

		// Update the octree
		this.body?.world?.octree.update(this);
	}
}

/** Represents a ball with a given radius. */
export class BallCollisionShape extends CollisionShape {
	radius: number;

	constructor(radius: number) {
		super();

		this.radius = radius;
		this.updateInertiaTensor();
	}

	updateInertiaTensor() {
		let scalar = 2/5 * this.mass * this.radius**2;
		this.inertia.identity().multiplyScalar(scalar);
		this.invInertia.copy(this.inertia).invert();
	}

	support(dst: Vector3, direction: Vector3) {
		dst.copy(direction).setLength(this.radius).add(this.body.position);
		if (this.margin > 0) dst.add(v1.copy(direction).setLength(this.margin));

		return dst;
	}

	getCenter(dst: Vector3) {
		return dst.copy(this.body.position);
	}

	updateBoundingBox() {
		this.boundingBox.min.setScalar(-this.radius);
		this.boundingBox.max.setScalar(this.radius);

		super.updateBoundingBox();
	}
}

/** Represents the convex hull of a set of points. */
export class ConvexHullCollisionShape extends CollisionShape {
	points: Vector3[];
	localCenter = new Vector3();
	localAabb = new Box3();

	constructor(points: Vector3[]) {
		super();

		this.points = points;

		this.computeLocalBoundingBox();
		this.updateInertiaTensor();
	}

	computeLocalBoundingBox() {
		// Precompute some stuff so it's faster later

		this.localCenter.setScalar(0);
		for (let point of this.points) this.localCenter.addScaledVector(point, 1 / this.points.length);

		this.localAabb.setFromPoints(this.points);
	}

	updateInertiaTensor() {
		// Do nothing for now, we likely won't need it because there is no dynamic convex hull object
	}

	support(dst: Vector3, direction: Vector3) {
		q1.copy(this.body.orientation).conjugate();
		let localDirection = v1.copy(direction).applyQuaternion(q1); // Transform it to local space

		let maxDot = -Infinity;

		// Naive O(n) support function, loop over all points and find the one with the biggest dot
		for (let i = 0; i < this.points.length; i++) {
			let point = this.points[i];
			let dot = point.dot(localDirection);

			if (dot > maxDot) {
				maxDot = dot;
				dst.copy(point);
			}
		}

		this.body.transformPoint(dst); // Transform it from local into world space
		if (this.margin > 0) dst.add(v1.copy(direction).setLength(this.margin));

		return dst;
	}

	getCenter(dst: Vector3) {
		return this.body.transformPoint(dst.copy(this.localCenter));
	}

	updateBoundingBox(): void {
		this.boundingBox.copy(this.localAabb);

		super.updateBoundingBox();
	}
}

/** Represents the convex hull of two other collision shapes. */
export class CombinedCollisionShape extends CollisionShape {
	s1: CollisionShape;
	s2: CollisionShape;

	constructor(s1: CollisionShape, s2: CollisionShape) {
		super();

		this.s1 = s1;
		this.s2 = s2;
	}

	updateInertiaTensor() {}

	support(dst: Vector3, direction: Vector3) {
		// Simply return the max of the two support functions

		let supp1 = this.s1.support(v4, direction);
		let supp2 = this.s2.support(v5, direction);

		if (supp1.dot(direction) > supp2.dot(direction)) dst.copy(supp1);
		else dst.copy(supp2);

		return dst;
	}

	getCenter(dst: Vector3) {
		// Return the average, this is probably not correct
		return this.s1.getCenter(dst).add(this.s2.getCenter(v4)).multiplyScalar(0.5);
	}
}

/** Represents the shape that's just a single dot at the origin, so C = { (0, 0, 0)^T } */
export class SingletonCollisionShape extends CollisionShape {
	updateInertiaTensor() {}

	support(dst: Vector3) {
		return dst.copy(this.body.position);
	}

	getCenter(dst: Vector3) {
		return dst.copy(this.body.position);
	}
}