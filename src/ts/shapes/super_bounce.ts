import { PowerUp } from "./power_up";
import { state } from "../state";
import { TimeState } from "../level";

export class SuperBounce extends PowerUp {
	dtsPath = "shapes/items/superbounce.dts";
	pickUpName = "Super Bounce PowerUp";
	sounds = ["pusuperbouncevoice.wav", "forcefield.wav"];

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		state.currentLevel.marble.enableSuperBounce(time);
	}
}