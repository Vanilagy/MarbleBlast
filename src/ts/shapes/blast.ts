import { PowerUp } from "./power_up";

export class Blast extends PowerUp {
	dtsPath = 'shapes/items/blast.dts';
	autoUse = true;
	sounds = ["publastvoice.wav"];
	pickUpName = "Blast PowerUp";

	pickUp() {
		this.level.audio.play(this.sounds[0]);
		return true;
	}

	use() {
		this.level.blastAmount = 1.03;
	}
}