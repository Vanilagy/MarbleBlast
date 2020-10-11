import { Shape } from "../shape";
import { MissionElementStaticShape } from "../parsing/mis_parser";

/** A caution/danger sign. */
export class SignCaution extends Shape {
	dtsPath = "shapes/signs/cautionsign.dts";
	shareMaterials = false;

	constructor(element: MissionElementStaticShape) {
		super();

		// Determine the type of the sign
		let type = element.datablock.slice("SignCaution".length);
		switch (type) {
			case "Caution": this.matNamesOverride["base.cautionsign"] = "caution.cautionsign"; break;
			case "Danger": this.matNamesOverride["base.cautionsign"] = "danger.cautionsign"; break;
		}
	}
}