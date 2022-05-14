import { PowerUp } from "./power_up";
import { AudioManager } from "../../audio";
import { G } from "../../global";
import { MissionElementItem } from "../../../../shared/mis_parser";
import { Vector3 } from "../../math/vector3";
import { Marble } from "../marble";

/** Changes the gravity on pickup. */
export class AntiGravity extends PowerUp {
	dtsPath = "shapes/items/antigravity.dts";
	autoUse = true;
	pickUpName = (G.modification === 'gold')? "Gravity Modifier" : "Gravity Defier";
	sounds = ["gravitychange.wav"];

	constructor(element: MissionElementItem, respawnInstantly = false) {
		super(element);

		if (respawnInstantly) this.cooldownDuration = -Infinity;
	}

	pickUp(marble: Marble) {
		let direction = new Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation).normalize();
		return !direction.fequals(marble.currentUp);
	}

	use(marble: Marble) {
		// Determine the new up vector
		let direction = new Vector3(0, 0, -1);
		direction.applyQuaternion(this.worldOrientation);

		marble.setUp(direction);
		AudioManager.play(this.sounds[0]);
	}

	useCosmetically(marble: Marble): void {
		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.sounds[0]);
		}, `${this.id} ${marble.id}useCosmetic`, true);
	}
}