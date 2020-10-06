import { PowerUp } from "./power_up";
import { state } from "../state";
import { TimeState } from "../level";

export class Helicopter extends PowerUp {
	dtsPath = "shapes/images/helicopter.dts";
	showSequences = false;
	shareNodeTransforms = false;
	pickUpName = "Gyrocopter PowerUp";
	sounds = ["pugyrocoptervoice.wav", "use_gyrocopter.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		this.level.marble.enableHelicopter(time);
	}
}