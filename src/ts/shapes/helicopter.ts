import { PowerUp } from "./power_up";
import { state } from "../state";

export class Helicopter extends PowerUp {
	dtsPath = "shapes/images/helicopter.dts";
	isItem = true;
	showSequences = false;
	cooldownDuration = 0;

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use(time: number) {
		state.currentLevel.marble.enableHelicopter(time);
	}
}