import { Util } from "../util";
import { Shape } from "../shape";
import { MisParser, MissionElementItem } from "../../../shared/mis_parser";
import { G } from "../global";
import { Marble } from "../marble";
import { EntityState } from "../../../shared/game_server_format";
import { AudioManager } from "../audio";
import { GAME_UPDATE_RATE } from "../../../shared/constants";

export const DEFAULT_COOLDOWN_DURATION = 7;

export type PowerUpState = EntityState & { entityType: 'powerUp' | 'randomPowerUp' /* <- hacky but now TS happi */ };

/** Powerups can be collected and used by the player for bonus effects. */
export abstract class PowerUp extends Shape {
	restartable = true;
	element: MissionElementItem;
	/** Reappears after this time. */
	cooldownDuration: number = DEFAULT_COOLDOWN_DURATION;
	/** Whether or not to automatically use the powerup instantly on pickup. */
	autoUse = false;
	ambientRotate = true;
	collideable = false;
	shareMaterials = false;
	/** The name of the powerup that is shown on pickup. */
	abstract pickUpName: string;
	/** Overrides the full pick up alert string. */
	customPickUpAlert: string = null;
	/** If 'an' should be used instead of 'a' in the pickup alert. */
	an = false;

	pickUpFrame = -Infinity;
	pickedUpBy: Marble = null;

	constructor(element: MissionElementItem) {
		super();
		this.element = element;
	}

	get pickupable() {
		return this.game.state.frame - this.pickUpFrame >= this.cooldownDuration * GAME_UPDATE_RATE;
	}

	onMarbleInside(t: number, marble: Marble) {
		marble.affect(this);
		//this.interactWith(marble);
		//this.stateNeedsStore = true;

		if (!this.pickupable) return;

		if (this.pickUp(marble)) {
			this.pickUpFrame = this.game.state.frame;
			this.pickedUpBy = marble;

			this.affect(marble);
			this.pickUpCosmetically(marble, this.game.state.frame);
			//this.setCollisionEnabled(false);

			if (this.autoUse) {
				this.use(marble, t);
				this.useCosmetically(marble);
			}

			this.stateNeedsStore = true;
		}
	}

	update(onlyVisual?: boolean) {
		if (onlyVisual) return;

		// Enable or disable the collision based on pickupability
		//this.setCollisionEnabled(this.pickupable);
	}

	render() {
		super.render();

		let opacity = 1;
		if (this.pickUpFrame > -Infinity && this.cooldownDuration > 0) {
			let availableTime = this.pickUpFrame / GAME_UPDATE_RATE + this.cooldownDuration;
			opacity = Util.clamp(this.game.state.time - availableTime, 0, 1);
		}

		this.setOpacity(opacity);
	}

	pickUpCosmetically(marble: Marble, frame: number) {
		if (marble === this.game.localPlayer.controlledMarble)
			this.game.simulator.executeNonDuplicatableEvent(() => AudioManager.play(this.sounds[0]), `${this.id}sound`, true);

		G.menu.hud.displayAlert(this.getAlertMessage.bind(this), frame);
		if (MisParser.parseBoolean(this.element.showhelponpickup) && !this.autoUse)
			G.menu.hud.displayHelp(this.getHelpMessage.bind(this), frame);
	}

	getAlertMessage() {
		if (this.pickedUpBy === null) return null;
		if (this.pickedUpBy.controllingPlayer !== this.game.localPlayer) return null;
		return this.customPickUpAlert ?? `You picked up ${this.an? 'an' : 'a'} ${this.pickUpName}!`;
	}

	getHelpMessage() {
		if (this.pickedUpBy === null) return null;
		if (this.pickedUpBy.controllingPlayer !== this.game.localPlayer) return null;
		return `Press <func:bind mousefire> to use the ${this.pickUpName}!`;
	}

	getState(): PowerUpState {
		return {
			entityType: 'powerUp',
			pickUpFrame: isFinite(this.pickUpFrame) ? this.pickUpFrame : null,
			pickedUpBy: this.pickedUpBy?.id ?? null
		};
	}

	getInitialState(): PowerUpState {
		return {
			entityType: 'powerUp',
			pickUpFrame: null,
			pickedUpBy: null
		};
	}

	loadState(state: PowerUpState, { frame }: { frame: number }) {
		let prevPickUpFrame = this.pickUpFrame;

		this.pickUpFrame = state.pickUpFrame ?? -Infinity;
		this.pickedUpBy = this.game.getEntityById(state.pickedUpBy) as Marble;

		if (this.pickedUpBy && prevPickUpFrame < this.pickUpFrame)
			this.pickUpCosmetically(this.pickedUpBy, frame);
	}

	/** If this function returns true, the pickup was successful. */
	abstract pickUp(marble: Marble): boolean;
	abstract use(marble: Marble, t: number): void;
	abstract useCosmetically(marble: Marble): void;
}