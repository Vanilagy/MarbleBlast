import { Marble } from "../marble";
import { Trigger } from "./trigger";

/** An out-of-bounds trigger causes OOB if the marble enters it. */
export class OutOfBoundsTrigger extends Trigger {
	onMarbleEnter(marble: Marble) {
		marble.goOutOfBounds();
	}
}