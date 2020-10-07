import { Shape } from "../shape";

/** Oilslicks are slippery. */
export class Oilslick extends Shape {
	dtsPath = "shapes/hazards/oilslick.dts";
	friction = 0.001;
	useInstancing = true;
}