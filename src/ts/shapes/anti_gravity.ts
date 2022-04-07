import { PowerUp } from "./power_up";
import { AudioManager } from "../audio";
import { state } from "../state";
import { MissionElementItem } from "../parsing/mis_parser";
import { Vector3 } from "../math/vector3";
import { Marble } from "../marble";

/** Changes the gravity on pickup. */
export class AntiGravity extends PowerUp {
	dtsPath = "shapes/items/antigravity.dts";
	autoUse = true;
	pickUpName = (state.modification === 'gold')? "Gravity Modifier" : "Gravity Defier";
	sounds = ["gravitychange.wav"];

	constructor(element: MissionElementItem, respawnInstantly = false) {
		super(element);

		if (respawnInstantly) this.cooldownDuration = -Infinity;
	}

	pickUp(marble: Marble) {
		let direction = new Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation).normalize();
		return !direction.equals(marble.currentUp);
	}

	use(marble: Marble) {
		// Determine the new up vector
		let direction = new Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation);

		marble.setUp(direction);
		AudioManager.play(this.sounds[0]);
	}
}