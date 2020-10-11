import { PowerUp } from "./power_up";
import { MissionElementItem } from "../parsing/mis_parser";
import { AudioManager } from "../audio";

/** Temporarily pauses the game clock. */
export class TimeTravel extends PowerUp {
	dtsPath = "shapes/items/timetravel.dts";
	cooldownDuration = Infinity; // Won't respawn until the level is restarted
	autoUse = true;
	timeBonus = 5000;
	sounds = ["putimetravelvoice.wav", "timetravelactive.wav"];

	constructor(element: MissionElementItem) {
		super();

		if (element.timebonus) {
			this.timeBonus = Number(element.timebonus);
		}

		this.pickUpName = `${this.timeBonus/1000} second Time Travel bonus`;
	}

	pickUp() {
		AudioManager.play(this.sounds[0]);
		return true;
	}

	use() {
		this.level.addTimeTravelBonus(this.timeBonus);
	}
}