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

/** A caution/danger sign. */
export class SignCaution extends Shape {
	dtsPath = "shapes/signs/cautionsign.dts";
	shareMaterials = false;

	constructor(element: MissionElementStaticShape) {
		super();

		// Determine the type of the sign
		let type = element.datablock.slice("SignCaution".length).toLowerCase();
		switch (type) {
			case "caution": this.matNamesOverride["base.cautionsign"] = "caution.cautionsign"; break;
			case "danger": this.matNamesOverride["base.cautionsign"] = "danger.cautionsign"; break;
		}
	}
}

/** The flickering finish sign, usually above the finish pad. */
export class SignFinish extends Shape {
	dtsPath = "shapes/signs/finishlinesign.dts";
}

/** A plain sign showing a direction, used in Marble Blast Gold. */
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