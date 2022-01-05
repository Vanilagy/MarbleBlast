import { Vector3 } from "../math/vector3";
import { PerspectiveCamera } from "./camera";

/** Cube cameras can be used to render to cube textures. */
export class CubeCamera {
	cameras: PerspectiveCamera[] = [];
	position = new Vector3();

	constructor(near: number, far: number) {
		const fov = 90, aspect = 1;

		// Create all 6 cameras, each capturing exactly 1/6th of the cube (taken from three.js)

		const cameraPX = new PerspectiveCamera(fov, aspect, near, far);
		cameraPX.up.set(0, -1, 0);
		cameraPX.lookAt(new Vector3(1, 0, 0));
		this.cameras.push(cameraPX);

		const cameraNX = new PerspectiveCamera(fov, aspect, near, far);
		cameraNX.up.set(0, -1, 0);
		cameraNX.lookAt(new Vector3(-1, 0, 0));
		this.cameras.push(cameraNX);

		const cameraPY = new PerspectiveCamera(fov, aspect, near, far);
		cameraPY.up.set(0, 0, 1);
		cameraPY.lookAt(new Vector3(0, 1, 0));
		this.cameras.push(cameraPY);

		const cameraNY = new PerspectiveCamera(fov, aspect, near, far);
		cameraNY.up.set(0, 0, -1);
		cameraNY.lookAt(new Vector3(0, -1, 0));
		this.cameras.push(cameraNY);

		const cameraPZ = new PerspectiveCamera(fov, aspect, near, far);
		cameraPZ.up.set(0, -1, 0);
		cameraPZ.lookAt(new Vector3(0, 0, 1));
		this.cameras.push(cameraPZ);

		const cameraNZ = new PerspectiveCamera(fov, aspect, near, far);
		cameraNZ.up.set(0, -1, 0);
		cameraNZ.lookAt(new Vector3(0, 0, -1));
		this.cameras.push(cameraNZ);
	}
}