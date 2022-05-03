import { InternalShapeState, Shape } from "../shape";
import { MissionElement, MissionElementItem } from "../parsing/mis_parser";
import { Util } from "../util";
import { EntityState } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { G } from "../global";
import { AudioManager } from "../audio";
import { MultiplayerGame } from "../game/multiplayer_game";
import { Game } from "../game/game";

// List all of gem colors for randomly choosing one
const GEM_COLORS = ["blue", "red", "yellow", "purple", "green", "turquoise", "orange", "black"]; // "Platinum" is also a color, but it can't appear by chance

type GemState = EntityState & { entityType: 'gem' };

type InternalGemState = InternalShapeState & {
	lastPickUpFrame: number
};

/** Gems need to be collected before being able to finish. */
export class Gem extends Shape {
	dtsPath = "shapes/items/gem.dts";
	ambientRotate = true;
	collideable = false;
	pickedUpBy: Marble = null;
	lastPickUpFrame = -Infinity;
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

	init(game?: Game, srcElement?: MissionElement) {
		if (game instanceof MultiplayerGame) this.sounds.push('opponentdiamond.wav');

		return super.init(game, srcElement);
	}

	onMarbleInside(t: number, marble: Marble) {
		marble.interactWith(this);

		if (this.pickedUpBy !== null) return;

		this.pickedUpBy = marble;
		this.lastPickUpFrame = this.game.state.frame;
		this.setOpacity(0); // Hide the gem
		this.setCollisionEnabled(false);
		G.menu.hud.displayAlert(this.getAlertMessage.bind(this), this.game.state.frame);
		this.playSound();

		this.stateNeedsStore = true;
		this.internalStateNeedsStore = true;
	}

	/** lmao name */
	pickDown() {
		this.pickedUpBy = null;
		this.setOpacity(1); // Show the gem again
		this.setCollisionEnabled(true);

		this.stateNeedsStore = true;
	}

	getState(): GemState {
		return {
			entityType: 'gem',
			pickedUpBy: this.pickedUpBy?.id ?? null
		};
	}

	getInitialState(): GemState {
		return {
			entityType: 'gem',
			pickedUpBy: null
		};
	}

	loadState(state: GemState, { frame }: { frame: number }) {
		let prevLastPickUpFrame = this.lastPickUpFrame;

		this.pickedUpBy = this.game.getEntityById(state.pickedUpBy) as Marble;
		if (this.pickedUpBy) {
			this.lastPickUpFrame = frame;
			this.internalStateNeedsStore = true;
		}

		this.setOpacity(Number(this.pickedUpBy === null));
		this.setCollisionEnabled(this.pickedUpBy === null);

		if (this.lastPickUpFrame > prevLastPickUpFrame) {
			G.menu.hud.displayAlert(this.getAlertMessage.bind(this), frame);
			this.playSound();
		}
	}

	getInternalState(): InternalGemState {
		return {
			...super.getInternalState(),
			lastPickUpFrame: this.lastPickUpFrame
		};
	}

	loadInternalState(state: InternalGemState) {
		super.loadInternalState(state);
		this.lastPickUpFrame = state.lastPickUpFrame;
	}

	getAlertMessage() {
		let string: string;
		let gemWord = (G.modification === 'gold')? 'gem' : 'diamond';
		let gemCount = this.game.entities.filter(x => x instanceof Gem && x.pickedUpBy !== null).length;

		// Show a notification (and play a sound) based on the gems remaining
		if (gemCount === this.game.totalGems) {
			string = `You have all the ${gemWord}s, head for the finish!`;
			//AudioManager.play('gotallgems.wav');

			// todo Some levels with this package end immediately upon collection of all gems
			/*
			if (this.mission.misFile.activatedPackages.includes('endWithTheGems')) {
				this.touchFinish(t);
			}*/
		} else {
			let subject: string;
			let marble = this.pickedUpBy;
			if (!marble || !marble.controllingPlayer) {
				subject = 'A marble';
			} else {
				if (marble.controllingPlayer === this.game.localPlayer) subject = 'You';
				else subject = 'They'; // todo change to username
			}

			string = `${subject} picked up a ${gemWord}${G.modification === 'gold' ? '.' : '!'}  `;

			let remaining = this.game.totalGems - gemCount;
			if (remaining === 1) {
				string += `Only one ${gemWord} to go!`;
			} else {
				string += `${remaining} ${gemWord}s to go!`;
			}
		}

		return string;
	}

	playSound() {
		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.pickedUpBy === this.game.localPlayer.controlledMarble ? this.sounds[0] : this.sounds[3]);
		}, `${this.id}sound`, true);
	}

	static pickRandomColor() {
		// todo: make this synced across clients
		return Util.randomFromArray(GEM_COLORS);
	}
}