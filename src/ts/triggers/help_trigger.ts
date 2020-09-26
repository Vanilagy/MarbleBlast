import { Trigger } from "./trigger";
import { TimeState } from "../level";
import { displayHelp } from "../ui/game";

export class HelpTrigger extends Trigger {
	onMarbleEnter(time: TimeState) {
		displayHelp(this.element.text);
	}
}