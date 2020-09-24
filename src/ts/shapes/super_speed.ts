import { PowerUp } from "./power_up";
import { state } from "../state";
import * as THREE from "three";
import { Util } from "../util";

export class SuperSpeed extends PowerUp {
	dtsPath = "shapes/items/superspeed.dts";

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use() {
		let level = state.currentLevel;
		let movementVector = new THREE.Vector3(1, 0, 0);
		movementVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), level.yaw);

		let quat = level.newOrientationQuat;
		movementVector.applyQuaternion(quat);

		let marble = state.currentLevel.marble;
		let currentUpwardsMotion = marble.body.getLinearVelocity().dot(level.currentUp);
		marble.body.addLinearVelocity(Util.vecThreeToOimo(movementVector).scale(25));
		marble.body.addLinearVelocity(level.currentUp.scale(currentUpwardsMotion * 2));
	}
}