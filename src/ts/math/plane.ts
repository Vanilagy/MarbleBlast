import { Matrix3 } from "./matrix3";
import { Matrix4 } from "./matrix4";
import { Vector3 } from "./vector3";

const _vector1 = new Vector3();
const _vector2 = new Vector3();
const _normalMatrix = new Matrix3();

export class Plane {
	normal: Vector3;
	constant: number;

	constructor(normal = new Vector3(1, 0, 0), constant = 0) {
		// normal is assumed to be normalized

		this.normal = normal;
		this.constant = constant;
	}

	set(normal: Vector3, constant: number) {
		this.normal.copy(normal);
		this.constant = constant;

		return this;
	}

	setComponents(x: number, y: number, z: number, w: number) {
		this.normal.set(x, y, z);
		this.constant = w;

		return this;
	}

	setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3) {
		this.normal.copy(normal);
		this.constant = -point.dot(this.normal);

		return this;
	}

	setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3) {
		const normal = _vector1.subVectors(c, b).cross(_vector2.subVectors(a, b)).normalize();

		// Q: should an error be thrown if normal is zero (e.g. degenerate plane)?

		this.setFromNormalAndCoplanarPoint(normal, a);

		return this;
	}

	copy(plane: Plane) {
		this.normal.copy(plane.normal);
		this.constant = plane.constant;

		return this;
	}

	normalize() {
		// Note: will lead to a divide by zero if the plane is invalid.

		const inverseNormalLength = 1.0 / this.normal.length();
		this.normal.multiplyScalar(inverseNormalLength);
		this.constant *= inverseNormalLength;

		return this;
	}

	negate() {
		this.constant *= -1;
		this.normal.negate();

		return this;
	}

	distanceToPoint(point: Vector3) {
		return this.normal.dot(point) + this.constant;
	}

	projectPoint(point: Vector3, target: Vector3) {
		return target.copy(this.normal).multiplyScalar(-this.distanceToPoint(point)).add(point);
	}

	coplanarPoint(target: Vector3) {
		return target.copy(this.normal).multiplyScalar(-this.constant);
	}

	applyMatrix4(matrix: Matrix4, optionalNormalMatrix?: Matrix3) {
		const normalMatrix = optionalNormalMatrix || _normalMatrix.getNormalMatrix(matrix);

		const referencePoint = this.coplanarPoint(_vector1).applyMatrix4(matrix);

		const normal = this.normal.applyMatrix3(normalMatrix).normalize();

		this.constant = -referencePoint.dot(normal);

		return this;
	}

	translate(offset: Vector3) {
		this.constant -= offset.dot(this.normal);

		return this;
	}

	equals(plane: Plane) {
		return plane.normal.equals(this.normal) && plane.constant === this.constant;
	}

	clone() {
		return new Plane().copy(this);
	}
}