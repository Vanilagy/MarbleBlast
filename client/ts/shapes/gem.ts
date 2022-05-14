import { Shape } from "../shape";
import { MissionElement, MissionElementItem } from "../../../shared/mis_parser";
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

/** Gems need to be collected before being able to finish. */
export class Gem extends Shape {
	restartable = true;
	dtsPath = "shapes/items/gem.dts";
	ambientRotate = true;
	collideable = false;
	shareMaterials = false;
	showSequences = false; // Gems actually have an animation for the little shiny thing, but the actual game ignores that. I get it, it was annoying as hell.
	sounds = ['gotgem.wav', 'gotallgems.wav', 'missinggems.wav'];

	pickedUpBy: Marble = null;
	pickUpFrame = -Infinity;

	init(game?: Game, srcElement?: MissionElementItem) {
		// Determine the color of the gem:
		let color = srcElement.datablock.slice("GemItem".length);
		if (color.length === 0) color = Gem.pickRandomColor(game.seed + srcElement._id); // Random if no color specified

		this.matNamesOverride["base.gem"] = color.toLowerCase() + ".gem";

		if (game instanceof MultiplayerGame) this.sounds.push('opponentdiamond.wav');

		return super.init(game, srcElement);
	}

	onMarbleInside(t: number, marble: Marble) {
		marble.affect(this);

		if (this.pickedUpBy) return;

		this.pickedUpBy = marble;
		this.pickUpFrame = this.game.state.frame;

		G.menu.hud.displayAlert(this.getAlertMessage.bind(this), this.game.state.frame);
		this.playSound();

		this.stateNeedsStore = true;
	}

	/** lmao name */
	pickDown() {
		this.pickedUpBy = null;
		this.stateNeedsStore = true;
	}

	update(onlyVisual?: boolean) {
		if (onlyVisual) return;

		this.setCollisionEnabled(!this.pickedUpBy);
	}

	render() {
		super.render();

		this.setOpacity(Number(!this.pickedUpBy));
	}

	getState(): GemState {
		return {
			entityType: 'gem',
			pickedUpBy: this.pickedUpBy?.id ?? null,
			pickUpFrame: isFinite(this.pickUpFrame) ? this.pickUpFrame : null
		};
	}

	getInitialState(): GemState {
		return {
			entityType: 'gem',
			pickedUpBy: null,
			pickUpFrame: null
		};
	}

	loadState(state: GemState, { frame }: { frame: number }) {
		let prevPickUpFrame = this.pickUpFrame;

		this.pickedUpBy = this.game.getEntityById(state.pickedUpBy) as Marble;
		this.pickUpFrame = state.pickUpFrame ?? -Infinity;

		this.setOpacity(Number(this.pickedUpBy === null));
		this.setCollisionEnabled(this.pickedUpBy === null);

		if (this.pickUpFrame > prevPickUpFrame) {
			G.menu.hud.displayAlert(this.getAlertMessage.bind(this), frame);
			this.playSound();
		}
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
				else {
					let session = G.lobby.sockets.find(x => x.id === marble.controllingPlayer?.sessionId);
					subject = session ? session.name : 'A marble';
				}
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
			let gemCount = this.game.entities.filter(x => x instanceof Gem && x.pickedUpBy !== null).length;
			let sound = gemCount === this.game.totalGems ? this.sounds[1] : this.pickedUpBy === this.game.localPlayer.controlledMarble ? this.sounds[0] : this.sounds[3];

			AudioManager.play(sound);
		}, `${this.id}sound`, true);
	}

	static pickRandomColor(seed?: number) {
		if (seed !== undefined) return GEM_COLORS[Math.floor(Util.seededRandom(seed, 10) * GEM_COLORS.length)];
		return Util.randomFromArray(GEM_COLORS);
	}
}