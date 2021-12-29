import THREE from "three";
import { OctreeObject } from "../octree";
import { RigidBody } from "./rigid_body";

let t1 = new THREE.Vector3();
let t2 = new THREE.Vector3();
let t3 = new THREE.Vector3();
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

	abstract updateInertiaTensor(): void;
	abstract support(dst: THREE.Vector3, direction: THREE.Vector3, translation?: THREE.Vector3): THREE.Vector3;
	abstract getCenter(dst: THREE.Vector3): THREE.Vector3;

	updateBoundingBox() {
		m1.compose(this.body.position, this.body.orientation, t1.setScalar(1));
		this.boundingBox.applyMatrix4(m1);

		if (this.body.prevValid) {
			let translation = t1.copy(this.body.position).sub(this.body.prevPosition);
			t2.copy(this.boundingBox.min).sub(translation);
			t3.copy(this.boundingBox.max).sub(translation);
			this.boundingBox.expandByPoint(t2).expandByPoint(t3);
		}

		this.body?.world?.octree.update(this);
	}

	isIntersectedByRay(rayOrigin: THREE.Vector3, rayDirection: THREE.Vector3, intersectionPoint?: THREE.Vector3) {
		return false; // temp
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

	support(dst: THREE.Vector3, direction: THREE.Vector3, translation?: THREE.Vector3) {
		dst.copy(direction).normalize().multiplyScalar(this.radius).add(this.body.position);

		if (translation && direction.dot(translation) > 0) dst.add(translation);

		return dst;
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

export class ConvexPolyhedronCollisionShape extends CollisionShape {
	points: THREE.Vector3[];
	localCenter = new THREE.Vector3();
	localAabb = new THREE.Box3();

	constructor(points: THREE.Vector3[]) {
		super();

		this.points = points;

		for (let point of points) {
			this.localCenter.addScaledVector(point, 1 / points.length);
		}
		this.computeLocalBoundingBox();

		this.updateInertiaTensor();
	}

	computeLocalBoundingBox() {
		this.localAabb.setFromPoints(this.points);
	}

	updateInertiaTensor() {
		// Do nothing for now, we likely won't need it
	}

	support(dst: THREE.Vector3, direction: THREE.Vector3, translation?: THREE.Vector3) {
		let maxDot = -Infinity;

		q1.copy(this.body.orientation).conjugate();
		let localDirection = t1.copy(direction).applyQuaternion(q1); // Transform it to local space

		for (let i = 0; i < this.points.length; i++) {
			let point = this.points[i];
			let dot = point.dot(localDirection);

			if (dot > maxDot) {
				maxDot = dot;
				dst.copy(point);
			}
		}
		
		this.body.transformPoint(dst);
		if (translation && direction.dot(translation) > 0) dst.add(translation);

		return dst;
	}

	getCenter(dst: THREE.Vector3) {
		return this.body.transformPoint(dst.copy(this.localCenter));
	}

	updateBoundingBox(): void {
		this.boundingBox.copy(this.localAabb);

		super.updateBoundingBox();
	}
}