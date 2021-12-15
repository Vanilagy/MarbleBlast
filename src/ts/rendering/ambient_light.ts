/** Represents a simple ambient light that lights up everything uniformly. */
export class AmbientLight {
	color: THREE.Color;

	constructor(color: THREE.Color) {
		this.color = color;
	}
}