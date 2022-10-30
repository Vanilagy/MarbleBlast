import { PowerUp } from "./power_up";

export class MegaMarble extends PowerUp {
	dtsPath = 'shapes/items/megamarble.dts';
	sounds = ["pumegamarblevoice.wav", "dosuperjump.wav", "mega_bouncehard1.wav", "mega_bouncehard2.wav", "mega_bouncehard3.wav", "mega_bouncehard4.wav", "mega_roll.wav"];
	pickUpName = "Mega Marble PowerUp";

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {
		this.level.marble.enableMegaMarble(this.level.timeState);
		this.level.deselectPowerUp();
		this.level.audio.play(this.sounds[1]);
	}
}