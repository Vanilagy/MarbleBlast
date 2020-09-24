import { Shape } from "../shape";
import { state } from "../state";
import { Util } from "../util";

export class LandMine extends Shape {
	dtsPath = "shapes/hazards/landmine.dts";

	onMarbleContact() {
		let marble = state.currentLevel.marble;
		let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(this.worldPosition)).normalize();

		marble.body.addLinearVelocity(vec.scale(10));
	}
}