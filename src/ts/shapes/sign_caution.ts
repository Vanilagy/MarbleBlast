import { Shape } from "../shape";
import { MissionElementStaticShape } from "../parsing/mis_parser";

export class SignCaution extends Shape {
	dtsPath = "shapes/signs/cautionsign.dts";

	constructor(element: MissionElementStaticShape) {
		super();

		let type = element.dataBlock.slice("SignCaution".length);
		switch (type) {
			case "Caution": this.matNamesOverride["base.cautionsign"] = "caution.cautionsign"; break;
			case "Danger": this.matNamesOverride["base.cautionsign"] = "danger.cautionsign"; break;
		}
	}
}