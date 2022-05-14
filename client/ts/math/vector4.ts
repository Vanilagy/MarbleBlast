import { Matrix4 } from "./matrix4";
import { Quaternion } from "./quaternion";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

/** Class representing a 4D vector. */
export class Vector4 {
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

	get width() {
		return this.z;
	}

	set width(value) {
		this.z = value;
	}

	get height() {
		return this.w;
	}

	set height(value) {
		this.w = value;
	}

	/** Sets the x, y, z and w components of this vector. */
	set(x: number, y: number, z: number, w: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;

		return this;
	}

	/** Sets the x, y, z and w values of this vector both equal to scalar. */
	setScalar(scalar: number) {
		this.x = scalar;
		this.y = scalar;
		this.z = scalar;
		this.w = scalar;

		return this;
	}

	/** Replaces this vector's x value with x. */
	setX(x: number) {
		this.x = x;

		return this;
	}

	/** Replaces this vector's y value with y. */
	setY(y: number) {
		this.y = y;

		return this;
	}

	/** Replaces this vector's z value with z. */
	setZ(z: number) {
		this.z = z;

		return this;
	}

	/** Replaces this vector's w value with w. */
	setW(w: number) {
		this.w = w;

		return this;
	}

	/** If index equals 0 set x to value. If index equals 1 set y to value. If index equals 2 set z to value. If index equals 3 set w to value. */
	setComponent(index: number, value: number) {
		switch (index) {
			case 0:
				this.x = value;
				break;
			case 1:
				this.y = value;
				break;
			case 2:
				this.z = value;
				break;
			case 3:
				this.w = value;
				break;
			default:
				throw new Error("index is out of range: " + index);
		}

		return this;
	}

	/** If index equals 0 returns the x value. If index equals 1 returns the y value. If index equals 2 returns the z value. If index equals 3 returns the w value. */
	getComponent(index: number) {
		switch (index) {
			case 0:
				return this.x;
			case 1:
				return this.y;
			case 2:
				return this.z;
			case 3:
				return this.w;
			default:
				throw new Error("index is out of range: " + index);
		}
	}

	/** Returns a new Vector4 with the same x, y, z and w values as this one. */
	clone() {
		return new Vector4(this.x, this.y, this.z, this.w);
	}

	/** Copies the values of the passed Vector4's x, y, z and w properties to this Vector4. */
	copy(v: Vector4) {
		this.x = v.x;
		this.y = v.y;
		this.z = v.z;
		this.w = v.w !== undefined ? v.w : 1;

		return this;
	}

	/** Adds v to this vector. */
	add(v: Vector4) {
		this.x += v.x;
		this.y += v.y;
		this.z += v.z;
		this.w += v.w;

		return this;
	}

	/** Adds the scalar value s to this vector's x, y, z and w values. */
	addScalar(s: number) {
		this.x += s;
		this.y += s;
		this.z += s;
		this.w += s;

		return this;
	}

	/** Sets this vector to a + b. */
	addVectors(a: Vector4, b: Vector4) {
		this.x = a.x + b.x;
		this.y = a.y + b.y;
		this.z = a.z + b.z;
		this.w = a.w + b.w;

		return this;
	}

	/** Adds the multiple of v and s to this vector. */
	addScaledVector(v: Vector4, s: number) {
		this.x += v.x * s;
		this.y += v.y * s;
		this.z += v.z * s;
		this.w += v.w * s;

		return this;
	}

	/** Subtracts v from this vector. */
	sub(v: Vector4) {
		this.x -= v.x;
		this.y -= v.y;
		this.z -= v.z;
		this.w -= v.w;

		return this;
	}

	/** Subtracts s from this vector's x, y, z and w compnents. */
	subScalar(s: number) {
		this.x -= s;
		this.y -= s;
		this.z -= s;
		this.w -= s;

		return this;
	}

	/** Sets this vector to a - b. */
	subVectors(a: Vector4, b: Vector4) {
		this.x = a.x - b.x;
		this.y = a.y - b.y;
		this.z = a.z - b.z;
		this.w = a.w - b.w;

		return this;
	}

	/** Multiplies this vector by v. */
	multiply(v: Vector4) {
		this.x *= v.x;
		this.y *= v.y;
		this.z *= v.z;
		this.w *= v.w;

		return this;
	}

	/** Multiplies this vector by scalar s. */
	multiplyScalar(scalar: number) {
		this.x *= scalar;
		this.y *= scalar;
		this.z *= scalar;
		this.w *= scalar;

		return this;
	}

	/** Multiplies this vector by 4 x 4 m. */
	applyMatrix4(m: Matrix4) {
		const x = this.x,
			y = this.y,
			z = this.z,
			w = this.w;
		const e = m.elements;

		this.x = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
		this.y = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
		this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
		this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;

		return this;
	}

	/** Divides this vector by scalar s. */
	divideScalar(scalar: number) {
		return this.multiplyScalar(1 / scalar);
	}

