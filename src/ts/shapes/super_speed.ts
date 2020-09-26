import { PowerUp } from "./power_up";
import { state } from "../state";
import * as THREE from "three";
import { Util } from "../util";
import OIMO from "../declarations/oimo";

export class SuperSpeed extends PowerUp {
	dtsPath = "shapes/items/superspeed.dts";
	pickUpName = "Super Speed PowerUp";

	pickUp(): boolean {
		return state.currentLevel.pickUpPowerUp(this);
	}

	use() {
		let level = state.currentLevel;
		let marble = state.currentLevel.marble;
		let movementVector = new THREE.Vector3(1, 0, 0);
		movementVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), level.yaw);

		let quat = level.newOrientationQuat;
		movementVector.applyQuaternion(quat);

		let quat2 = new OIMO.Quat();
		quat2.setArc(state.currentLevel.currentUp, marble.lastContactNormal);
		movementVector.applyQuaternion(new THREE.Quaternion(quat2.x, quat2.y, quat2.z, quat2.w));
		
		marble.body.addLinearVelocity(Util.vecThreeToOimo(movementVector).scale(24.7)); // Whirlgig's determined value
	}
}