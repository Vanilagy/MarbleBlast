import { PowerUp } from "./power_up";
import { state } from "../state";

export class SuperJump extends PowerUp {
	dtsPath = "shapes/items/superjump.dts";

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use() {
		let marble = state.currentLevel.marble;
		marble.body.addLinearVelocity(state.currentLevel.currentUp.scale(20));
	}
}