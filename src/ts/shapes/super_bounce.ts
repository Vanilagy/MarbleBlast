import { PowerUp } from "./power_up";
import { state } from "../state";

/** Temporarily increase marble restitution. */
export class SuperBounce extends PowerUp {
	dtsPath = "shapes/items/superbounce.dts";
	pickUpName = (state.modification === 'gold')? "Super Bounce PowerUp" : "Marble Recoil PowerUp";
	sounds = ["pusuperbouncevoice.wav", "forcefield.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {
		this.level.marble.enableSuperBounce(this.level.timeState);
		this.level.deselectPowerUp();
	}
}