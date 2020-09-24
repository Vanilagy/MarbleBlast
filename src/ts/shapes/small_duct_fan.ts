import { ForceShape } from "./force_shape";

export class SmallDuctFan extends ForceShape {
	dtsPath = "shapes/hazards/ductfan.dts";

	constructor() {
		super();

		this.addConicForce(5, 0.7, 10);
	}
}