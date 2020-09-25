import { PowerUp } from "./power_up";
import * as THREE from "three";
import { state } from "../state";
import { Util } from "../util";
import { TimeState } from "../level";

export class AntiGravity extends PowerUp {
	dtsPath = "shapes/items/antigravity.dts";
	autoUse = true;

	pickUp() {return true;}

	use(time: TimeState) {
		let direction = new THREE.Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation);

		if (Util.isSameVector(direction, state.currentLevel.currentUp)) return;

		state.currentLevel.setUp(Util.vecThreeToOimo(direction), time);
	}
}