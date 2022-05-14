import { Trigger } from "./trigger";
import { G } from "../global";
import { Marble } from "../marble";

/** A help trigger displays an info message when the player touches one. */
export class HelpTrigger extends Trigger {
	sounds = ['infotutorial.wav'];

	onMarbleEnter(marble: Marble) {
		G.menu.hud.displayHelp(() => {
			if (this.game.localPlayer !== marble.controllingPlayer) return null;
			return this.element.text;
		}, this.game.state.frame);
	}
}