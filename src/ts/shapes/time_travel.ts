import { PowerUp } from "./power_up";
import { MissionElementItem, MisParser } from "../parsing/mis_parser";
import { AudioManager } from "../audio";
import { G } from "../global";
import { Marble } from "../marble";
import { GAME_UPDATE_RATE } from "../../../shared/constants";

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

		if (G.modification === 'gold') {
			this.pickUpName = `${this.timeBonus/1000} second Time Travel bonus`;
		} else {
			this.pickUpName = `${Math.abs(this.timeBonus/1000)} second Time ${this.timeBonus >= 0 ? 'Modifier' : 'Penalty'}`; // MBP calls them Time Penalty when they add time
		}
	}

	pickUp() {
		return true;
	}

	use(marble: Marble, t: number) {
		let timeToRevert = (1 - t) / GAME_UPDATE_RATE;

		// todo wtf is this replay shit
		//if (this.level.replay.mode === 'playback') timeToRevert = this.level.replay.timeTravelTimeToRevert.get(this.id);
		//else this.level.replay.timeTravelTimeToRevert.set(this.id, timeToRevert);

		this.game.clock.addTimeTravelBonus(this.timeBonus / 1000, timeToRevert);
		this.interactWith(this.game.clock);
	}

	useCosmetically(marble: Marble) {
		if (marble === this.game.localPlayer.controlledMarble) this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.sounds[0]);
		}, `${this.id}sound`, true);
	}
}