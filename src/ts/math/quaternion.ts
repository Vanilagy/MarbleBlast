import { Util } from "../util";
import { Euler } from "./euler";
import { Matrix4 } from "./matrix4";
import { Vector3 } from "./vector3";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

/** Implementation of a quaternion. */
export class Quaternion {
	x: number;
	y: number;
	z: number;
	w: number;

	constructor(x = 0, y = 0, z = 0, w = 1) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;
	}

	/** Sets x, y, z, w properties of this quaternion. */
	set(x: number, y: number, z: number, w: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;

		return this;
	}

	/** Creates a new Quaternion with identical x, y, z and w properties to this one. */
	clone() {
		return new Quaternion(this.x, this.y, this.z, this.w);
	}

	/** Copies the x, y, z and w properties of `q` into this quaternion. */
	copy(quaternion: Quaternion) {
		this.x = quaternion.x;
		this.y = quaternion.y;
		this.z = quaternion.z;
		this.w = quaternion.w;

		return this;
	}

	/** Sets this quaternion from the rotation specified by Euler angle. */
	setFromEuler(euler: Euler) {
		const x = euler.x,
			y = euler.y,
			z = euler.z,
			order = euler.order;

		// http://www.mathworks.com/matlabcentral/fileexchange/
		// 	20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/
		//	content/SpinCalc.m

		const cos = Math.cos;
		const sin = Math.sin;

		const c1 = cos(x / 2);
		const c2 = cos(y / 2);
		const c3 = cos(z / 2);

		const s1 = sin(x / 2);
		const s2 = sin(y / 2);
		const s3 = sin(z / 2);

		switch (order) {
			case "XYZ":
				this.x = s1 * c2 * c3 + c1 * s2 * s3;
				this.y = c1 * s2 * c3 - s1 * c2 * s3;
				this.z = c1 * c2 * s3 + s1 * s2 * c3;
				this.w = c1 * c2 * c3 - s1 * s2 * s3;
				break;

			case "YXZ":
				this.x = s1 * c2 * c3 + c1 * s2 * s3;
				this.y = c1 * s2 * c3 - s1 * c2 * s3;
				this.z = c1 * c2 * s3 - s1 * s2 * c3;
				this.w = c1 * c2 * c3 + s1 * s2 * s3;
				break;

			case "ZXY":
				this.x = s1 * c2 * c3 - c1 * s2 * s3;
				this.y = c1 * s2 * c3 + s1 * c2 * s3;
				this.z = c1 * c2 * s3 + s1 * s2 * c3;
				this.w = c1 * c2 * c3 - s1 * s2 * s3;
				break;

			case "ZYX":
				this.x = s1 * c2 * c3 - c1 * s2 * s3;
				this.y = c1 * s2 * c3 + s1 * c2 * s3;
				this.z = c1 * c2 * s3 - s1 * s2 * c3;
				this.w = c1 * c2 * c3 + s1 * s2 * s3;
				break;

			case "YZX":
				this.x = s1 * c2 * c3 + c1 * s2 * s3;
				this.y = c1 * s2 * c3 + s1 * c2 * s3;
				this.z = c1 * c2 * s3 - s1 * s2 * c3;
				this.w = c1 * c2 * c3 - s1 * s2 * s3;
				break;

			case "XZY":
				this.x = s1 * c2 * c3 - c1 * s2 * s3;
				this.y = c1 * s2 * c3 - s1 * c2 * s3;
				this.z = c1 * c2 * s3 + s1 * s2 * c3;
				this.w = c1 * c2 * c3 + s1 * s2 * s3;
				break;

			default:
				console.warn("Quaternion: .setFromEuler() encountered an unknown order: " + order);
		}

		return this;
	}

	/** Sets this quaternion from rotation specified by `axis` and `angle`. Axis is assumed to be normalized, angle is in radians. */
	setFromAxisAngle(axis: Vector3, angle: number) {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm

		// assumes axis is normalized

		const halfAngle = angle / 2,
			s = Math.sin(halfAngle);

		this.x = axis.x * s;
		this.y = axis.y * s;
		this.z = axis.z * s;
		this.w = Math.cos(halfAngle);

		return this;
	}

	/** Sets this quaternion from rotation component of `m`. */
	setFromRotationMatrix(m: Matrix4) {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm

		// assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

		const te = m.elements,
			m11 = te[0],
			m12 = te[4],
			m13 = te[8],
			m21 = te[1],
			m22 = te[5],
			m23 = te[9],
			m31 = te[2],
			m32 = te[6],
			m33 = te[10],
			trace = m11 + m22 + m33;

		if (trace > 0) {
			const s = 0.5 / Math.sqrt(trace + 1.0);

			this.w = 0.25 / s;
			this.x = (m32 - m23) * s;
			this.y = (m13 - m31) * s;
			this.z = (m21 - m12) * s;
		} else if (m11 > m22 && m11 > m33) {
			const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);

			this.w = (m32 - m23) / s;
			this.x = 0.25 * s;
			this.y = (m12 + m21) / s;
			this.z = (m13 + m31) / s;
		} else if (m22 > m33) {
			const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);

			this.w = (m13 - m31) / s;
			this.x = (m12 + m21) / s;
			this.y = 0.25 * s;
			this.z = (m23 + m32) / s;
		} else {
			const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);

			this.w = (m21 - m12) / s;
			this.x = (m13 + m31) / s;
			this.y = (m23 + m32) / s;
			this.z = 0.25 * s;
		}

		return this;
	}

	/** Sets this quaternion to the rotation required to rotate direction vector `vFrom` to direction vector `vTo`. `vFrom` and `vTo` are assumed to be normalized. */
	setFromUnitVectors(vFrom: Vector3, vTo: Vector3) {
		// assumes direction vectors vFrom and vTo are normalized

		let r = vFrom.dot(vTo) + 1;

		if (r < Number.EPSILON) {
			// vFrom and vTo point in opposite directions

			r = 0;

			if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
				this.x = -vFrom.y;
				this.y = vFrom.x;
				this.z = 0;
				this.w = r;
			} else {
				this.x = 0;
				this.y = -vFrom.z;
				this.z = vFrom.y;
				this.w = r;
			}
		} else {
			// crossVectors( vFrom, vTo ); // inlined to avoid cyclic dependency on Vector3

			this.x = vFrom.y * vTo.z - vFrom.z * vTo.y;
			this.y = vFrom.z * vTo.x - vFrom.x * vTo.z;
			this.z = vFrom.x * vTo.y - vFrom.y * vTo.x;
			this.w = r;
		}

		return this.normalize();
	}

	/** Returns the angle between this quaternion and quaternion `q` in radians. */
	angleTo(q: Quaternion) {
		return 2 * Math.acos(Math.abs(Util.clamp(this.dot(q), -1, 1)));
	}

	/** Rotates this quaternion by a given angular step to the defined quaternion `q`. The method ensures that the final quaternion will not overshoot `q`. */
	rotateTowards(q: Quaternion, step: number) {
		const angle = this.angleTo(q);

		if (angle === 0) return this;

		const t = Math.min(1, step / angle);

		this.slerp(q, t);

		return this;
	}

	/** Sets this quaternion to the identity quaternion; that is, to the quaternion that represents "no rotation". */
	identity() {
		return this.set(0, 0, 0, 1);
	}

	/** Inverts this quaternion - calculates the conjugate. The quaternion is assumed to have unit length. */
	invert() {
		// quaternion is assumed to have unit length

		return this.conjugate();
	}

	/** Returns the rotational conjugate of this quaternion. The conjugate of a quaternion represents the same rotation in the opposite direction about the rotational axis. */
	conjugate() {
		this.x *= -1;
		this.y *= -1;
		this.z *= -1;

		return this;
	}

	/** Calculates the dot product of quaternions `v` and this one. */
	dot(v: Quaternion) {
		return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
	}

	/** Computes the squared Euclidean length (straight-line length) of this quaternion, considered as a 4 dimensional vector. */
	lengthSq() {
		return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
	}

	/** Computes the Euclidean length (straight-line length) of this quaternion, considered as a 4 dimensional vector. */
	length() {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
	}

	/** Normalizes this quaternion - that is, calculated the quaternion that performs the same rotation as this one, but has length equal to 1. */
	normalize() {
		let l = this.length();

		if (l === 0) {
			this.x = 0;
			this.y = 0;
			this.z = 0;
			this.w = 1;
		} else {
			l = 1 / l;

			this.x = this.x * l;
			this.y = this.y * l;
			this.z = this.z * l;
			this.w = this.w * l;
		}

		return this;
	}

	/** Multiplies this quaternion by `q`. */
	multiply(q: Quaternion) {
		return this.multiplyQuaternions(this, q);
	}

	/** Pre-multiplies this quaternion by `q`. */
	premultiply(q: Quaternion) {
		return this.multiplyQuaternions(q, this);
	}

	/** Sets this quaternion to `a` x `b`. */
	multiplyQuaternions(a: Quaternion, b: Quaternion) {
		// from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm

		const qax = a.x,
			qay = a.y,
			qaz = a.z,
			qaw = a.w;
		const qbx = b.x,
			qby = b.y,
			qbz = b.z,
			qbw = b.w;

		this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
		this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
		this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
		this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

		return this;
	}

	/** Handles the spherical linear interpolation between quaternions. t represents the amount of rotation between this quaternion (where `t` is 0) and `qb` (where `t` is 1). This quaternion is set to the result. */
	slerp(qb: Quaternion, t: number) {
		if (t === 0) return this;
		if (t === 1) return this.copy(qb);

		const x = this.x,
			y = this.y,
			z = this.z,
			w = this.w;

		// http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

		let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;

		if (cosHalfTheta < 0) {
			this.w = -qb.w;
			this.x = -qb.x;
			this.y = -qb.y;
			this.z = -qb.z;

			cosHalfTheta = -cosHalfTheta;
		} else {
			this.copy(qb);
		}

		if (cosHalfTheta >= 1.0) {
			this.w = w;
			this.x = x;
			this.y = y;
			this.z = z;

			return this;
		}

		const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;

		if (sqrSinHalfTheta <= Number.EPSILON) {
			const s = 1 - t;
			this.w = s * w + t * this.w;
			this.x = s * x + t * this.x;
			this.y = s * y + t * this.y;
			this.z = s * z + t * this.z;

			this.normalize();

			return this;
		}

		const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
		const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
		const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta,
			ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

		this.w = w * ratioA + this.w * ratioB;
		this.x = x * ratioA + this.x * ratioB;
		this.y = y * ratioA + this.y * ratioB;
		this.z = z * ratioA + this.z * ratioB;

		return this;
	}

	/** Performs a spherical linear interpolation between the given quaternions and stores the result in this quaternion. */
	slerpQuaternions(qa: Quaternion, qb: Quaternion, t: number) {
		return this.copy(qa).slerp(qb, t);
	}

	/** Sets this quaternion to a uniformly random, normalized quaternion. */
	random() {
		// Derived from http://planning.cs.uiuc.edu/node198.html
		// Note, this source uses w, x, y, z ordering,
		// so we swap the order below.

		const u1 = Math.random();
		const sqrt1u1 = Math.sqrt(1 - u1);
		const sqrtu1 = Math.sqrt(u1);

		const u2 = 2 * Math.PI * Math.random();

		const u3 = 2 * Math.PI * Math.random();

		return this.set(sqrt1u1 * Math.cos(u2), sqrtu1 * Math.sin(u3), sqrtu1 * Math.cos(u3), sqrt1u1 * Math.sin(u2));
	}

	/** Compares the x, y, z and w properties of v to the equivalent properties of this quaternion to determine if they represent the same rotation. */
	equals(quaternion: Quaternion) {
		return (
			quaternion.x === this.x && quaternion.y === this.y && quaternion.z === this.z && quaternion.w === this.w
		);
	}

	/** Sets this quaternion's x, y, z and w properties from an array. */
	fromArray(array: number[], offset = 0) {
		this.x = array[offset];
		this.y = array[offset + 1];
		this.z = array[offset + 2];
		this.w = array[offset + 3];

		return this;
	}

	/** Returns the numerical elements of this quaternion in an array of format [x, y, z, w]. */
	toArray(array: number[] = [], offset = 0) {
		array[offset] = this.x;
		array[offset + 1] = this.y;
		array[offset + 2] = this.z;
		array[offset + 3] = this.w;

		return array;
	}
}