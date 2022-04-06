import { Util } from "../util";
import { Shape } from "../shape";
import { MissionElementItem } from "../parsing/mis_parser";
import { state } from "../state";
import { Marble } from "../marble";
import { EntityState } from "../../../shared/game_server_format";

export const DEFAULT_COOLDOWN_DURATION = 7;

type PowerUpState = EntityState & { entityType: 'powerUp' };

/** Powerups can be collected and used by the player for bonus effects. */
export abstract class PowerUp extends Shape {
	element: MissionElementItem;
	lastPickUpTime: number = null;
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

		let pickupable = this.lastPickUpTime === null || (time - this.lastPickUpTime) >= this.cooldownDuration;
		if (!pickupable) return;

		if (this.pickUp(marble)) {
			//this.level.replay.recordMarbleInside(this);
			this.interactWith(marble);

			this.lastPickUpTime = time;
			if (this.autoUse) this.use(marble, t);

			state.menu.hud.displayAlert(this.customPickUpAlert ?? `You picked up ${this.an? 'an' : 'a'} ${this.pickUpName}!`);
			if (this.element.showhelponpickup === "1" && !this.autoUse) state.menu.hud.displayHelp(`Press <func:bind mousefire> to use the ${this.pickUpName}!`);

			this.setCollisionEnabled(false);

			this.stateNeedsStore = true;
		}
	}

	update(onlyVisual?: boolean) {
		if (onlyVisual) return;

		// Enable or disable the collision based on the last pick-up time time
		let pickupable = this.lastPickUpTime === null || (this.game.state.time - this.lastPickUpTime) >= this.cooldownDuration;
		this.setCollisionEnabled(pickupable);
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

	reset() {
		super.reset();

		this.setCollisionEnabled(true);
		this.lastPickUpTime = null;
	}

	getCurrentState(): PowerUpState {
		return {
			entityType: 'powerUp',
			lastPickUpTime: this.lastPickUpTime
		};
	}

	getInitialState(): PowerUpState {
		return {
			entityType: 'powerUp',
			lastPickUpTime: null
		};
	}

	loadState(state: PowerUpState) {
		this.lastPickUpTime = state.lastPickUpTime;
	}

	/** If this function returns true, the pickup was successful. */
	abstract pickUp(marble: Marble): boolean;
	abstract use(marble: Marble, t: number): void;
}