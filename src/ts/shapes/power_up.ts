import { Util } from "../util";
import { Shape } from "../shape";
import { MisParser, MissionElementItem } from "../parsing/mis_parser";
import { G } from "../global";
import { Marble } from "../marble";
import { EntityState } from "../../../shared/game_server_format";
import { AudioManager } from "../audio";

export const DEFAULT_COOLDOWN_DURATION = 7;

export type PowerUpState = EntityState & { entityType: 'powerUp' };

/** Powerups can be collected and used by the player for bonus effects. */
export abstract class PowerUp extends Shape {
	element: MissionElementItem;
	lastPickUpTime: number = null;
	pickedUpBy: number = null;
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

	constructor(element: MissionElementItem) {
		super();
		this.element = element;
	}

	onMarbleInside(t: number, marble: Marble) {
		let time = this.game.state.time;

		marble.interactWith(this);
		//this.interactWith(marble);
		//this.stateNeedsStore = true;

		let pickupable = this.lastPickUpTime === null || (time - this.lastPickUpTime) >= this.cooldownDuration;
		if (!pickupable) return;

		if (this.pickUp(marble)) {
			this.lastPickUpTime = time;
			this.pickedUpBy = marble.id;

			this.interactWith(marble);
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

		// Enable or disable the collision based on the last pick-up time time
		let pickupable = this.lastPickUpTime === null || (this.game.state.time - this.lastPickUpTime) >= this.cooldownDuration;
		//this.setCollisionEnabled(pickupable);
	}

	render() {
		super.render();

		let opacity = 1;
		if (this.lastPickUpTime && this.cooldownDuration > 0) {
			let availableTime = this.lastPickUpTime + this.cooldownDuration;
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
		if ((this.game.getEntityById(this.pickedUpBy) as Marble).controllingPlayer !== this.game.localPlayer) return null;
		return this.customPickUpAlert ?? `You picked up ${this.an? 'an' : 'a'} ${this.pickUpName}!`;
	}

	getHelpMessage() {
		if (this.pickedUpBy === null) return null;
		if ((this.game.getEntityById(this.pickedUpBy) as Marble).controllingPlayer !== this.game.localPlayer) return null;
		return `Press <func:bind mousefire> to use the ${this.pickUpName}!`;
	}

	getState(): PowerUpState {
		return {
			entityType: 'powerUp',
			lastPickUpTime: this.lastPickUpTime,
			pickedUpBy: this.pickedUpBy
		};
	}

	getInitialState(): PowerUpState {
		return {
			entityType: 'powerUp',
			lastPickUpTime: null,
			pickedUpBy: null
		};
	}

	loadState(_state: PowerUpState, { frame }: { frame: number }) {
		let prevLastPickUpTime = this.lastPickUpTime;

		this.lastPickUpTime = _state.lastPickUpTime;
		this.pickedUpBy = _state.pickedUpBy;

		if (this.pickedUpBy && prevLastPickUpTime < this.lastPickUpTime)
			this.pickUpCosmetically(this.game.getEntityById(this.pickedUpBy) as Marble, frame);
	}

	/** If this function returns true, the pickup was successful. */
	abstract pickUp(marble: Marble): boolean;
	abstract use(marble: Marble, t: number): void;
	abstract useCosmetically(marble: Marble): void;
}