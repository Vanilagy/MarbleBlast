import { PowerUp } from "./power_up";
import { state } from "../state";

/** Temporarily reduces marble restitution. */
export class ShockAbsorber extends PowerUp {
	dtsPath = "shapes/items/shockabsorber.dts";
	pickUpName = (state.modification === 'gold')? "Shock Absorber PowerUp" : "Anti-Recoil PowerUp";
	an = state.modification !== 'gold';
	sounds = ["pushockabsorbervoice.wav", "superbounceactive.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {
		this.level.marble.enableShockAbsorber(this.level.timeState);
		this.level.deselectPowerUp();
	}
}