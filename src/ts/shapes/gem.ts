import { Shape } from "../shape";
import { MissionElementItem } from "../parsing/mis_parser";
import { Util } from "../util";
import { EntityState } from "../../../shared/game_server_format";
import { Marble } from "../marble";

// List all of gem colors for randomly choosing one
const GEM_COLORS = ["blue", "red", "yellow", "purple", "green", "turquoise", "orange", "black"]; // "Platinum" is also a color, but it can't appear by chance

type GemState = EntityState & { entityType: 'gem' };

/** Gems need to be collected before being able to finish. */
export class Gem extends Shape {
	dtsPath = "shapes/items/gem.dts";
	ambientRotate = true;
	collideable = false;
	pickedUp = false;
	shareMaterials = false;
	showSequences = false; // Gems actually have an animation for the little shiny thing, but the actual game ignores that. I get it, it was annoying as hell.
	sounds = ['gotgem.wav', 'gotallgems.wav', 'missinggems.wav'];

	constructor(element: MissionElementItem) {
		super();

		// Determine the color of the gem:
		let color = element.datablock.slice("GemItem".length);
		if (color.length === 0) color = Gem.pickRandomColor(); // Random if no color specified

		this.matNamesOverride["base.gem"] = color.toLowerCase() + ".gem";
	}

	onMarbleInside(t: number, marble: Marble) {
		marble.interactWith(this);

		if (this.pickedUp) return;

		this.pickedUp = true;
		this.setOpacity(0); // Hide the gem
		this.game.state.pickUpGem(t);
		this.setCollisionEnabled(false);

		this.stateNeedsStore = true;
	}

	reset() {
		super.reset();

		this.pickedUp = false;
		this.setOpacity(1);
		this.setCollisionEnabled(true);
	}

	getCurrentState(): GemState {
		return {
			entityType: 'gem',
			pickedUp: this.pickedUp
		};
	}

	getInitialState(): GemState {
		return {
			entityType: 'gem',
			pickedUp: false
		};
	}

	loadState(state: GemState) {
		this.pickedUp = state.pickedUp;

		this.setOpacity(Number(!this.pickedUp));
		this.setCollisionEnabled(!this.pickedUp);
	}

	static pickRandomColor() {
		return Util.randomFromArray(GEM_COLORS);
	}
}