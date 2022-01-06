import { Matrix4 } from "../math/matrix4";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { Util } from "../util";

let m1 = new Matrix4();

export abstract class Camera {
	position = new Vector3();
	orientation = new Quaternion();
	up = new Vector3(0, 0, 1);

	matrixWorld: Matrix4;
	matrixWorldInverse: Matrix4;

	projectionMatrix: Matrix4;
	projectionMatrixInverse: Matrix4;

	constructor() {
		this.matrixWorld = new Matrix4();
		this.matrixWorldInverse = new Matrix4();

		this.projectionMatrix = new Matrix4();
		this.projectionMatrixInverse = new Matrix4();
	}

	updateMatrixWorld() {
		this.matrixWorld.compose(this.position, this.orientation, new Vector3().setScalar(1));
		this.matrixWorldInverse.copy(this.matrixWorld).invert();
	}

	lookAt(target: Vector3) {
		m1.lookAt(this.position, target, this.up);
		this.orientation.setFromRotationMatrix(m1);
	}
}

export class PerspectiveCamera extends Camera {
	fov: number;
	zoom: number;
	near: number;
	far: number;
	aspect: number;

	constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
		super();

		this.fov = fov;
		this.zoom = 1;
		this.near = near;
		this.far = far;
		this.aspect = aspect;

		this.updateProjectionMatrix();
	}

	updateProjectionMatrix() {
		const near = this.near;
		let top = (near * Math.tan(Util.degToRad(0.5 * this.fov))) / this.zoom;
		let height = 2 * top;
		let width = this.aspect * height;
		let left = -0.5 * width;

		this.projectionMatrix.makePerspective(left, left + width, top, top - height, near, this.far);
		this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
	}
}

export class OrthographicCamera extends Camera {
	zoom: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
	near: number;
	far: number;

	constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2000) {
		super();

		this.zoom = 1;
		this.left = left;
		this.right = right;
		this.top = top;
		this.bottom = bottom;
		this.near = near;
		this.far = far;

		this.updateProjectionMatrix();
	}

	updateProjectionMatrix() {
		const dx = (this.right - this.left) / (2 * this.zoom);
		const dy = (this.top - this.bottom) / (2 * this.zoom);
		const cx = (this.right + this.left) / 2;
		const cy = (this.top + this.bottom) / 2;

		let left = cx - dx;
		let right = cx + dx;
		let top = cy + dy;
		let bottom = cy - dy;

		this.projectionMatrix.makeOrthographic(left, right, top, bottom, this.near, this.far);
		this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
	}
}