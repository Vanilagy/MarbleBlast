import { Util } from "../util";
import { Matrix4 } from "./matrix4";
import { Quaternion } from "./quaternion";
import { Vector3 } from "./vector3";

// Adapted from https://github.com/mrdoob/three.js/tree/dev/src/math

const _matrix = new Matrix4();
const _quaternion = new Quaternion();

/**
A class representing Euler Angles using intrinsic Tait-Bryan angles.

Euler angles describe a rotational transformation by rotating an object on its various axes in specified amounts per axis, and a specified axis order.
 */
export class Euler {
	static defaultOrder = "XYZ";
	static rotationOrders = ["XYZ", "YZX", "ZXY", "XZY", "YXZ", "ZYX"];

	x: number;
	y: number;
	z: number;
	order: string;

	constructor(x = 0, y = 0, z = 0, order = Euler.defaultOrder) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.order = order;
	}

	/** Sets the angles of this euler transform and optionally the `order`. */
	set(x: number, y: number, z: number, order = this.order) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.order = order;

		return this;
	}

	/** Returns a new Euler with the same parameters as this one. */
	clone() {
		return new Euler(this.x, this.y, this.z, this.order);
	}

	/** Copies value of `euler` to this euler. */
	copy(euler: Euler) {
		this.x = euler.x;
		this.y = euler.y;
		this.z = euler.z;
		this.order = euler.order;

		return this;
	}

	/** Sets the angles of this euler transform from a pure rotation matrix based on the orientation specified by `order`. */
	setFromRotationMatrix(m: Matrix4, order = this.order) {
		// assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

		const te = m.elements;
		const m11 = te[0],
			m12 = te[4],
			m13 = te[8];
		const m21 = te[1],
			m22 = te[5],
			m23 = te[9];
		const m31 = te[2],
			m32 = te[6],
			m33 = te[10];

		switch (order) {
			case "XYZ":
				this.y = Math.asin(Util.clamp(m13, -1, 1));

				if (Math.abs(m13) < 0.9999999) {
					this.x = Math.atan2(-m23, m33);
					this.z = Math.atan2(-m12, m11);
				} else {
					this.x = Math.atan2(m32, m22);
					this.z = 0;
				}

				break;

			case "YXZ":
				this.x = Math.asin(-Util.clamp(m23, -1, 1));

				if (Math.abs(m23) < 0.9999999) {
					this.y = Math.atan2(m13, m33);
					this.z = Math.atan2(m21, m22);
				} else {
					this.y = Math.atan2(-m31, m11);
					this.z = 0;
				}

				break;

			case "ZXY":
				this.x = Math.asin(Util.clamp(m32, -1, 1));

				if (Math.abs(m32) < 0.9999999) {
					this.y = Math.atan2(-m31, m33);
					this.z = Math.atan2(-m12, m22);
				} else {
					this.y = 0;
					this.z = Math.atan2(m21, m11);
				}

				break;

			case "ZYX":
				this.y = Math.asin(-Util.clamp(m31, -1, 1));

				if (Math.abs(m31) < 0.9999999) {
					this.x = Math.atan2(m32, m33);
					this.z = Math.atan2(m21, m11);
				} else {
					this.x = 0;
					this.z = Math.atan2(-m12, m22);
				}

				break;

			case "YZX":
				this.z = Math.asin(Util.clamp(m21, -1, 1));

				if (Math.abs(m21) < 0.9999999) {
					this.x = Math.atan2(-m23, m22);
					this.y = Math.atan2(-m31, m11);
				} else {
					this.x = 0;
					this.y = Math.atan2(m13, m33);
				}

				break;

			case "XZY":
				this.z = Math.asin(-Util.clamp(m12, -1, 1));

				if (Math.abs(m12) < 0.9999999) {
					this.x = Math.atan2(m32, m22);
					this.y = Math.atan2(m13, m11);
				} else {
					this.x = Math.atan2(-m23, m33);
					this.y = 0;
				}

				break;

			default:
				console.warn("Euler: .setFromRotationMatrix() encountered an unknown order: " + order);
		}

		this.order = order;

		return this;
	}

	/** Sets the angles of this euler transform from a normalized quaternion based on the orientation specified by `order`. */
	setFromQuaternion(q: Quaternion, order: string) {
		_matrix.makeRotationFromQuaternion(q);

		return this.setFromRotationMatrix(_matrix, order);
	}

	/** Set the x, y and z, and optionally update the `order`. */
	setFromVector3(v: Vector3, order = this.order) {
		return this.set(v.x, v.y, v.z, order);
	}

	/** Resets the euler angle with a new order by creating a quaternion from this euler angle and then setting this euler angle with the quaternion and the new order. WARNING: this discards revolution information. */
	reorder(newOrder: string) {
		// WARNING: this discards revolution information -bhouston

		_quaternion.setFromEuler(this);

		return this.setFromQuaternion(_quaternion, newOrder);
	}

	/** Checks for strict equality of this euler and `euler`. */
	equals(euler: Euler) {
		return euler.x === this.x && euler.y === this.y && euler.z === this.z && euler.order === this.order;
	}

	/** Assigns this euler's x angle to array[0]. Assigns this euler's y angle to array[1]. Assigns this euler's z angle to array[2]. Optionally assigns this euler's order to array[3]. */
	fromArray(array: any[]) {
		this.x = array[0];
		this.y = array[1];
		this.z = array[2];
		if (array[3] !== undefined) this.order = array[3];

		return this;
	}

	/** Returns an array of the form [x, y, z, order]. */
	toArray(array: any[] = [], offset = 0) {
		array[offset] = this.x;
		array[offset + 1] = this.y;
		array[offset + 2] = this.z;
		array[offset + 3] = this.order;

		return array;
	}

	/** Returns the Euler's x, y and z properties as a Vector3. */
	toVector3(optionalResult: Vector3) {
		if (optionalResult) {
			return optionalResult.set(this.x, this.y, this.z);
		} else {
			return new Vector3(this.x, this.y, this.z);
		}
	}
}