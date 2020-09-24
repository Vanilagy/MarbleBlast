import { ForceShape } from "./force_shape";

export class DuctFan extends ForceShape {
	dtsPath = "shapes/hazards/ductfan.dts";

	constructor() {
		super();

		this.addConicForce(10, 0.7, 40);
	}
}