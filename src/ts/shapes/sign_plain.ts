import { Shape } from "../shape";
import { MissionElementStaticShape } from "../parsing/mis_parser";

/** A plain sign showing a direction. */
export class SignPlain extends Shape {
	dtsPath = "shapes/signs/plainsign.dts";
	shareMaterials = false;

	constructor(element: MissionElementStaticShape) {
		super();

		// Determine the direction to show
		let direction = element.datablock.slice("SignPlain".length).toLowerCase();
		switch (direction) {
			case "right": this.matNamesOverride["base.plainsign"] = "right.plainsign"; break;
			case "left": this.matNamesOverride["base.plainsign"] = "left.plainsign"; break;
			case "up": this.matNamesOverride["base.plainsign"] = "up.plainsign"; break;
			case "down": this.matNamesOverride["base.plainsign"] = "down.plainsign"; break;
		}
	}
}