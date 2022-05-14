import { Marble } from "../marble";
import { PowerUp } from "./power_up";

export class Blast extends PowerUp {
	dtsPath = 'shapes/items/blast.dts';
	autoUse = true;
	sounds = ["publastvoice.wav"];
	pickUpName = "Blast PowerUp";

	pickUp() {
		return true;
	}

	use(marble: Marble) {
		marble.blastAmount = 1.03;
	}

	useCosmetically() {}
}