import { Util } from "../util";
import { Shape } from "../shape";

export abstract class PowerUp extends Shape {
	lastPickUpTime: number = null;
	cooldownDuration: number = 7000;
	autoUse = false;
	ambientRotate = true;
	collideable = false;

	onMarbleInside(time: number) {
		let pickupable = this.lastPickUpTime === null || (time - this.lastPickUpTime) >= this.cooldownDuration;
		if (!pickupable) return;
		
		if (this.pickUp()) {
			this.lastPickUpTime = time;
			if (this.autoUse) this.use(time);
		}
	}

	render(time: number) {
		super.render(time);

		let opacity = 1;
		if (this.lastPickUpTime && this.cooldownDuration > 0) {
			let availableTime = this.lastPickUpTime + this.cooldownDuration;
			opacity = Util.clamp((time - availableTime) / 1000, 0, 1);
		}

		this.setOpacity(opacity);
	}

	abstract pickUp(): boolean;
	abstract use(time: number): void;
}