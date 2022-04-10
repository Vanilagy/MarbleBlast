import { PowerUp } from "./power_up";
import { state } from "../state";
import { Marble } from "../marble";

/** Reduces gravity temporarily. */
export class Helicopter extends PowerUp {
	dtsPath = "shapes/images/helicopter.dts";
	showSequences = false;
	shareNodeTransforms = false;
	pickUpName = (state.modification === 'gold')? "Gyrocopter PowerUp" : "Helicopter PowerUp";
	sounds = ["pugyrocoptervoice.wav", "use_gyrocopter.wav"];

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		marble.enableHelicopter();
	}

	useCosmetically() {}
}