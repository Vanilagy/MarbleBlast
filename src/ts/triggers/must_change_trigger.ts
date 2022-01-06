import { MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import { Trigger } from "./trigger";
import { PathedInterior } from "../pathed_interior";

/** A must-change trigger controls the path of a pathed interior. */
export class MustChangeTrigger extends Trigger {
	interior: PathedInterior;

	constructor(element: MissionElementTrigger, interior: PathedInterior) {
		super(element, interior.level);
		this.interior = interior;
	}

	onMarbleEnter() {
		let time = this.level.timeState;

		this.interior.setTargetTime(time, MisParser.parseNumber(this.element.targettime));

		if (this.element.instant === "1") {
			if (this.element.icontinuetottime && this.element.icontinuetottime !== "0") {
				// Absolutely strange, and not sure if it's even a thing in MBG, but is implement nonetheless.
				this.interior.currentTime = this.interior.targetTime;
				this.interior.targetTime = MisParser.parseNumber(this.element.icontinuetottime);
			} else {
				this.interior.changeTime = -Infinity; // "If instant is 1, the MP will warp to targetTime instantly."
			}
		}

		this.level.replay.recordMarbleEnter(this);
	}
}