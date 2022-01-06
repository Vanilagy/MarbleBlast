import { Vector3 } from "../math/vector3";

/** Represents a simple ambient light that lights up everything uniformly. */
export class AmbientLight {
	color: Vector3;

	constructor(color: Vector3) {
		this.color = color;
	}
}