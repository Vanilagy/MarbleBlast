import { Marble, MarbleControlState } from "../marble";
import { Vector2 } from "../math/vector2";

export const DEFAULT_PITCH = 0.45;

export abstract class MarbleController {
	marble: Marble;

	constructor(marble: Marble) {
		this.marble = marble;
	}

	abstract applyControlState(): void;

	reset() {}

	static getPassiveControlState(): MarbleControlState {
		return {
			movement: new Vector2(),
			yaw: 0,
			pitch: DEFAULT_PITCH,
			jumping: false,
			using: false,
			blasting: false
		};
	}
}