	/** Sets the x, y and z components of this vector to the quaternion's axis and w to the angle. */
	setAxisAngleFromQuaternion(q: Quaternion) {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/index.htm

		// q is assumed to be normalized

		this.w = 2 * Math.acos(q.w);

		const s = Math.sqrt(1 - q.w * q.w);

		if (s < 0.0001) {
			this.x = 1;
			this.y = 0;
			this.z = 0;
		} else {
			this.x = q.x / s;
			this.y = q.y / s;
			this.z = q.z / s;
		}

		return this;
	}

	/** Sets the x, y and z to the axis of rotation and w to the angle. */
	setAxisAngleFromRotationMatrix(m: Matrix4) {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToAngle/index.htm

		// assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

		let angle, x, y, z; // variables for result
		const epsilon = 0.01, // margin to allow for rounding errors
			epsilon2 = 0.1, // margin to distinguish between 0 and 180 degrees
			te = m.elements,
			m11 = te[0],
			m12 = te[4],
			m13 = te[8],
			m21 = te[1],
			m22 = te[5],
			m23 = te[9],
			m31 = te[2],
			m32 = te[6],
			m33 = te[10];

		if (Math.abs(m12 - m21) < epsilon && Math.abs(m13 - m31) < epsilon && Math.abs(m23 - m32) < epsilon) {
			// singularity found
			// first check for identity matrix which must have +1 for all terms
			// in leading diagonal and zero in other terms

			if (Math.abs(m12 + m21) < epsilon2 && Math.abs(m13 + m31) < epsilon2 && Math.abs(m23 + m32) < epsilon2 && Math.abs(m11 + m22 + m33 - 3) < epsilon2) {
				// this singularity is identity matrix so angle = 0

				this.set(1, 0, 0, 0);

				return this; // zero angle, arbitrary axis
			}

			// otherwise this singularity is angle = 180

			angle = Math.PI;

			const xx = (m11 + 1) / 2;
			const yy = (m22 + 1) / 2;
			const zz = (m33 + 1) / 2;
			const xy = (m12 + m21) / 4;
			const xz = (m13 + m31) / 4;
			const yz = (m23 + m32) / 4;

			if (xx > yy && xx > zz) {
				// m11 is the largest diagonal term

				if (xx < epsilon) {
					x = 0;
					y = 0.707106781;
					z = 0.707106781;
				} else {
					x = Math.sqrt(xx);
					y = xy / x;
					z = xz / x;
				}
			} else if (yy > zz) {
				// m22 is the largest diagonal term

				if (yy < epsilon) {
					x = 0.707106781;
					y = 0;
					z = 0.707106781;
				} else {
					y = Math.sqrt(yy);
					x = xy / y;
					z = yz / y;
				}
			} else {
				// m33 is the largest diagonal term so base result on this

				if (zz < epsilon) {
					x = 0.707106781;
					y = 0.707106781;
					z = 0;
				} else {
					z = Math.sqrt(zz);
					x = xz / z;
					y = yz / z;
				}
			}

			this.set(x, y, z, angle);

			return this; // return 180 deg rotation
		}

		// as we have reached here there are no singularities so we can handle normally

		let s = Math.sqrt((m32 - m23) * (m32 - m23) + (m13 - m31) * (m13 - m31) + (m21 - m12) * (m21 - m12)); // used to normalize

		if (Math.abs(s) < 0.001) s = 1;

		// prevent divide by zero, should not happen if matrix is orthogonal and should be
		// caught by singularity test above, but I've left it in just in case

		this.x = (m32 - m23) / s;
		this.y = (m13 - m31) / s;
		this.z = (m21 - m12) / s;
		this.w = Math.acos((m11 + m22 + m33 - 1) / 2);

		return this;
	}

	/** If this vector's x, y, z or w value is greater than v's x, y, z or w value, replace that value with the corresponding min value. */
	min(v: Vector4) {
		this.x = Math.min(this.x, v.x);
		this.y = Math.min(this.y, v.y);
		this.z = Math.min(this.z, v.z);
		this.w = Math.min(this.w, v.w);

		return this;
	}

	/** If this vector's x, y, z or w value is less than v's x, y, z or w value, replace that value with the corresponding max value. */
	max(v: Vector4) {
		this.x = Math.max(this.x, v.x);
		this.y = Math.max(this.y, v.y);
		this.z = Math.max(this.z, v.z);
		this.w = Math.max(this.w, v.w);

		return this;
	}

	/** If this vector's x, y, z or w value is greater than the max vector's x, y, z or w value, it is replaced by the corresponding value. If this vector's x, y, z or w value is less than the min vector's x, y, z or w value, it is replaced by the corresponding value. */
	clamp(min: Vector4, max: Vector4) {
		// assumes min < max, componentwise

		this.x = Math.max(min.x, Math.min(max.x, this.x));
		this.y = Math.max(min.y, Math.min(max.y, this.y));
		this.z = Math.max(min.z, Math.min(max.z, this.z));
		this.w = Math.max(min.w, Math.min(max.w, this.w));

		return this;
	}

