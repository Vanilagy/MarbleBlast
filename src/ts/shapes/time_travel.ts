import { PowerUp } from "./power_up";
import { MissionElementItem, MisParser } from "../parsing/mis_parser";
import { PHYSICS_TICK_RATE } from "../level";
import { state } from "../state";

/** Temporarily pauses the game clock. */
export class TimeTravel extends PowerUp {
	dtsPath = "shapes/items/timetravel.dts";
	cooldownDuration = Infinity; // Won't respawn until the level is restarted
	autoUse = true;
	timeBonus = 5000;
	sounds = ["putimetravelvoice.wav", "timetravelactive.wav"];
	pickUpName = ''; // Modified on the fly based on the time bonus

	constructor(element: MissionElementItem) {
		super(element);

		if (element.timebonus) {
			this.timeBonus = MisParser.parseNumber(element.timebonus);
		}
		if (element.timepenalty) {
			this.timeBonus = -MisParser.parseNumber(element.timepenalty);
		}

		if (state.modification === 'gold') {
			this.pickUpName = `${this.timeBonus/1000} second Time Travel bonus`;
		} else {
			this.pickUpName = `${Math.abs(this.timeBonus/1000)} second Time ${this.timeBonus >= 0 ? 'Modifier' : 'Penalty'}`; // MBP calls them Time Penalty when they add time
		}
	}

	pickUp() {
		this.level.audio.play(this.sounds[0]);
		return true;
	}

	use(t: number) {
		let timeToRevert = (1 - t) * 1000 / PHYSICS_TICK_RATE;

		if (this.level.replay.mode === 'playback') timeToRevert = this.level.replay.timeTravelTimeToRevert.get(this.id);
		else this.level.replay.timeTravelTimeToRevert.set(this.id, timeToRevert);

		this.level.addTimeTravelBonus(this.timeBonus, timeToRevert);
	}
}