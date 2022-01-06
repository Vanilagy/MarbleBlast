import { Shape } from "../shape";
import { MissionElementItem } from "../parsing/mis_parser";
import { Util } from "../util";

// List all of gem colors for randomly choosing one
const GEM_COLORS = ["blue", "red", "yellow", "purple", "green", "turquoise", "orange", "black"]; // "Platinum" is also a color, but it can't appear by chance

/** Gems need to be collected before being able to finish. */
export class Gem extends Shape {
	dtsPath = "shapes/items/gem.dts";
	ambientRotate = true;
	collideable = false;
	pickedUp = false;
	shareMaterials = false;
	showSequences = false; // Gems actually have an animation for the little shiny thing, but the actual game ignores that. I get it, it was annoying as hell.
	sounds = ['gotgem.wav', 'gotallgems.wav', 'missinggems.wav'];

	constructor(element: MissionElementItem) {
		super();

		// Determine the color of the gem:
		let color = element.datablock.slice("GemItem".length);
		if (color.length === 0) color = Gem.pickRandomColor(); // Random if no color specified

		this.matNamesOverride["base.gem"] = color.toLowerCase() + ".gem";
	}

	onMarbleInside(t: number) {
		if (this.pickedUp) return;

		this.pickedUp = true;
		this.setOpacity(0); // Hide the gem
		this.level.pickUpGem(t);
		this.level.replay.recordMarbleInside(this);

		this.setCollisionEnabled(false);
	}

	reset() {
		super.reset();

		this.pickedUp = false;
		this.setOpacity(1);
		this.setCollisionEnabled(true);
	}

	static pickRandomColor() {
		return Util.randomFromArray(GEM_COLORS);
	}
}