	/** If this vector's x, y, z or w values are greater than the max value, they are replaced by the max value. If this vector's x, y, z or w values are less than the min value, they are replaced by the min value. */
	clampScalar(minVal: number, maxVal: number) {
		this.x = Math.max(minVal, Math.min(maxVal, this.x));
		this.y = Math.max(minVal, Math.min(maxVal, this.y));
		this.z = Math.max(minVal, Math.min(maxVal, this.z));
		this.w = Math.max(minVal, Math.min(maxVal, this.w));

		return this;
	}

	/** If this vector's length is greater than the max value, it is replaced by the max value. If this vector's length is less than the min value, it is replaced by the min value. */
	clampLength(min: number, max: number) {
		const length = this.length();

		return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
	}

	/** The components of this vector are rounded down to the nearest integer value. */
	floor() {
		this.x = Math.floor(this.x);
		this.y = Math.floor(this.y);
		this.z = Math.floor(this.z);
		this.w = Math.floor(this.w);

		return this;
	}

	/** The components of this vector are rounded up to the nearest integer value. */
	ceil() {
		this.x = Math.ceil(this.x);
		this.y = Math.ceil(this.y);
		this.z = Math.ceil(this.z);
		this.w = Math.ceil(this.w);

		return this;
	}

	/** The components of this vector are rounded to the nearest integer value. */
	round() {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);
		this.z = Math.round(this.z);
		this.w = Math.round(this.w);

		return this;
	}

	/** The components of this vector are rounded towards zero (up if negative, down if positive) to an integer value. */
	roundToZero() {
		this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
		this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
		this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);
		this.w = this.w < 0 ? Math.ceil(this.w) : Math.floor(this.w);

		return this;
	}

	/** Inverts this vector - i.e. sets x = -x, y = -y, z = -z and w = -w. */
	negate() {
		this.x = -this.x;
		this.y = -this.y;
		this.z = -this.z;
		this.w = -this.w;

		return this;
	}

	/** Calculates the dot product of this vector and v. */
	dot(v: Vector4) {
		return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
	}

	/** Computes the square of the Euclidean length (straight-line length) from (0, 0, 0, 0) to (x, y, z, w). */
	lengthSq() {
		return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
	}

	/** Computes the Euclidean length (straight-line length) from (0, 0, 0, 0) to (x, y, z, w). */
	length() {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
	}

	/** Computes the Manhattan length of this vector. */
	manhattanLength() {
		return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
	}

	/** Converts this vector to a unit vector - that is, sets it equal to a vector with the same direction as this one, but length 1. */
	normalize() {
		return this.divideScalar(this.length() || 1);
	}

	/** Sets this vector to a vector with the same direction as this one, but length l. */
	setLength(length: number) {
		return this.normalize().multiplyScalar(length);
	}

	/** Linearly interpolates between this vector and v, where alpha is the percent distance along the line - alpha = 0 will be this vector, and alpha = 1 will be v. */
	lerp(v: Vector4, alpha: number) {
		this.x += (v.x - this.x) * alpha;
		this.y += (v.y - this.y) * alpha;
		this.z += (v.z - this.z) * alpha;
		this.w += (v.w - this.w) * alpha;

		return this;
	}

	/** Sets this vector to be the vector linearly interpolated between v1 and v2 where alpha is the percent distance along the line connecting the two vectors - alpha = 0 will be v1, and alpha = 1 will be v2. */
	lerpVectors(v1: Vector4, v2: Vector4, alpha: number) {
		this.x = v1.x + (v2.x - v1.x) * alpha;
		this.y = v1.y + (v2.y - v1.y) * alpha;
		this.z = v1.z + (v2.z - v1.z) * alpha;
		this.w = v1.w + (v2.w - v1.w) * alpha;

		return this;
	}

	/** Returns true if the components of this vector and v are strictly equal; false otherwise. */
	equals(v: Vector4) {
		return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
	}

	/** Sets this vector's x value to be array[offset + 0], y value to be array[offset + 1] z value to be array[offset + 2] and w value to be array[offset + 3]. */
	fromArray(array: number[], offset = 0) {
		this.x = array[offset];
		this.y = array[offset + 1];
		this.z = array[offset + 2];
		this.w = array[offset + 3];

		return this;
	}

	/** Returns an array [x, y, z, w], or copies x, y, z and w into the provided array. */
	toArray(array: number[] = [], offset = 0) {
		array[offset] = this.x;
		array[offset + 1] = this.y;
		array[offset + 2] = this.z;
		array[offset + 3] = this.w;

		return array;
	}

	/** Sets each component of this vector to a pseudo-random value between 0 and 1, excluding 1. */
	random() {
		this.x = Math.random();
		this.y = Math.random();
		this.z = Math.random();
		this.w = Math.random();

		return this;
	}

	*[Symbol.iterator]() {
		yield this.x;
		yield this.y;
		yield this.z;
		yield this.w;
	}
}