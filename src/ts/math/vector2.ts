import { Matrix3 } from "./matrix3";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

/** Class representing a 2D vector. */
export class Vector2 {
	x: number;
	y: number;

	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	get width() {
		return this.x;
	}

	set width(value) {
		this.x = value;
	}

	get height() {
		return this.y;
	}

	set height(value) {
		this.y = value;
	}

	/** Sets the x and y components of this vector. */
	set(x: number, y: number) {
		this.x = x;
		this.y = y;

		return this;
	}

	/** Sets the x and y values of this vector both equal to scalar. */
	setScalar(scalar: number) {
		this.x = scalar;
		this.y = scalar;

		return this;
	}

	/** Replaces this vector's x value with `x`. */
	setX(x: number) {
		this.x = x;

		return this;
	}

	/** Replaces this vector's y value with `y`. */
	setY(y: number) {
		this.y = y;

		return this;
	}

	/** If index equals 0 set x to value. If index equals 1 set y to value */
	setComponent(index: number, value: number) {
		switch (index) {
			case 0:
				this.x = value;
				break;
			case 1:
				this.y = value;
				break;
			default:
				throw new Error("index is out of range: " + index);
		}

		return this;
	}

	/** If index equals 0 returns the x value. If index equals 1 returns the y value. */
	getComponent(index: number) {
		switch (index) {
			case 0:
				return this.x;
			case 1:
				return this.y;
			default:
				throw new Error("index is out of range: " + index);
		}
	}

	/** Returns a new Vector2 with the same x and y values as this one. */
	clone() {
		return new Vector2(this.x, this.y);
	}

	/** Copies the values of the passed Vector2's x and y properties to this Vector2. */
	copy(v: Vector2) {
		this.x = v.x;
		this.y = v.y;

		return this;
	}

	/** Adds `v` to this vector. */
	add(v: Vector2) {
		this.x += v.x;
		this.y += v.y;

		return this;
	}

	/** Adds the scalar value `s` to this vector's x and y values. */
	addScalar(s: number) {
		this.x += s;
		this.y += s;

		return this;
	}

	/** Sets this vector to `a` + `b`. */
	addVectors(a: Vector2, b: Vector2) {
		this.x = a.x + b.x;
		this.y = a.y + b.y;

		return this;
	}

	/** Adds the multiple of `v` and `s` to this vector. */
	addScaledVector(v: Vector2, s: number) {
		this.x += v.x * s;
		this.y += v.y * s;

		return this;
	}

	/** Subtracts `v` from this vector. */
	sub(v: Vector2) {
		this.x -= v.x;
		this.y -= v.y;

		return this;
	}

	/** Subtracts `s` from this vector's x and y components. */
	subScalar(s: number) {
		this.x -= s;
		this.y -= s;

		return this;
	}

	/** Sets this vector to `a` - `b`. */
	subVectors(a: Vector2, b: Vector2) {
		this.x = a.x - b.x;
		this.y = a.y - b.y;

		return this;
	}

	/** Multiplies this vector by `v`. */
	multiply(v: Vector2) {
		this.x *= v.x;
		this.y *= v.y;

		return this;
	}

	/** Multiplies this vector by scalar `s`. */
	multiplyScalar(scalar: number) {
		this.x *= scalar;
		this.y *= scalar;

		return this;
	}

	/** Divides this vector by `v`. */
	divide(v: Vector2) {
		this.x /= v.x;
		this.y /= v.y;

		return this;
	}

	/** Divides this vector by scalar `s`. */
	divideScalar(scalar: number) {
		return this.multiplyScalar(1 / scalar);
	}

	/** Multiplies this vector (with an implicit 1 as the 3rd component) by `m`. */
	applyMatrix3(m: Matrix3) {
		const x = this.x,
			y = this.y;
		const e = m.elements;

		this.x = e[0] * x + e[3] * y + e[6];
		this.y = e[1] * x + e[4] * y + e[7];

		return this;
	}

	/** If this vector's x or y value is greater than v's x or y value, replace that value with the corresponding min value. */
	min(v: Vector2) {
		this.x = Math.min(this.x, v.x);
		this.y = Math.min(this.y, v.y);

		return this;
	}

	/** If this vector's x or y value is less than v's x or y value, replace that value with the corresponding max value. */
	max(v: Vector2) {
		this.x = Math.max(this.x, v.x);
		this.y = Math.max(this.y, v.y);

		return this;
	}

	/** If this vector's x or y value is greater than the max vector's x or y value, it is replaced by the corresponding value. If this vector's x or y value is less than the min vector's x or y value, it is replaced by the corresponding value. */
	clamp(min: Vector2, max: Vector2) {
		// assumes min < max, componentwise

		this.x = Math.max(min.x, Math.min(max.x, this.x));
		this.y = Math.max(min.y, Math.min(max.y, this.y));

		return this;
	}

