import { AudioManager } from "../audio";
import { PowerUp } from "./power_up";

export class EasterEgg extends PowerUp {
	dtsPath = "shapes/items/easteregg.dts";
	cooldownDuration = Infinity; // Won't respawn until the level is restarted
	autoUse = true;
	sounds = ["easter.wav", "easterfound.wav"];

	pickUp() {
		let alreadyFound = false;
		AudioManager.play(this.sounds[Number(alreadyFound)]); // Holy shit this cast is nasty
		this.customPickUpAlert = alreadyFound? "You already found this Easter Egg." : "You found an Easter Egg!";

		return true;
	}

	use() {}
}