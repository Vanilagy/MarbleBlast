import { PowerUp } from "./power_up";
import { Util } from "../util";
import { state } from "../state";
import { MissionElementItem } from "../parsing/mis_parser";
import { Vector3 } from "../math/vector3";

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

	pickUp() {
		let direction = new Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation).normalize();
		return !Util.isSameVector(direction, this.level.currentUp);
	}

	use() {
		// Determine the new up vector
		let direction = new Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation);

		this.level.setUp(direction);
		this.level.audio.play(this.sounds[0]);
	}
}