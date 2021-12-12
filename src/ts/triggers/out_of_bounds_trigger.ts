import { Trigger } from "./trigger";

/** An out-of-bounds trigger causes OOB if the marble enters it. */
export class OutOfBoundsTrigger extends Trigger {
	onMarbleInside() {
		this.level.goOutOfBounds();
		this.level.replay.recordMarbleInside(this);
	}
}