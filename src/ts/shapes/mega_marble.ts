import { Marble } from "../marble";
import { PowerUp } from "./power_up";

export class MegaMarble extends PowerUp {
	dtsPath = 'shapes/items/megamarble.dts';
	sounds = ["pumegamarblevoice.wav", "dosuperjump.wav", "mega_bouncehard1.wav", "mega_bouncehard2.wav", "mega_bouncehard3.wav", "mega_bouncehard4.wav", "mega_roll.wav"];
	pickUpName = "Mega Marble PowerUp";

	pickUp(marble: Marble): boolean {
		return marble.pickUpPowerUp(this);
	}

	use(marble: Marble) {
		marble.enableMegaMarble();
	}

	useCosmetically() {}
}