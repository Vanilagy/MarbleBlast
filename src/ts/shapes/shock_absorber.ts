import { PowerUp } from "./power_up";
import { TimeState } from "../level";
import { state } from "../state";

/** Temporarily reduces marble restitution. */
export class ShockAbsorber extends PowerUp {
	dtsPath = "shapes/items/shockabsorber.dts";
	pickUpName = (state.modification === 'gold')? "Shock Absorber PowerUp" : "Anti-Recoil PowerUp";
	sounds = ["pushockabsorbervoice.wav", "superbounceactive.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		this.level.marble.enableShockAbsorber(time);
		this.level.deselectPowerUp();
	}
}