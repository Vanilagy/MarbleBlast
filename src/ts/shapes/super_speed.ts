import { PowerUp } from "./power_up";
import { state } from "../state";
import * as THREE from "three";
import { Util } from "../util";

export class SuperSpeed extends PowerUp {
	dtsPath = "shapes/items/superspeed.dts";
	isItem = true;

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use() {
		let level = state.currentLevel;
		let movementVector = new THREE.Vector3(1, 0, 0);
		movementVector.applyAxisAngle(Util.vecOimoToThree(level.currentUp), level.yaw);

		let marble = state.currentLevel.marble;
		let currentUpwardsMotion = marble.body.getLinearVelocity().dot(level.currentUp);
		marble.body.addLinearVelocity(Util.vecThreeToOimo(movementVector).scale(25));
		marble.body.addLinearVelocity(level.currentUp.scale(currentUpwardsMotion * 2));
	}
}