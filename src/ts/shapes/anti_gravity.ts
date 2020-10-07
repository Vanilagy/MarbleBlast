import { PowerUp } from "./power_up";
import * as THREE from "three";
import { Util } from "../util";
import { TimeState } from "../level";
import { AudioManager } from "../audio";

/** Changes the gravity on pickup. */
export class AntiGravity extends PowerUp {
	dtsPath = "shapes/items/antigravity.dts";
	autoUse = true;
	pickUpName = "Gravity Modifier";
	sounds = ["gravitychange.wav"];

	pickUp() {return true;}

	use(time: TimeState) {
		// Determine the new up vector
		let direction = new THREE.Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation);

		if (Util.isSameVector(direction, this.level.currentUp)) return;

		this.level.setUp(Util.vecThreeToOimo(direction), time);
		AudioManager.play(this.sounds[0]);
	}
}