import { PowerUp } from "./power_up";
import { state } from "../state";
import { TimeState } from "../level";

export class Helicopter extends PowerUp {
	dtsPath = "shapes/images/helicopter.dts";
	showSequences = false;
	pickUpName = "Gyrocopter PowerUp";

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		state.currentLevel.marble.enableHelicopter(time);
	}
}