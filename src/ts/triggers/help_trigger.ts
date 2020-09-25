import { Trigger } from "./trigger";
import { TimeState } from "../level";

export class HelpTrigger extends Trigger {
	onMarbleEnter(time: TimeState) {
		console.log(this.element.text);
	}
}