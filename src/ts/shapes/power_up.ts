import { Util } from "../util";
import { Shape } from "../shape";
import { TimeState } from "../level";
import { MissionElementItem } from "../parsing/mis_parser";
import { state } from "../state";

export const DEFAULT_COOLDOWN_DURATION = 7000;

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

	onMarbleInside(t: number) {
		let time = this.level.timeState;

		let pickupable = this.lastPickUpTime === null || (time.currentAttemptTime - this.lastPickUpTime) >= this.cooldownDuration;
		if (!pickupable) return;

		if (this.pickUp()) {
			this.level.replay.recordMarbleInside(this);

			this.lastPickUpTime = time.currentAttemptTime;
			if (this.autoUse) this.use(t);

			state.menu.hud.displayAlert(this.customPickUpAlert ?? `You picked up ${this.an? 'an' : 'a'} ${this.pickUpName}!`);
			if (this.element.showhelponpickup === "1" && !this.autoUse) state.menu.hud.displayHelp(`Press <func:bind mousefire> to use the ${this.pickUpName}!`);

			let body = this.bodies[0];
			body.enabled = false;
		}
	}

	tick(time: TimeState, onlyVisual: boolean) {
		super.tick(time, onlyVisual);

		if (onlyVisual) return;

		// Enable or disable the collision based on the last pick-up time time
		let pickupable = this.lastPickUpTime === null || (time.currentAttemptTime - this.lastPickUpTime) >= this.cooldownDuration;
		this.setCollisionEnabled(pickupable);
	}

	render(time: TimeState) {
		super.render(time);

		let opacity = 1;
		if (this.lastPickUpTime && this.cooldownDuration > 0) {
			let availableTime = this.lastPickUpTime + this.cooldownDuration;
			opacity = Util.clamp((time.currentAttemptTime - availableTime) / 1000, 0, 1);
		}

		this.setOpacity(opacity);
	}

	reset() {
		super.reset();

		let body = this.bodies[0];
		body.enabled = true;
		this.lastPickUpTime = null;
	}

	/** If this function returns true, the pickup was successful. */
	abstract pickUp(): boolean;
	abstract use(t: number): void;
}