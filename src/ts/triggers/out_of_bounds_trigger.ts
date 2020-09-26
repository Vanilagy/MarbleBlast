import { Trigger } from "./trigger";;
import { state } from "../state";

export class OutOfBoundsTrigger extends Trigger {
	onMarbleInside() {
		state.currentLevel.goOutOfBounds();
	}
}