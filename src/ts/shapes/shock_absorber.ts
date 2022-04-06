import { PowerUp } from "./power_up";
import { state } from "../state";
import { Marble } from "../marble";

/** Temporarily reduces marble restitution. */
export class ShockAbsorber extends PowerUp {
	dtsPath = "shapes/items/shockabsorber.dts";
	pickUpName = (state.modification === 'gold')? "Shock Absorber PowerUp" : "Anti-Recoil PowerUp";
	an = state.modification !== 'gold';
	sounds = ["pushockabsorbervoice.wav", "superbounceactive.wav"];

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		marble.enableShockAbsorber();
		marble.unequipPowerUp();
	}
}