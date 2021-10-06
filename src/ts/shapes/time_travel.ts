import { PowerUp } from "./power_up";
import { MissionElementItem, MisParser } from "../parsing/mis_parser";
import { AudioManager } from "../audio";
import { PHYSICS_TICK_RATE, TimeState } from "../level";
import { state } from "../state";
import OIMO from "../declarations/oimo";

/** Temporarily pauses the game clock. */
export class TimeTravel extends PowerUp {
	dtsPath = "shapes/items/timetravel.dts";
	cooldownDuration = Infinity; // Won't respawn until the level is restarted
	autoUse = true;
	timeBonus = 5000;
	sounds = ["putimetravelvoice.wav", "timetravelactive.wav"];

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
			this.pickUpName = `${Math.abs(this.timeBonus/1000)} second Time ${this.timeBonus > 0 ? 'Modifier' : 'Penalty'}`;
		}
	}

	pickUp() {
		AudioManager.play(this.sounds[0]);
		return true;
	}

	use(time: TimeState, bodyOverride?: OIMO.RigidBody) {
		let completionOfImpact = this.level.physics.computeCompletionOfImpactWithBody(bodyOverride ?? this.bodies[0], 2);
		let timeToRevert = (1 - completionOfImpact) * 1000 / PHYSICS_TICK_RATE;

		if (this.level.replay.mode === 'playback') timeToRevert = this.level.replay.timeTravelTimeToRevert.get(this.id);
		else this.level.replay.timeTravelTimeToRevert.set(this.id, timeToRevert);

		this.level.addTimeTravelBonus(this.timeBonus, timeToRevert);
	}
}