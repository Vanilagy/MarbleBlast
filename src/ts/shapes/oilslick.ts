import { specialFrictionFactor } from "../interior";
import { Shape } from "../shape";

/** Oilslicks are slippery. */
export class Oilslick extends Shape {
	dtsPath = "shapes/hazards/oilslick.dts";
	friction = specialFrictionFactor['friction_none'];
}