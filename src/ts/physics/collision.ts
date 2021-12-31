import THREE from "three";
import { CollisionShape } from "./collision_shape";

let v1 = new THREE.Vector3();
let q1 = new THREE.Quaternion();

export class Collision {
	s1: CollisionShape;
	s2: CollisionShape;

	timeOfImpact = 1;

	normal: THREE.Vector3;
	depth: number;
	point: THREE.Vector3;

	friction: number;
	restitution: number;

	s1Friction: number;
	s1Restitution: number;
	s2Friction: number;
	s2Restitution: number;
	s1MaterialOverride: THREE.Vector3 = null;
	s2MaterialOverride: THREE.Vector3 = null;

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

	supplyMinimumSeparatingVector(minimumSeparatingVector: THREE.Vector3) {
		this.normal = minimumSeparatingVector.clone().normalize();
		this.depth = minimumSeparatingVector.length();
		this.point = this.s1.getCenter(new THREE.Vector3()).addScaledVector(this.normal, -0.2).addScaledVector(minimumSeparatingVector, 0.5); // temp!

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

			for (let [vec, material] of this.s2.materialOverrides) {
				let dot = vec.dot(transformedNormal);
				if (dot > max) {
					max = dot;

					s2Friction = material.friction;
					s2Restitution = material.restitution;
					this.s2MaterialOverride = vec;
				}
			}

			this.friction = s1Friction * s2Friction;
			this.restitution = s1Restitution * s2Restitution;

			this.s1Friction = s1Friction;
			this.s1Restitution = s1Restitution;
			this.s2Friction = s2Friction;
			this.s2Restitution = s2Restitution;
		}
	}

	solvePosition() {
		let threshold = 0.01;
		let remainingPenetration = 0.5;

		if (this.depth < threshold) return;

		let distance = this.depth - remainingPenetration * threshold;

		this.s1.body.position.addScaledVector(this.normal, distance);
	}

	solveVelocity() {
		// Approach taken from https://www10.cs.fau.de/publications/theses/2010/Schornbaum_DA_2010.pdf

		let c_1 = this.s1.getCenter(new THREE.Vector3());
		let c_2 = this.s2.getCenter(new THREE.Vector3());

		let r_1 = this.point.clone().sub(c_1);
		let r_2 = this.point.clone().sub(c_2);

		let x = this.normal;
		let y = new THREE.Vector3();

		if (x.z === 0) y.set(x.y, -x.x, 0);
		else y.set(0, x.z, -x.y);
		y.normalize();

		let z = x.clone().cross(y);

		let B = new THREE.Matrix3().set(
			x.x, y.x, z.x,
			x.y, y.y, z.y,
			x.z, y.z, z.z
		);
		let BInv = B.clone().transpose(); // B is orthonormal

		let M_1 = new THREE.Matrix3().identity().multiplyScalar(1 / this.s1.mass);
		let M_2 = new THREE.Matrix3().identity().multiplyScalar(1 / this.s2.mass);

		let R_1 = new THREE.Matrix3().set(
			0, -r_1.z, r_1.y,
			r_1.z, 0, -r_1.x,
			-r_1.y, r_1.x, 0
		);
		let R_2 = new THREE.Matrix3().set(
			0, -r_2.z, r_2.y,
			r_2.z, 0, -r_2.x,
			-r_2.y, r_2.x, 0
		);

		const add = (m1: THREE.Matrix3, m2: THREE.Matrix3) => {
			for (let i = 0; i < m1.elements.length; i++) {
				m1.elements[i] += m2.elements[i];
			}
			return m1;
		};

		let K_world = add(add(M_1.clone(), R_1.clone().multiply(this.s1.invInertia).multiply(R_1).multiplyScalar(-1)), add(M_2.clone(), R_2.clone().multiply(this.s2.invInertia).multiply(R_2).multiplyScalar(-1)));

		let K_contact = BInv.clone().multiply(K_world).multiply(B);
		let K_contactInv = new THREE.Matrix3().getInverse(K_contact);

		let b1 = this.s1.body;
		let b2 = this.s2.body;

		let theta_1 = b1.angularVelocity.clone().cross(r_1).add(b1.linearVelocity).applyMatrix3(BInv);
		let theta_2 = b2.angularVelocity.clone().cross(r_2).add(b2.linearVelocity).applyMatrix3(BInv);

		let deltaThing = theta_1.x - theta_2.x;
		if (deltaThing > -0.0001) return;

		let res = this.restitution;
		if (deltaThing > -0.5) res = 0;

		let deltaDeltaTheta_12 = new THREE.Vector3(-(1 + res) * (theta_1.x - theta_2.x), -(theta_1.y - theta_2.y), -(theta_1.z - theta_2.z));
		let deltaJ = deltaDeltaTheta_12.clone().applyMatrix3(K_contactInv);
		let alpha = deltaJ.y**2 + deltaJ.z**2;

		let staticFriction = this.friction;
		if (alpha > staticFriction**2 * deltaJ.x**2) {
			let beta = this.friction / Math.sqrt(alpha);
			deltaJ.x = deltaDeltaTheta_12.x / (K_contact.elements[0] + beta * (K_contact.elements[3] * deltaJ.y + K_contact.elements[6] * deltaJ.z));
			let lambda = beta * deltaJ.x;
			deltaJ.y *= lambda;
			deltaJ.z *= lambda;
		}

		let deltaI = deltaJ.clone().applyMatrix3(B);

		b1.linearVelocity.addScaledVector(deltaI, 1 / this.s1.mass);
		b1.angularVelocity.add(r_1.clone().cross(deltaI).applyMatrix3(this.s1.invInertia));
		b2.linearVelocity.addScaledVector(deltaI, -1 / this.s2.mass);
		b2.angularVelocity.sub(r_2.clone().cross(deltaI).applyMatrix3(this.s2.invInertia));
	}
}