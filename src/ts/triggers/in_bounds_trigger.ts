import { Trigger } from "./trigger";

export class InBoundsTrigger extends Trigger {
	onMarbleLeave() {
		this.level.goOutOfBounds();
	}
}