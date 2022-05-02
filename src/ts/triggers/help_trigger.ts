import { Trigger } from "./trigger";
import { G } from "../global";
import { Marble } from "../marble";
import { EntityState } from "../../../shared/game_server_format";

type HelpTriggerState = EntityState & { entityType: 'helpTrigger' };

/** A help trigger displays an info message when the player touches one. */
export class HelpTrigger extends Trigger {
	sounds = ['infotutorial.wav'];

	entered: number[] = [];
	enteredFrame = 0;

	onMarbleEnter(marble: Marble) {
		let frame = this.game.state.frame;

		if (this.enteredFrame === frame) {
			this.entered.push(marble.id);
		} else {
			this.enteredFrame = frame;
			this.entered = [marble.id];
		}

		G.menu.hud.displayHelp(() => {
			if (this.game.localPlayer !== marble.controllingPlayer) return null;
			return this.element.text;
		}, frame);

		marble.interactWith(this);
		this.stateNeedsStore = true;
	}

	getState(): HelpTriggerState {
		return {
			entityType: 'helpTrigger',
			entered: this.entered.slice(),
			enteredFrame: this.enteredFrame
		};
	}

	getInitialState(): HelpTriggerState {
		return {
			entityType: 'helpTrigger',
			entered: [],
			enteredFrame: 0
		};
	}

	loadState(_state: HelpTriggerState) {
		G.menu.hud.displayHelp(() => {
			if (!_state.entered.includes(this.game.localPlayer.controlledMarble.id)) return null;
			return this.element.text;
		}, _state.enteredFrame);
	}
}