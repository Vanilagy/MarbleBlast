import { Shape } from "../shape";
import { MissionElementItem } from "../parsing/mis_parser";
import { Util } from "../util";

// List all of gem colors for randomly choosing one
const GEM_COLORS = ["blue", "red", "yellow", "purple", "green", "turquoise", "orange", "black"];

/** Gems need to be collected before being able to finish. */
export class Gem extends Shape {
	dtsPath = "shapes/items/gem.dts";
	ambientRotate = true;
	collideable = false;
	pickedUp = false;
	shareMaterials = false;
	sounds = ['gotgem.wav', 'gotallgems.wav', 'missinggems.wav'];

	constructor(element: MissionElementItem) {
		super();

		// Determine the color of the gem:
		let color = element.datablock.slice("GemItem".length);
		if (color.length === 0) color = Util.randomFromArray(GEM_COLORS); // Random if no color specified

		this.matNamesOverride["base.gem"] = color + ".gem";
	}

	onMarbleInside() {
		if (this.pickedUp) return;

		this.pickedUp = true;
		this.setOpacity(0); // Hide the gem
		this.level.pickUpGem();
	}

	reset() {
		this.pickedUp = false;
		this.setOpacity(1);
	}
}