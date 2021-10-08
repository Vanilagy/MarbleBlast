import { AudioManager } from "../audio";
import { state } from "../state";
import { StorageManager } from "../storage";
import { PowerUp } from "./power_up";

export class EasterEgg extends PowerUp {
	dtsPath = "shapes/items/easteregg.dts";
	cooldownDuration = Infinity; // Won't respawn until the level is restarted
	autoUse = true;
	sounds = ["easter.wav", "easterfound.wav"];

	pickUp() {
		let alreadyFound = StorageManager.data.collectedEggs.includes(this.level.mission.path);
		if (!alreadyFound) {
			StorageManager.data.collectedEggs.push(this.level.mission.path);
			StorageManager.store();
			state.menu.levelSelect.displayMission(); // To refresh the icon
		}

		AudioManager.play(this.sounds[Number(alreadyFound)]); // Holy shit this cast is nasty
		this.customPickUpAlert = alreadyFound? "You already found this Easter Egg." : "You found an Easter Egg!";

		return true;
	}

	use() {}
}