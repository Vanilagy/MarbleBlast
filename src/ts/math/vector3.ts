import { Util } from "../util";
import { Euler } from "./euler";
import { Matrix3 } from "./matrix3";
import { Matrix4 } from "./matrix4";
import { Quaternion } from "./quaternion";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

/** Class representing a 3D vector. */
export class Vector3 {
	x: number;
	y: number;
	z: number;

	constructor(x = 0, y = 0, z = 0) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	/** Sets the x, y and z components of this vector. */
	set(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;

		return this;
	}

	/** Set the x, y and z values of this vector both equal to scalar. */
	setScalar(scalar: number) {
		this.x = scalar;
		this.y = scalar;
		this.z = scalar;

		return this;
	}

	/** Replace this vector's x value with x. */
	setX(x: number) {
		this.x = x;

		return this;
	}

	/** Replace this vector's y value with y. */
	setY(y: number) {
		this.y = y;

		return this;
	}

	/** Replace this vector's z value with z. */
	setZ(z: number) {
		this.z = z;

		return this;
	}

	/** If index equals 0 set x to value. If index equals 1 set y to value. If index equals 2 set z to value */
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
			default:
				throw new Error("index is out of range: " + index);
		}

		return this;
	}

	/** If index equals 0 returns the x value. If index equals 1 returns the y value. If index equals 2 returns the z value. */
	getComponent(index: number) {
		switch (index) {
			case 0:
				return this.x;
			case 1:
				return this.y;
			case 2:
				return this.z;
			default:
				throw new Error("index is out of range: " + index);
		}
	}

	/** Returns a new vector3 with the same x, y and z values as this one. */
	clone() {
		return new Vector3(this.x, this.y, this.z);
	}

	/** Copies the values of the passed vector3's x, y and z properties to this vector3. */
	copy(v: Vector3) {
		this.x = v.x;
		this.y = v.y;
		this.z = v.z;

		return this;
	}

	/** Adds v to this vector. */
	add(v: Vector3) {
		this.x += v.x;
		this.y += v.y;
		this.z += v.z;

		return this;
	}

	/** Adds the scalar value s to this vector's x, y and z values. */
	addScalar(s: number) {
		this.x += s;
		this.y += s;
		this.z += s;

		return this;
	}

	/** Sets this vector to a + b. */
	addVectors(a: Vector3, b: Vector3) {
		this.x = a.x + b.x;
		this.y = a.y + b.y;
		this.z = a.z + b.z;

		return this;
	}

	/** Adds the multiple of v and s to this vector. */
	addScaledVector(v: Vector3, s: number) {
		this.x += v.x * s;
		this.y += v.y * s;
		this.z += v.z * s;

		return this;
	}

	/** Subtracts v from this vector. */
	sub(v: Vector3) {
		this.x -= v.x;
		this.y -= v.y;
		this.z -= v.z;

		return this;
	}

	/** Subtracts s from this vector's x, y and z components. */
	subScalar(s: number) {
		this.x -= s;
		this.y -= s;
		this.z -= s;

		return this;
	}

	/** Sets this vector to a - b. */
	subVectors(a: Vector3, b: Vector3) {
		this.x = a.x - b.x;
		this.y = a.y - b.y;
		this.z = a.z - b.z;

		return this;
	}

	/** Multiplies this vector by v. */
	multiply(v: Vector3) {
		this.x *= v.x;
		this.y *= v.y;
		this.z *= v.z;

		return this;
	}

	/** Multiplies this vector by scalar s. */
	multiplyScalar(scalar: number) {
		this.x *= scalar;
		this.y *= scalar;
		this.z *= scalar;

		return this;
	}

	/** Sets this vector equal to a * b, component-wise. */
	multiplyVectors(a: Vector3, b: Vector3) {
		this.x = a.x * b.x;
		this.y = a.y * b.y;
		this.z = a.z * b.z;

		return this;
	}

	/** Applies euler transform to this vector by converting the Euler object to a Quaternion and applying. */
	applyEuler(euler: Euler) {
		return this.applyQuaternion(_quaternion.setFromEuler(euler));
	}

	/** Applies a rotation specified by an axis and an angle to this vector. */
	applyAxisAngle(axis: Vector3, angle: number) {
		return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle));
	}

	/** Multiplies this vector by m. */
	applyMatrix3(m: Matrix3) {
		const x = this.x,
			y = this.y,
			z = this.z;
		const e = m.elements;

		this.x = e[0] * x + e[3] * y + e[6] * z;
		this.y = e[1] * x + e[4] * y + e[7] * z;
		this.z = e[2] * x + e[5] * y + e[8] * z;

		return this;
	}

	/** Multiplies this vector by normal matrix m and normalizes the result. */
	applyNormalMatrix(m: Matrix3) {
		return this.applyMatrix3(m).normalize();
	}

	/** Multiplies this vector (with an implicit 1 in the 4th dimension) and m, and divides by perspective. */
	applyMatrix4(m: Matrix4) {
		const x = this.x,
			y = this.y,
			z = this.z;
		const e = m.elements;

		const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

		this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
		this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
		this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;

		return this;
	}

	/** Applies a Quaternion transform to this vector. */
	applyQuaternion(q: Quaternion) {
		const x = this.x,
			y = this.y,
			z = this.z;
		const qx = q.x,
			qy = q.y,
			qz = q.z,
			qw = q.w;

		// calculate quat * vector

		const ix = qw * x + qy * z - qz * y;
		const iy = qw * y + qz * x - qx * z;
		const iz = qw * z + qx * y - qy * x;
		const iw = -qx * x - qy * y - qz * z;

		// calculate result * inverse quat

		this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
		this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
		this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

		return this;
	}

	/** Transforms the direction of this vector by a matrix (the upper left 3 x 3 subset of a m) and then normalizes the result. */
	transformDirection(m: Matrix4) {
		// input: Matrix4 affine matrix
		// vector interpreted as a direction

		const x = this.x,
			y = this.y,
			z = this.z;
		const e = m.elements;

		this.x = e[0] * x + e[4] * y + e[8] * z;
		this.y = e[1] * x + e[5] * y + e[9] * z;
		this.z = e[2] * x + e[6] * y + e[10] * z;

		return this.normalize();
	}

	/** Multiplies this vector (with an implicit 1 in the 4th dimension) and m, and divides by perspective. */
	divide(v: Vector3) {
		this.x /= v.x;
		this.y /= v.y;
		this.z /= v.z;

		return this;
	}

	/** Divides this vector by scalar s. */
	divideScalar(scalar: number) {
		return this.multiplyScalar(1 / scalar);
	}

	/** If this vector's x, y or z value is greater than v's x, y or z value, replace that value with the corresponding min value. */
	min(v: Vector3) {
		this.x = Math.min(this.x, v.x);
		this.y = Math.min(this.y, v.y);
		this.z = Math.min(this.z, v.z);

		return this;
	}

	/** If this vector's x, y or z value is less than v's x, y or z value, replace that value with the corresponding max value. */
	max(v: Vector3) {
		this.x = Math.max(this.x, v.x);
		this.y = Math.max(this.y, v.y);
		this.z = Math.max(this.z, v.z);

		return this;
	}

	/** If this vector's x, y or z value is greater than the max vector's x, y or z value, it is replaced by the corresponding value. If this vector's x, y or z value is less than the min vector's x, y or z value, it is replaced by the corresponding value. */
	clamp(min: Vector3, max: Vector3) {
		// assumes min < max, componentwise

		this.x = Math.max(min.x, Math.min(max.x, this.x));
		this.y = Math.max(min.y, Math.min(max.y, this.y));
		this.z = Math.max(min.z, Math.min(max.z, this.z));

		return this;
	}

	/** If this vector's x, y or z values are greater than the max value, they are replaced by the max value. If this vector's x, y or z values are less than the min value, they are replaced by the min value. */
	clampScalar(minVal: number, maxVal: number) {
		this.x = Math.max(minVal, Math.min(maxVal, this.x));
		this.y = Math.max(minVal, Math.min(maxVal, this.y));
		this.z = Math.max(minVal, Math.min(maxVal, this.z));

		return this;
	}

	/** If this vector's length is greater than the max value, the vector will be scaled down so its length is the max value. If this vector's length is less than the min value, the vector will be scaled up so its length is the min value. */
	clampLength(min: number, max: number) {
		const length = this.length();

		return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
	}

	/** The components of this vector are rounded down to the nearest integer value. */
	floor() {
		this.x = Math.floor(this.x);
		this.y = Math.floor(this.y);
		this.z = Math.floor(this.z);

		return this;
	}

	/** The x, y and z components of this vector are rounded up to the nearest integer value. */
	ceil() {
		this.x = Math.ceil(this.x);
		this.y = Math.ceil(this.y);
		this.z = Math.ceil(this.z);

		return this;
	}

	/** The components of this vector are rounded to the nearest integer value. */
	round() {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);
		this.z = Math.round(this.z);

		return this;
	}

	/** The components of this vector are rounded towards zero (up if negative, down if positive) to an integer value. */
	roundToZero() {
		this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
		this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
		this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);

		return this;
	}

	/** Inverts this vector - i.e. sets x = -x, y = -y and z = -z. */
	negate() {
		this.x = -this.x;
		this.y = -this.y;
		this.z = -this.z;

		return this;
	}

	/** Calculate the dot product of this vector and v. */
	dot(v: Vector3) {
		return this.x * v.x + this.y * v.y + this.z * v.z;
	}

	/** Computes the square of the Euclidean length (straight-line length) from (0, 0, 0) to (x, y, z). */
	lengthSq() {
		return this.x * this.x + this.y * this.y + this.z * this.z;
	}

	/** Computes the Euclidean length (straight-line length) from (0, 0, 0) to (x, y, z). */
	length() {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}

	/** Computes the Manhattan length of this vector. */
	manhattanLength() {
		return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
	}

	/** Convert this vector to a unit vector - that is, sets it equal to a vector with the same direction as this one, but length 1. */
	normalize() {
		return this.divideScalar(this.length() || 1);
	}

	/** Set this vector to a vector with the same direction as this one, but length l. */
	setLength(length: number) {
		return this.normalize().multiplyScalar(length);
	}

	/** Linearly interpolate between this vector and v, where alpha is the percent distance along the line - alpha = 0 will be this vector, and alpha = 1 will be v. */
	lerp(v: Vector3, alpha: number) {
		this.x += (v.x - this.x) * alpha;
		this.y += (v.y - this.y) * alpha;
		this.z += (v.z - this.z) * alpha;

		return this;
	}

	/** Sets this vector to be the vector linearly interpolated between v1 and v2 where alpha is the percent distance along the line connecting the two vectors - alpha = 0 will be v1, and alpha = 1 will be v2. */
	lerpVectors(v1: Vector3, v2: Vector3, alpha: number) {
		this.x = v1.x + (v2.x - v1.x) * alpha;
		this.y = v1.y + (v2.y - v1.y) * alpha;
		this.z = v1.z + (v2.z - v1.z) * alpha;

		return this;
	}

	/** Sets this vector to cross product of itself and v. */
	cross(v: Vector3) {
		return this.crossVectors(this, v);
	}

	/** Sets this vector to cross product of a and b. */
	crossVectors(a: Vector3, b: Vector3) {
		const ax = a.x,
			ay = a.y,
			az = a.z;
		const bx = b.x,
			by = b.y,
			bz = b.z;

		this.x = ay * bz - az * by;
		this.y = az * bx - ax * bz;
		this.z = ax * by - ay * bx;

		return this;
	}

	/** Projects this vector onto v. */
	projectOnVector(v: Vector3) {
		const denominator = v.lengthSq();

		if (denominator === 0) return this.set(0, 0, 0);

		const scalar = v.dot(this) / denominator;

		return this.copy(v).multiplyScalar(scalar);
	}

	/** Projects this vector onto a plane by subtracting this vector projected onto the plane's normal from this vector. */
	projectOnPlane(planeNormal: Vector3) {
		_vector.copy(this).projectOnVector(planeNormal);

		return this.sub(_vector);
	}

	/** Reflect this vector off of plane orthogonal to normal. Normal is assumed to have unit length. */
	reflect(normal: Vector3) {
		// reflect incident vector off plane orthogonal to normal
		// normal is assumed to have unit length

		return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)));
	}

	/** Returns the angle between this vector and vector v in radians. */
	angleTo(v: Vector3) {
		const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());

		if (denominator === 0) return Math.PI / 2;

		const theta = this.dot(v) / denominator;

		// clamp, to handle numerical problems

		return Math.acos(Util.clamp(theta, -1, 1));
	}

	/** Computes the distance from this vector to v. */
	distanceTo(v: Vector3) {
		return Math.sqrt(this.distanceToSquared(v));
	}

	/** Computes the squared distance from this vector to v. */
	distanceToSquared(v: Vector3) {
		const dx = this.x - v.x,
			dy = this.y - v.y,
			dz = this.z - v.z;

		return dx * dx + dy * dy + dz * dz;
	}

	/** Computes the Manhattan distance from this vector to v. */
	manhattanDistanceTo(v: Vector3) {
		return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
	}

	/** Sets this vector to the position elements of the transformation matrix m. */
	setFromMatrixPosition(m: Matrix4) {
		const e = m.elements;

		this.x = e[12];
		this.y = e[13];
		this.z = e[14];

		return this;
	}

	/** Sets this vector to the scale elements of the transformation matrix m. */
	setFromMatrixScale(m: Matrix4) {
		const sx = this.setFromMatrixColumn(m, 0).length();
		const sy = this.setFromMatrixColumn(m, 1).length();
		const sz = this.setFromMatrixColumn(m, 2).length();

		this.x = sx;
		this.y = sy;
		this.z = sz;

		return this;
	}

	/** Sets this vector's x, y and z components from index column of matrix. */
	setFromMatrixColumn(m: Matrix4, index: number) {
		return this.fromArray(m.elements, index * 4);
	}

	/** Sets this vector's x, y and z components from index column of matrix. */
	setFromMatrix3Column(m: Matrix3, index: number) {
		return this.fromArray(m.elements, index * 3);
	}

	/** Returns true if the components of this vector and v are strictly equal; false otherwise. */
	equals(v: Vector3) {
		return v.x === this.x && v.y === this.y && v.z === this.z;
	}

	/** Sets this vector's x value to be array[offset + 0], y value to be array[offset + 1] and z value to be array[offset + 2]. */
	fromArray(array: number[], offset = 0) {
		this.x = array[offset];
		this.y = array[offset + 1];
		this.z = array[offset + 2];

		return this;
	}

	/** Returns an array [x, y, z], or copies x, y and z into the provided array. */
	toArray(array: number[] = [], offset = 0) {
		array[offset] = this.x;
		array[offset + 1] = this.y;
		array[offset + 2] = this.z;

		return array;
	}

	/** Sets each component of this vector to a pseudo-random value between 0 and 1, excluding 1. */
	random() {
		this.x = Math.random();
		this.y = Math.random();
		this.z = Math.random();

		return this;
	}

	/** Sets this vector to a uniformly random point on a unit sphere. */
	randomDirection() {
		// Derived from https://mathworld.wolfram.com/SpherePointPicking.html

		const u = (Math.random() - 0.5) * 2;
		const t = Math.random() * Math.PI * 2;
		const f = Math.sqrt(1 - u ** 2);

		this.x = f * Math.cos(t);
		this.y = f * Math.sin(t);
		this.z = u;

		return this;
	}

	*[Symbol.iterator]() {
		yield this.x;
		yield this.y;
		yield this.z;
	}
}

const _vector = new Vector3();
const _quaternion = new Quaternion();