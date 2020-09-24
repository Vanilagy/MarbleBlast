import { ForceShape } from "./force_shape";
import OIMO from "../declarations/oimo";

export class Tornado extends ForceShape {
	dtsPath = "shapes/hazards/tornado.dts";
	collideable = false;

	constructor() {
		super();

		this.addSphericalForce(8, -60);
		this.addSphericalForce(3, 60);
		this.addFieldForce(3, new OIMO.Vec3(0, 0, 150));
	}
}