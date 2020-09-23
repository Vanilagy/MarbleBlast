import { PowerUp } from "./power_up";
import { state } from "../state";

export class ShockAbsorber extends PowerUp {
	dtsPath = "shapes/items/shockabsorber.dts";
	isItem = true;

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use(time: number) {
		state.currentLevel.marble.enableShockAbsorber(time);
	}
}