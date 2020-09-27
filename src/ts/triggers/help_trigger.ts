import { Trigger } from "./trigger";
import { displayHelp } from "../ui/game";
import { AudioManager } from "../audio";

export class HelpTrigger extends Trigger {
	onMarbleEnter() {
		AudioManager.play('infotutorial.wav');
		displayHelp(this.element.text);
	}
}