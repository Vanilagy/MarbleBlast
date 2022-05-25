import { Shape } from "../shape";

export class Sky extends Shape {
	collideable = false;
	passiveBodies = true;

	constructor(type: string) {
		super();

		this.dtsPath = `shapes/skies/${type}/${type}.dts`;
	}
}