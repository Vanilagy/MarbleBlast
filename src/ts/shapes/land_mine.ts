import { Shape } from "../shape";
import { state } from "../state";
import { Util } from "../util";
import { TimeState } from "../level";
import OIMO from "../declarations/oimo";

export class LandMine extends Shape {
	dtsPath = "shapes/hazards/landmine.dts";
	disappearTime = -Infinity;

	onMarbleContact(contact: OIMO.Contact, time: TimeState) {
		let marble = state.currentLevel.marble;
		let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(this.worldPosition)).normalize();

		marble.body.addLinearVelocity(vec.scale(10));
		this.disappearTime = time.timeSinceLoad;
	}

	tick(time: TimeState) {
		let visible = time.timeSinceLoad >= this.disappearTime + 5000;
		this.setCollisionEnabled(visible);
	}

	render(time: TimeState) {
		let opacity = Util.clamp((time.timeSinceLoad - (this.disappearTime + 5000)) / 1000, 0, 1);
		this.setOpacity(opacity);
	}
}