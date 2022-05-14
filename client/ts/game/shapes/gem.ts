import { Shape } from "../shape";
import { MissionElementItem } from "../../../../shared/mis_parser";
import { Util } from "../../util";
import { EntityState } from "../../../../shared/game_server_format";
import { Marble } from "../marble";
import { G } from "../../global";
import { AudioManager } from "../../audio";
import { MultiplayerGame } from "../multiplayer_game";
import { Game, GameMode } from "../game";
import { Vector3 } from "../../math/vector3";
import { Quaternion } from "../../math/quaternion";

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

	pickUpFrame = -Infinity;
	pickUpHistory: Marble[] = [];

	get pickupable() {
		return Util.imply(this.game.mode === GameMode.Hunt, this.game.gemSpawnState && this.game.gemSpawnState.currentSpawns.has(this) && this.game.gemSpawnState.lastSpawnFrame > this.pickUpFrame) &&
			Util.imply(this.game.mode !== GameMode.Hunt, this.pickUpHistory.length === 0);
	}

	async init(game?: Game, srcElement?: MissionElementItem) {
		// Determine the color of the gem:
		let color = srcElement.datablock.slice("GemItem".length);
		if (color.length === 0) color = Gem.pickRandomColor(game.seed + srcElement._id); // Random if no color specified

		this.matNamesOverride["base.gem"] = color.toLowerCase() + ".gem";

		if (game instanceof MultiplayerGame) this.sounds.push('opponentdiamond.wav');

		await super.init(game, srcElement);

		if (game?.mode === GameMode.Hunt) {
			let beamShape = new Shape();
			beamShape.dtsPath = 'shapes/gemlights/gemlight.dts';
			beamShape.matNamesOverride["base.lightbeam"] = color.toLowerCase() + ".lightbeam";
			beamShape.shareMaterials = false;
			beamShape.materialPostprocessor = (mat) => mat.doubleSided = true;

			await beamShape.init(game);
			this.game.initter.loadingState.loaded--; // Dumb hack to counteract the beam loading LMAO

			beamShape.setTransform(new Vector3(), new Quaternion(), new Vector3(1, 1, 1));
			beamShape.setOpacity(0.333);
			beamShape.render();

			this.group.add(beamShape.group);
		}
	}

	onMarbleInside(t: number, marble: Marble) {
		marble.affect(this);

		if (!this.pickupable) return;

		this.pickUpFrame = this.game.state.frame;
		this.pickUpHistory.push(marble);

		G.menu.hud.displayAlert(this.getAlertMessage.bind(this), this.game.state.frame);
		this.playSound();

		this.stateNeedsStore = true;

		if (this.game.mode === GameMode.Hunt) {
			if ([...this.game.gemSpawnState.currentSpawns].every(x => !x.pickupable)) {
				this.game.gemSpawnState.advance(this);
				this.affect(this.game.gemSpawnState);
			}
		}
	}

	/** lmao name */
	pickDown() {
		if (this.game.mode === GameMode.Normal) return;

		this.pickUpHistory.length = 0;
		this.stateNeedsStore = true;
	}

	update(onlyVisual?: boolean) {
		if (onlyVisual) return;

		this.setCollisionEnabled(this.pickupable);
	}

	render() {
		super.render();

		this.setOpacity(Number(this.pickupable));
	}

	getState(): GemState {
		return {
			entityType: 'gem',
			pickUpFrame: isFinite(this.pickUpFrame) ? this.pickUpFrame : null,
			pickUpHistory: this.pickUpHistory.map(x => x.id)
		};
	}

	getInitialState(): GemState {
		return {
			entityType: 'gem',
			pickUpFrame: null,
			pickUpHistory: []
		};
	}

	loadState(state: GemState, { frame }: { frame: number }) {
		let prevPickUpFrame = this.pickUpFrame;

		this.pickUpFrame = state.pickUpFrame ?? -Infinity;
		this.pickUpHistory = state.pickUpHistory.map(x => this.game.getEntityById(x) as Marble);

		if (this.pickUpFrame > prevPickUpFrame) {
			G.menu.hud.displayAlert(this.getAlertMessage.bind(this), frame);
			this.playSound();
		}
	}

	getAlertMessage() {
		if (this.game.mode === GameMode.Hunt) return null;

		let string: string;
		let gemWord = (G.modification === 'gold')? 'gem' : 'diamond';
		let gemCount = this.game.entities.filter(x => x instanceof Gem && x.pickUpHistory !== null).length;

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
			let marble = this.pickUpHistory[0];
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
			let gemCount = this.game.mode === GameMode.Hunt ? 0 : Util.count(this.game.shapes, x => x instanceof Gem && x.pickUpHistory.length > 0);
			let sound = gemCount === this.game.totalGems ? this.sounds[1] : this.pickUpHistory[0] === this.game.localPlayer.controlledMarble ? this.sounds[0] : this.sounds[3];

			AudioManager.play(sound);
		}, `${this.id}sound`, true);
	}

	static pickRandomColor(seed?: number) {
		if (seed !== undefined) return GEM_COLORS[Math.floor(Util.seededRandom(seed, 10) * GEM_COLORS.length)];
		return Util.randomFromArray(GEM_COLORS);
	}
}