import { Shape } from "../shape";
import { MissionElementStaticShape } from "../parsing/mis_parser";

/** A plain sign showing a direction. */
export class SignPlain extends Shape {
	dtsPath = "shapes/signs/plainsign.dts";
	shareMaterials = false;

	constructor(element: MissionElementStaticShape) {
		super();

		// Determine the direction to show
		let direction = element.dataBlock.slice("SignPlain".length);
		switch (direction) {
			case "Right": this.matNamesOverride["base.plainsign"] = "right.plainsign"; break;
			case "Left": this.matNamesOverride["base.plainsign"] = "left.plainsign"; break;
			case "Up": this.matNamesOverride["base.plainsign"] = "up.plainsign"; break;
			case "Down": this.matNamesOverride["base.plainsign"] = "down.plainsign"; break;
		}
	}
}