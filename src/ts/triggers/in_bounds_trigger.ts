import { Trigger } from "./trigger";

/** An in-bounds trigger causes OOB on marble exit. */
export class InBoundsTrigger extends Trigger {
	onMarbleLeave() {
		this.level.goOutOfBounds();
		this.level.replay.recordMarbleLeave(this);
	}
}