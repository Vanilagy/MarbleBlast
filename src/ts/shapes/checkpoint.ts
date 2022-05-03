import { Marble } from "../marble";
import { Collision } from "../physics/collision";
import { Shape } from "../shape";

/** On contact, sets a new checkpoint with itself as the respawn shape. */
export class Checkpoint extends Shape {
	dtsPath = "shapes/buttons/checkpoint.dts";
	sounds = ['checkpoint.wav'];

	onMarbleContact(collision: Collision, marble: Marble) {
		marble.checkpointState.save(this);
	}
}