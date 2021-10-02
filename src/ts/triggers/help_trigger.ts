import { Trigger } from "./trigger";
import { AudioManager } from "../audio";
import { state } from "../state";

/** A help trigger displays an info message when the player touches one. */
export class HelpTrigger extends Trigger {
	onMarbleEnter() {
		AudioManager.play('infotutorial.wav');
		state.menu.hud.displayHelp(this.element.text);
		this.level.replay.recordMarbleEnter(this);
	}
}