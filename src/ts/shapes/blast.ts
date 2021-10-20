import { PowerUp } from "./power_up";

export class Blast extends PowerUp {
	dtsPath = 'shapes/items/blast.dts';
	autoUse = true;

	pickUp() {
		return true;
	}

	use() {
		console.log("There ya go");
	}
}