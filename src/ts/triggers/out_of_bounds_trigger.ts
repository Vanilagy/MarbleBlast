import { Trigger } from "./trigger";
import { TimeState } from "../level";

export class OutOfBoundsTrigger extends Trigger {
	onMarbleInside(time: TimeState) {}
}