import { PowerUp } from "./power_up";

export class MegaMarble extends PowerUp {
	dtsPath = 'shapes/items/megamarble.dts';

	pickUp(): boolean {
		return this.level.pickUpPowerUp(this);
	}

	use() {

	}
}