import { MissionElementTrigger } from "../parsing/mis_parser";
import { Trigger } from "./trigger";
import { PathedInterior } from "../pathed_interior";
import { TimeState } from "../level";

/** A must-change trigger controls the path of a pathed interior. */
export class MustChangeTrigger extends Trigger {
	interior: PathedInterior;

	constructor(element: MissionElementTrigger, interior: PathedInterior) {
		super(element, interior.level);
		this.interior = interior;
	}

	onMarbleEnter(time: TimeState) {
		this.interior.setDestinationTime(time, Number(this.element.targettime));
		this.level.replay.recordMarbleEnter(this);
	}
}