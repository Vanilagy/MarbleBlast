import { MissionElementTrigger } from "../parsing/mis_parser";
import { Trigger } from "./trigger";
import { PathedInterior } from "../pathed_interior";
import { TimeState } from "../level";

export class MustChangeTrigger extends Trigger {
	interior: PathedInterior;
	element: MissionElementTrigger;

	constructor(element: MissionElementTrigger, interior: PathedInterior) {
		super(element);

		this.interior = interior;
		this.element = element;
	}

	onMarbleEnter(time: TimeState) {
		this.interior.setDestinationTime(time, Number(this.element.targetTime));
	}
}