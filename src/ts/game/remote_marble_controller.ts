import { MarbleControlState } from "../marble";
import { Vector2 } from "../math/vector2";
import { Util } from "../util";
import { MarbleController } from "./marble_controller";
import { MultiplayerGame } from "./multiplayer_game";

export class RemoteMarbleController extends MarbleController {
	prevState: MarbleControlState = MarbleController.getPassiveControlState();
	remoteState: MarbleControlState = null;
	remoteTick: number = null;
	lastMovement = new Vector2();

	setRemoteControlState(state: MarbleControlState) {
		if (this.remoteState) {
			this.prevState = this.remoteState;

			this.lastMovement.copy(this.lerpMovement());
		}

		this.remoteState = state;
		this.remoteTick = this.marble.game.state.tick;
	}

	lerpMovement() {
		let reconciliationTicks = (this.marble.game as MultiplayerGame).simulator.lastReconciliationTickCount;
		reconciliationTicks *= 2; // Feels better
		let completion = Util.clamp((this.marble.game.state.tick - this.remoteTick) / reconciliationTicks, 0, 1);

		return this.lastMovement.clone().lerp(this.remoteState.movement, completion);
	}

	applyControlState() {
		if (!this.remoteState) return;
		if (this.remoteTick > this.marble.game.state.tick) return;

		let reconciliationTicks = (this.marble.game as MultiplayerGame).simulator.lastReconciliationTickCount;
		if (this.marble.game.state.tick > this.remoteTick + 2 * reconciliationTicks) {
			// We're too far ahead of the last input update; from now on, assume no input at all.
			return MarbleController.getPassiveControlState();
		}

		let movement = this.lerpMovement();

		let state: MarbleControlState = {
			movement,
			yaw: this.remoteState.yaw,
			pitch: this.remoteState.pitch,
			jumping: this.remoteState.jumping,
			using: this.remoteState.using,
			blasting: this.remoteState.blasting
		};

		this.marble.currentControlState = state;
	}
}