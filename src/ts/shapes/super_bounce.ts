import { PowerUp } from "./power_up";
import { state } from "../state";

export class SuperBounce extends PowerUp {
	dtsPath = "shapes/items/superbounce.dts";
	isItem = true;

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use(time: number) {
		state.currentLevel.marble.enableSuperBounce(time);
	}
}