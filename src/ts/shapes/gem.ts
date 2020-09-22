import { Shape } from "../shape";
import { MissionElementItem } from "../parsing/mis_parser";
import { Util } from "../util";

const GEM_COLORS = ["blue", "red", "yellow", "purple", "green", "turquoise", "orange", "black"];

export class Gem extends Shape {
	dtsPath = "shapes/items/gem.dts";
	isItem = true;

	constructor(element: MissionElementItem) {
		super();

		let color = element.dataBlock.slice("GemItem".length);
		if (color.length === 0) color = Util.randomFromArray(GEM_COLORS);

		this.matNamesOverride["base.gem"] = color + ".gem";
	}
}