import THREE from "three";
import { OctreeObject } from "./octree";
import { RigidBody } from "./rigid_body";

let v1 = new THREE.Vector3();
let v2 = new THREE.Vector3();
let v3 = new THREE.Vector3();
let v4 = new THREE.Vector3();
let v5 = new THREE.Vector3();
let m1 = new THREE.Matrix4();
let q1 = new THREE.Quaternion();

export abstract class CollisionShape implements OctreeObject {
	body: RigidBody = null;
	boundingBox = new THREE.Box3();
	broadphaseShape: CollisionShape = null;
	collisionDetectionMask = 0b1;
	collisionResponseMask = 0b1;

	friction = 1;
	restitution = 1;
	mass = 1;
	inertia = new THREE.Matrix3().identity();
	invInertia = new THREE.Matrix3().identity();

	materialOverrides = new Map<THREE.Vector3, { friction: number, restitution: number }>();

	userData: any;

	abstract updateInertiaTensor(): void;
	abstract support(dst: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3;
	abstract getCenter(dst: THREE.Vector3): THREE.Vector3;

	updateBoundingBox() {
		m1.compose(this.body.position, this.body.orientation, v1.setScalar(1));
		this.boundingBox.applyMatrix4(m1);

		if (this.body.prevValid) {
			let translation = v1.copy(this.body.position).sub(this.body.prevPosition);
			v2.copy(this.boundingBox.min).sub(translation); // Go backwards
			v3.copy(this.boundingBox.max).sub(translation);
			this.boundingBox.expandByPoint(v2).expandByPoint(v3);
		}

		this.body?.world?.octree.update(this);
	}
}

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
		this.invInertia.getInverse(this.inertia);
	}

	support(dst: THREE.Vector3, direction: THREE.Vector3) {
		return dst.copy(direction).normalize().multiplyScalar(this.radius).add(this.body.position);
	}

	getCenter(dst: THREE.Vector3) {
		return dst.copy(this.body.position);
	}

	updateBoundingBox() {
		this.boundingBox.min.setScalar(-this.radius);
		this.boundingBox.max.setScalar(this.radius);

		super.updateBoundingBox();
	}
}

export class ConvexHullCollisionShape extends CollisionShape {
	points: THREE.Vector3[];
	localCenter = new THREE.Vector3();
	localAabb = new THREE.Box3();

	constructor(points: THREE.Vector3[]) {
		super();

		this.points = points;

		this.computeLocalBoundingBox();
		this.updateInertiaTensor();
	}

	computeLocalBoundingBox() {
		this.localCenter.setScalar(0);
		for (let point of this.points) this.localCenter.addScaledVector(point, 1 / this.points.length);

		this.localAabb.setFromPoints(this.points);
	}

	updateInertiaTensor() {
		// Do nothing for now, we likely won't need it because there is no dynamic convex hull object
	}

	support(dst: THREE.Vector3, direction: THREE.Vector3) {
		q1.copy(this.body.orientation).conjugate();
		let localDirection = v1.copy(direction).applyQuaternion(q1); // Transform it to local space

		let maxDot = -Infinity;

		for (let i = 0; i < this.points.length; i++) {
			let point = this.points[i];
			let dot = point.dot(localDirection);

			if (dot > maxDot) {
				maxDot = dot;
				dst.copy(point);
			}
		}

		return this.body.transformPoint(dst);
	}

	getCenter(dst: THREE.Vector3) {
		return this.body.transformPoint(dst.copy(this.localCenter));
	}

	updateBoundingBox(): void {
		this.boundingBox.copy(this.localAabb);

		super.updateBoundingBox();
	}
}

export class CombinedCollisionShape extends CollisionShape {
	s1: CollisionShape;
	s2: CollisionShape;

	constructor(s1: CollisionShape, s2: CollisionShape) {
		super();

		this.s1 = s1;
		this.s2 = s2;
	}

	updateInertiaTensor() {}

	support(dst: THREE.Vector3, direction: THREE.Vector3) {
		let supp1 = this.s1.support(v4, direction);
		let supp2 = this.s2.support(v5, direction);

		if (supp1.dot(direction) > supp2.dot(direction)) dst.copy(supp1);
		else dst.copy(supp2);

		return dst;
	}

	getCenter(dst: THREE.Vector3) {
		return this.s1.getCenter(dst).add(this.s2.getCenter(v4)).multiplyScalar(0.5);
	}
}