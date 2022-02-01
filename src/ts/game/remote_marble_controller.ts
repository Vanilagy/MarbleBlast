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
		let ticks = (this.marble.game as MultiplayerGame).simulator.lastReconciliationTickCount;
		ticks *= 2; // Feels better
		let completion = Util.clamp((this.marble.game.state.tick - this.remoteTick) / ticks, 0, 1);

		return this.lastMovement.clone().lerp(this.remoteState.movement, completion);
	}

	applyControlState() {
		if (!this.remoteState) return;
		if (this.remoteTick > this.marble.game.state.tick) return;

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