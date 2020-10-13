import { PowerUp } from "./power_up";
import { TimeState } from "../level";

/** Temporarily increase marble restitution. */
export class SuperBounce extends PowerUp {
	dtsPath = "shapes/items/superbounce.dts";
	pickUpName = "Super Bounce PowerUp";
	sounds = ["pusuperbouncevoice.wav", "forcefield.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		this.level.marble.enableSuperBounce(time);
		this.level.deselectPowerUp();
	}
}