import { PowerUp } from "./power_up";
import { G } from "../global";
import { Marble } from "../marble";

/** Temporarily reduces marble restitution. */
export class ShockAbsorber extends PowerUp {
	dtsPath = "shapes/items/shockabsorber.dts";
	pickUpName = (G.modification === 'gold')? "Shock Absorber PowerUp" : "Anti-Recoil PowerUp";
	an = G.modification !== 'gold';
	sounds = ["pushockabsorbervoice.wav", "superbounceactive.wav"];

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		marble.enableShockAbsorber();
	}

	useCosmetically() {}
}