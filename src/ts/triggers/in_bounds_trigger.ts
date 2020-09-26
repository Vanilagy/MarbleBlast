import { Trigger } from "./trigger";
import { state } from "../state";

export class InBoundsTrigger extends Trigger {
	onMarbleLeave() {
		state.currentLevel.goOutOfBounds();
	}
}