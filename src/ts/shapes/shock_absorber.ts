import { PowerUp } from "./power_up";
import { state } from "../state";
import { TimeState } from "../level";

export class ShockAbsorber extends PowerUp {
	dtsPath = "shapes/items/shockabsorber.dts";
	pickUpName = "Shock Absorber PowerUp";
	sounds = ["pushockabsorbervoice.wav", "superbounceactive.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		this.level.marble.enableShockAbsorber(time);
	}
}