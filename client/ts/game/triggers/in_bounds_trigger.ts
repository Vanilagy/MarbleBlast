import { Marble } from "../marble";
import { Trigger } from "../trigger";

/** An in-bounds trigger causes OOB on marble exit. */
export class InBoundsTrigger extends Trigger {
	onMarbleLeave(marble: Marble) {
		marble.goOutOfBounds();
	}
}