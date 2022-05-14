import { Matrix4 } from "./matrix4";
import { Vector3 } from "./vector3";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

/** Represents an axis-aligned bounding box (AABB) in 3D space. */
export class Box3 {
	/** Vector3 representing the lower (x, y, z) boundary of the box. */
	min: Vector3;
	/** Vector3 representing the upper (x, y, z) boundary of the box. */
	max: Vector3;

	constructor(min = new Vector3(+Infinity, +Infinity, +Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)) {
		this.min = min;
		this.max = max;
	}

	/** Sets the lower and upper (x, y, z) boundaries of this box. */
	set(min: Vector3, max: Vector3) {
		this.min.copy(min);
		this.max.copy(max);

		return this;
	}

	/** Sets the upper and lower bounds of this box to include all of the data in `array`. */
	setFromArray(array: number[]) {
		let minX = +Infinity;
		let minY = +Infinity;
		let minZ = +Infinity;

		let maxX = -Infinity;
		let maxY = -Infinity;
		let maxZ = -Infinity;

		for (let i = 0, l = array.length; i < l; i += 3) {
			const x = array[i];
			const y = array[i + 1];
			const z = array[i + 2];

			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (z < minZ) minZ = z;

			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
			if (z > maxZ) maxZ = z;
		}

		this.min.set(minX, minY, minZ);
		this.max.set(maxX, maxY, maxZ);

		return this;
	}

	/** Sets the upper and lower bounds of this box to include all of the points in `points`. */
	setFromPoints(points: Vector3[]) {
		this.makeEmpty();

		for (let i = 0, il = points.length; i < il; i++) {
			this.expandByPoint(points[i]);
		}

		return this;
	}

	/** Centers this box on `center` and sets this box's width, height and depth to the values specified in `size`. */
	setFromCenterAndSize(center: Vector3, size: Vector3) {
		const halfSize = _vector.copy(size).multiplyScalar(0.5);

		this.min.copy(center).sub(halfSize);
		this.max.copy(center).add(halfSize);

		return this;
	}

	/** Returns a new Box3 with the same min and max as this one. */
	clone() {
		return new Box3().copy(this);
	}

	/** Copies the min and max from `box` to this box. */
	copy(box: Box3) {
		this.min.copy(box.min);
		this.max.copy(box.max);

		return this;
	}

	/** Makes this box empty. */
	makeEmpty() {
		this.min.x = this.min.y = this.min.z = +Infinity;
		this.max.x = this.max.y = this.max.z = -Infinity;

		return this;
	}

	/** Returns true if this box includes zero points within its bounds. Note that a box with equal lower and upper bounds still includes one point, the one both bounds share. */
	isEmpty() {
		// this is a more robust check for empty than ( volume <= 0 ) because volume can get positive with two negative axes

		return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
	}

	/** Returns the center point of the box as a Vector3. */
	getCenter(target: Vector3) {
		return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
	}

	/** Returns the width, height and depth of this box. */
	getSize(target: Vector3) {
		return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
	}

	/** Expands the boundaries of this box to include point. */
	expandByPoint(point: Vector3) {
		this.min.min(point);
		this.max.max(point);

		return this;
	}

	/** Expands this box equilaterally by vector. The width of this box will be expanded by the x component of vector in both directions. The height of this box will be expanded by the y component of vector in both directions. The depth of this box will be expanded by the z component of vector in both directions. */
	expandByVector(vector: Vector3) {
		this.min.sub(vector);
		this.max.add(vector);

		return this;
	}

	/** Expands each dimension of the box by scalar. If negative, the dimensions of the box will be contracted. */
	expandByScalar(scalar: number) {
		this.min.addScalar(-scalar);
		this.max.addScalar(scalar);

		return this;
	}

	/** Returns true if the specified point lies within or on the boundaries of this box. */
	containsPoint(point: Vector3) {
		return point.x < this.min.x || point.x > this.max.x || point.y < this.min.y || point.y > this.max.y || point.z < this.min.z || point.z > this.max.z ? false : true;
	}

	/** Returns true if this box includes the entirety of box. If this and box are identical, this function also returns true. */
	containsBox(box: Box3) {
		return this.min.x <= box.min.x && box.max.x <= this.max.x && this.min.y <= box.min.y && box.max.y <= this.max.y && this.min.z <= box.min.z && box.max.z <= this.max.z;
	}

	/** Returns a point as a proportion of this box's width, height and depth. */
	getParameter(point: Vector3, target: Vector3) {
		// This can potentially have a divide by zero if the box
		// has a size dimension of 0.

		return target.set((point.x - this.min.x) / (this.max.x - this.min.x), (point.y - this.min.y) / (this.max.y - this.min.y), (point.z - this.min.z) / (this.max.z - this.min.z));
	}

	/** Determines whether or not this box intersects box. */
	intersectsBox(box: Box3) {
		// using 6 splitting planes to rule out intersections.
		return box.max.x < this.min.x || box.min.x > this.max.x || box.max.y < this.min.y || box.min.y > this.max.y || box.max.z < this.min.z || box.min.z > this.max.z ? false : true;
	}

	/** Clamps the point within the bounds of this box. */
	clampPoint(point: Vector3, target: Vector3) {
		return target.copy(point).clamp(this.min, this.max);
	}

	/** Returns the distance from any edge of this box to the specified point. If the point lies inside of this box, the distance will be 0. */
	distanceToPoint(point: Vector3) {
		const clampedPoint = _vector.copy(point).clamp(this.min, this.max);

		return clampedPoint.sub(point).length();
	}

	/** Computes the intersection of this and `box`, setting the upper bound of this box to the lesser of the two boxes' upper bounds and the lower bound of this box to the greater of the two boxes' lower bounds. If there's no overlap, makes this box empty. */
	intersect(box: Box3) {
		this.min.max(box.min);
		this.max.min(box.max);

		// ensure that if there is no overlap, the result is fully empty, not slightly empty with non-inf/+inf values that will cause subsequence intersects to erroneously return valid values.
		if (this.isEmpty()) this.makeEmpty();

		return this;
	}

	/** Computes the union of this box and `box`, setting the upper bound of this box to the greater of the two boxes' upper bounds and the lower bound of this box to the lesser of the two boxes' lower bounds. */
	union(box: Box3) {
		this.min.min(box.min);
		this.max.max(box.max);

		return this;
	}

	/** Transforms this Box3 with the supplied matrix. */
	applyMatrix4(matrix: Matrix4) {
		// transform of empty box is an empty box.
		if (this.isEmpty()) return this;

		// NOTE: I am using a binary pattern to specify all 2^3 combinations below
		_points[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix); // 000
		_points[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix); // 001
		_points[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix); // 010
		_points[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix); // 011
		_points[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix); // 100
		_points[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix); // 101
		_points[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix); // 110
		_points[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix); // 111

		this.setFromPoints(_points);

		return this;
	}

	/** Adds `offset` to both the upper and lower bounds of this box, effectively moving this box offset units in 3D space. */
	translate(offset: Vector3) {
		this.min.add(offset);
		this.max.add(offset);

		return this;
	}

	/** Returns true if this box and `box` share the same lower and upper bounds. */
	equals(box: Box3) {
		return box.min.equals(this.min) && box.max.equals(this.max);
	}
}

const _points = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];

const _vector = new Vector3();