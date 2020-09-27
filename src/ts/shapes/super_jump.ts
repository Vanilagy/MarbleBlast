import { PowerUp } from "./power_up";
import { state } from "../state";
import { AudioManager } from "../audio";

export class SuperJump extends PowerUp {
	dtsPath = "shapes/items/superjump.dts";
	pickUpName = "Super Jump PowerUp";
	sounds = ["pusuperjumpvoice.wav", "dosuperjump.wav"];

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use() {
		let marble = state.currentLevel.marble;
		marble.body.addLinearVelocity(state.currentLevel.currentUp.scale(20));

		AudioManager.play(this.sounds[1]);
	}
}