	/** If this vector's x or y values are greater than the max value, they are replaced by the max value. If this vector's x or y values are less than the min value, they are replaced by the min value. */
	clampScalar(minVal: number, maxVal: number) {
		this.x = Math.max(minVal, Math.min(maxVal, this.x));
		this.y = Math.max(minVal, Math.min(maxVal, this.y));

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

		return this;
	}

	/** The components of this vector are rounded up to the nearest integer value. */
	ceil() {
		this.x = Math.ceil(this.x);
		this.y = Math.ceil(this.y);

		return this;
	}

	/** The components of this vector are rounded to the nearest integer value. */
	round() {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);

		return this;
	}

	/** The components of this vector are rounded towards zero (up if negative, down if positive) to an integer value. */
	roundToZero() {
		this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
		this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);

		return this;
	}

	/** Inverts this vector - i.e. sets x = -x and y = -y. */
	negate() {
		this.x = -this.x;
		this.y = -this.y;

		return this;
	}

	/** Calculates the dot product of this vector and v. */
	dot(v: Vector2) {
		return this.x * v.x + this.y * v.y;
	}

	/** Calculates the cross product of this vector and v. Note that a 'cross-product' in 2D is not well-defined. This function computes a geometric cross-product often used in 2D graphics. */
	cross(v: Vector2) {
		return this.x * v.y - this.y * v.x;
	}

	/** Computes the square of the Euclidean length (straight-line length) from (0, 0) to (x, y). */
	lengthSq() {
		return this.x * this.x + this.y * this.y;
	}

	/** Computes the Euclidean length (straight-line length) from (0, 0) to (x, y). */
	length() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	/** Computes the Manhattan length of this vector. */
	manhattanLength() {
		return Math.abs(this.x) + Math.abs(this.y);
	}

	/** Converts this vector to a unit vector - that is, sets it equal to a vector with the same direction as this one, but length 1. */
	normalize() {
		return this.divideScalar(this.length() || 1);
	}

	/** Computes the angle in radians of this vector with respect to the positive x-axis. */
	angle() {
		// computes the angle in radians with respect to the positive x-axis

		const angle = Math.atan2(-this.y, -this.x) + Math.PI;

		return angle;
	}

	/** Computes the distance from this vector to v. */
	distanceTo(v: Vector2) {
		return Math.sqrt(this.distanceToSquared(v));
	}

	/** Computes the squared distance from this vector to v. */
	distanceToSquared(v: Vector2) {
		const dx = this.x - v.x,
			dy = this.y - v.y;
		return dx * dx + dy * dy;
	}

	/** Computes the Manhattan distance from this vector to v. */
	manhattanDistanceTo(v: Vector2) {
		return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
	}

	/** Sets this vector to a vector with the same direction as this one, but length l. */
	setLength(length: number) {
		return this.normalize().multiplyScalar(length);
	}

	/** Linearly interpolates between this vector and `v`, where `alpha` is the percent distance along the line - `alpha` = 0 will be this vector, and `alpha` = 1 will be `v`. */
	lerp(v: Vector2, alpha: number) {
		this.x += (v.x - this.x) * alpha;
		this.y += (v.y - this.y) * alpha;

		return this;
	}

	/** Sets this vector to be the vector linearly interpolated between v1 and v2 where alpha is the percent distance along the line connecting the two vectors - alpha = 0 will be v1, and alpha = 1 will be v2. */
	lerpVectors(v1: Vector2, v2: Vector2, alpha: number) {
		this.x = v1.x + (v2.x - v1.x) * alpha;
		this.y = v1.y + (v2.y - v1.y) * alpha;

		return this;
	}

	/** Returns true if the components of this vector and v are strictly equal; false otherwise. */
	equals(v: Vector2) {
		return v.x === this.x && v.y === this.y;
	}

	/** Sets this vector's x value to be array[ offset ] and y value to be array[ offset + 1 ]. */
	fromArray(array: number[], offset = 0) {
		this.x = array[offset];
		this.y = array[offset + 1];

		return this;
	}

	/** Returns an array [x, y], or copies x and y into the provided array. */
	toArray(array: number[] = [], offset = 0) {
		array[offset] = this.x;
		array[offset + 1] = this.y;

		return array;
	}

	/** Rotates this vector around center by angle radians. */
	rotateAround(center: Vector2, angle: number) {
		const c = Math.cos(angle),
			s = Math.sin(angle);

		const x = this.x - center.x;
		const y = this.y - center.y;

		this.x = x * c - y * s + center.x;
		this.y = x * s + y * c + center.y;

		return this;
	}

	/** Sets each component of this vector to a pseudo-random value between 0 and 1, excluding 1. */
	random() {
		this.x = Math.random();
		this.y = Math.random();

		return this;
	}

	*[Symbol.iterator]() {
		yield this.x;
		yield this.y;
	}
}