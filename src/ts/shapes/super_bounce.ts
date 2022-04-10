import { PowerUp } from "./power_up";
import { state } from "../state";
import { Marble } from "../marble";

/** Temporarily increase marble restitution. */
export class SuperBounce extends PowerUp {
	dtsPath = "shapes/items/superbounce.dts";
	pickUpName = (state.modification === 'gold')? "Super Bounce PowerUp" : "Marble Recoil PowerUp";
	sounds = ["pusuperbouncevoice.wav", "forcefield.wav"];

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		marble.enableSuperBounce();
	}

	useCosmetically() {}
}