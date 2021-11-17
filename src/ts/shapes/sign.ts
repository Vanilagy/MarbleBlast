import { MissionElementStaticShape } from "../parsing/mis_parser";
import { Shape } from "../shape";

/** Sign used in MBP to show a direction. */
export class Sign extends Shape {
	dtsPath = "shapes/signs/sign.dts";

	constructor(element: MissionElementStaticShape) {
		super();

		if (element.datablock.toLowerCase() !== 'arrow') {
			// Determine the direction to show
			let direction = element.datablock.slice("Sign".length).toLowerCase();
			switch (direction) {
				case "": this.dtsPath = "shapes/signs/sign.dts"; break;
				case "down": this.dtsPath = "shapes/signs/signdown.dts"; break;
				case "up": this.dtsPath = "shapes/signs/signup.dts"; break;
				case "side": this.dtsPath = "shapes/signs/signside.dts"; break;
				case "downside": this.dtsPath = "shapes/signs/signdown-side.dts"; break;
				case "upside": this.dtsPath = "shapes/signs/signup-side.dts"; break;
			}
		}
	}
}