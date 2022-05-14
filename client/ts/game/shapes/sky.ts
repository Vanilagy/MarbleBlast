import { Shape } from "../shape";

export class Sky extends Shape {
	collideable = false;

	constructor(type: string) {
		super();

		this.dtsPath = `shapes/skies/${type}/${type}.dts`;
	}
}