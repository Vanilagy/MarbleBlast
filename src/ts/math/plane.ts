import { Matrix3 } from "./matrix3";
import { Matrix4 } from "./matrix4";
import { Vector3 } from "./vector3";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

const _vector1 = new Vector3();
const _vector2 = new Vector3();
const _normalMatrix = new Matrix3();

/** A two dimensional surface that extends infinitely in 3d space, represented in Hessian normal form by a unit length normal vector and a constant. */
export class Plane {
	/** A unit-length Vector3 defining the normal of the plane. */
	normal: Vector3;
	/** The signed distance from the origin to the plane. */
	constant: number;

	constructor(normal = new Vector3(1, 0, 0), constant = 0) {
		// normal is assumed to be normalized

		this.normal = normal;
		this.constant = constant;
	}

	/** Sets this plane's normal and constant properties by copying the values from the given normal. */
	set(normal: Vector3, constant: number) {
		this.normal.copy(normal);
		this.constant = constant;

		return this;
	}

	/** Set the individual components that define the plane. */
	setComponents(x: number, y: number, z: number, w: number) {
		this.normal.set(x, y, z);
		this.constant = w;

		return this;
	}

	/** Sets the plane's properties as defined by a normal and an arbitrary coplanar point. */
	setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3) {
		this.normal.copy(normal);
		this.constant = -point.dot(this.normal);

		return this;
	}

	/** Defines the plane based on the 3 provided points. The winding order is assumed to be counter-clockwise, and determines the direction of the normal. */
	setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3) {
		const normal = _vector1.subVectors(c, b).cross(_vector2.subVectors(a, b)).normalize();

		// Q: should an error be thrown if normal is zero (e.g. degenerate plane)?

		this.setFromNormalAndCoplanarPoint(normal, a);

		return this;
	}

	/** Copies the values of the passed plane's normal and constant properties to this plane. */
	copy(plane: Plane) {
		this.normal.copy(plane.normal);
		this.constant = plane.constant;

		return this;
	}

	/** Normalizes the normal vector, and adjusts the constant value accordingly. */
	normalize() {
		// Note: will lead to a divide by zero if the plane is invalid.

		const inverseNormalLength = 1.0 / this.normal.length();
		this.normal.multiplyScalar(inverseNormalLength);
		this.constant *= inverseNormalLength;

		return this;
	}

	/** Negates both the normal vector and the constant. */
	negate() {
		this.constant *= -1;
		this.normal.negate();

		return this;
	}

	/** Returns the signed distance from the point to the plane. */
	distanceToPoint(point: Vector3) {
		return this.normal.dot(point) + this.constant;
	}

	/** Projects a point onto the plane. */
	projectPoint(point: Vector3, target: Vector3) {
		return target.copy(this.normal).multiplyScalar(-this.distanceToPoint(point)).add(point);
	}

	/** Returns a Vector3 coplanar to the plane, by calculating the projection of the normal vector at the origin onto the plane. */
	coplanarPoint(target: Vector3) {
		return target.copy(this.normal).multiplyScalar(-this.constant);
	}

	/** Apply a Matrix4 to the plane. The matrix must be an affine, homogeneous transform. */
	applyMatrix4(matrix: Matrix4, optionalNormalMatrix?: Matrix3) {
		const normalMatrix = optionalNormalMatrix || _normalMatrix.getNormalMatrix(matrix);

		const referencePoint = this.coplanarPoint(_vector1).applyMatrix4(matrix);

		const normal = this.normal.applyMatrix3(normalMatrix).normalize();

		this.constant = -referencePoint.dot(normal);

		return this;
	}

	/** Translates the plane by the distance defined by the offset vector. Note that this only affects the plane constant and will not affect the normal vector. */
	translate(offset: Vector3) {
		this.constant -= offset.dot(this.normal);

		return this;
	}

	/** Checks to see if two planes are equal (their normal and constant properties match). */
	equals(plane: Plane) {
		return plane.normal.equals(this.normal) && plane.constant === this.constant;
	}

	/** Returns a new plane with the same normal and constant as this one. */
	clone() {
		return new Plane().copy(this);
	}
}