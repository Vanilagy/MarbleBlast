import { AudioManager } from "../audio";
import { TimeState } from "../level";
import { PowerUp } from "./power_up";

export class MegaMarble extends PowerUp {
	dtsPath = 'shapes/items/megamarble.dts';
	sounds = ["pumegamarblevoice.wav", "dosuperjump.wav", "mega_bouncehard1.wav", "mega_bouncehard2.wav", "mega_bouncehard3.wav", "mega_bouncehard4.wav", "mega_roll.wav"];

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use(time: TimeState) {
		this.level.marble.enableMegaMarble(time);
		this.level.deselectPowerUp();
		AudioManager.play(this.sounds[1]);
	}
}