import { Plane } from "../math/plane";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { CollisionShape } from "./collision_shape";

let v1 = new Vector3();
let q1 = new Quaternion();

/** Represents a collision between two shapes. */
export class Collision {
	s1: CollisionShape;
	s2: CollisionShape;

	/** The time of impact assuming linear translation of both shapes. */
	timeOfImpact = 1;

	/** The collision normal. Points towards s1. */
	normal: Vector3;
	/** The penetration depth of the collision. */
	depth: number;
	/** The average collision point. */
	point: Vector3;
	/** The furthest point of s1 into s2. */
	point1: Vector3;
	/** The furthest point of s2 into s1. */
	point2: Vector3;

	/** The combined friction of this collision. */
	friction: number;
	/** The combined restitution of this collision. */
	restitution: number;

	s1Friction: number;
	s1Restitution: number;
	s2Friction: number;
	s2Restitution: number;
	s1MaterialOverride: Vector3 = null;
	s2MaterialOverride: Vector3 = null;

	constructor(s1: CollisionShape, s2: CollisionShape) {
		this.s1 = s1;
		this.s2 = s2;

		this.friction = s1.friction * s2.friction;
		this.restitution = s1.restitution * s2.restitution;

		this.s1Friction = s1.friction;
		this.s1Restitution = s1.restitution;
		this.s2Friction = s2.friction;
		this.s2Restitution = s2.restitution;
	}

	supplyCollisionPlane(plane: Plane) {
		this.normal = plane.normal.clone(); // Make sure to clone it here so no funky stuff happens
		this.depth = plane.constant;

		this.point1 = this.s1.support(new Vector3(), v1.copy(this.normal).negate()); // Horribly wrong in the general case, but gives the correct result if s1 is a ball
		this.point2 = this.point1.clone().addScaledVector(this.normal, this.depth);
		this.point = this.point1.clone().add(this.point2).multiplyScalar(0.5);
	}

	/** Updates the collision's friction and restitution if necessary. */
	updateMaterialProperties() {
		if (!this.normal) return;

		// Check for material overrides (check CollisionShape for more explanation on why)
		if (this.s1.materialOverrides.size > 0 || this.s2.materialOverrides.size > 0) {
			let s1Friction = this.s1.friction;
			let s2Friction = this.s2.friction;
			let s1Restitution = this.s1.restitution;
			let s2Restitution = this.s2.restitution;

			let max = -Infinity;
			let min = Infinity;
			let transformedNormal = v1;

			q1.copy(this.s1.body.orientation).conjugate();
			transformedNormal.copy(this.normal).applyQuaternion(q1);

			// Find the override for s1
			for (let [vec, material] of this.s1.materialOverrides) {
				let dot = vec.dot(transformedNormal);
				if (dot < min) {
					min = dot;

					s1Friction = material.friction;
					s1Restitution = material.restitution;
					this.s1MaterialOverride = vec;
				}
			}

			q1.copy(this.s2.body.orientation).conjugate();
			transformedNormal.copy(this.normal).applyQuaternion(q1);

			// Find the override for s2
			for (let [vec, material] of this.s2.materialOverrides) {
				let dot = vec.dot(transformedNormal);
				if (dot > max) {
					max = dot;

					s2Friction = material.friction;
					s2Restitution = material.restitution;
					this.s2MaterialOverride = vec;
				}
			}

			// Compute the final friction and restitution
			this.friction = s1Friction * s2Friction;
			this.restitution = s1Restitution * s2Restitution;

			this.s1Friction = s1Friction;
			this.s1Restitution = s1Restitution;
			this.s2Friction = s2Friction;
			this.s2Restitution = s2Restitution;
		}
	}
}