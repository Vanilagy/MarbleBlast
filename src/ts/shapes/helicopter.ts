import { PowerUp } from "./power_up";
import { state } from "../state";

/** Reduces gravity temporarily. */
export class Helicopter extends PowerUp {
	dtsPath = "shapes/images/helicopter.dts";
	showSequences = false;
	shareNodeTransforms = false;
	pickUpName = (state.modification === 'gold')? "Gyrocopter PowerUp" : "Helicopter PowerUp";
	sounds = ["pugyrocoptervoice.wav", "use_gyrocopter.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {
		this.level.marble.enableHelicopter(this.level.timeState);
		this.level.deselectPowerUp();
	}
}