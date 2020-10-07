import { Trigger } from "./trigger";
import { displayHelp } from "../ui/game";
import { AudioManager } from "../audio";

/** A help trigger displays an info message when the player touches one. */
export class HelpTrigger extends Trigger {
	onMarbleEnter() {
		AudioManager.play('infotutorial.wav');
		displayHelp(this.element.text);
	}
}