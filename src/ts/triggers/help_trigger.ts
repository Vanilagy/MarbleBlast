import { Trigger } from "./trigger";
import { displayHelp } from "../ui/game";

export class HelpTrigger extends Trigger {
	onMarbleEnter() {
		displayHelp(this.element.text);
	}
}