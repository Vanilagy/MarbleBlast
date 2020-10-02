import { Trigger } from "./trigger";;

export class OutOfBoundsTrigger extends Trigger {
	onMarbleInside() {
		this.level.goOutOfBounds();
	}
}