import { Shape } from "../shape";
import { Util } from "../../util";
import { EntityState } from "../../../../shared/game_server_format";
import { Marble } from "../marble";
import { Collision } from "../../physics/collision";

const RESET_TIME = 5;

type PushButtonState = EntityState & { entityType: 'pushButton' };

/** A simple shape representing a button that is pushed down when the shape is touched. */
export class PushButton extends Shape {
	dtsPath = 'shapes/buttons/pushbutton.dts';
	lastContactTime = -Infinity;
	shareNodeTransforms = false;

	get animationDuration() {
		return this.dts.sequences[0].duration;
	}

	update(onlyVisual?: boolean) {
		let currentCompletion = this.getCurrentCompletion();

		// Override the keyframe
		this.sequenceKeyframeOverride.set(this.dts.sequences[0], currentCompletion * (this.dts.sequences[0].numKeyframes - 1));
		super.update(onlyVisual);
	}

	/** Gets the current completion of the button pressedness. 0 = not pressed, 1 = completely pressed down. */
	getCurrentCompletion() {
		let elapsed = this.game.state.time - this.lastContactTime;
		let completion = Util.clamp(elapsed / this.animationDuration, 0, 1);
		if (elapsed > RESET_TIME) completion = Util.clamp(1 - (elapsed - RESET_TIME) / this.animationDuration, 0, 1);

		return completion;
	}

	onMarbleContact(collision: Collision, marble: Marble) {
		let currentCompletion = this.getCurrentCompletion();
		// Only trigger the button if it's completely retracted
		if (currentCompletion === 0) {
			this.lastContactTime = this.game.state.time;
			this.stateNeedsStore = true;
			marble.affect(this);
		}
	}

	getState(): PushButtonState {
		return {
			entityType: 'pushButton',
			lastContactTime: this.lastContactTime
		};
	}

	getInitialState(): PushButtonState {
		return {
			entityType: 'pushButton',
			lastContactTime: -1
		};
	}

	loadState(state: PushButtonState) {
		this.lastContactTime = state.lastContactTime;
	}
}