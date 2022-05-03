import { Marble } from "../marble";
import { Shape } from "../shape";
import { Trigger } from "./trigger";

/** A checkpoint trigger sets the current checkpoint to an arbitrary shape in the level. */
export class CheckpointTrigger extends Trigger {
	sounds = ['checkpoint.wav'];

	onMarbleEnter(marble: Marble) {
		// Shape can be anything, doesn't necessarily have to be a checkpoint
		let respawnShape = this.game.shapes.find(x => x.srcElement?._name.toLowerCase() === this.element.respawnpoint?.toLowerCase()) as Shape;
		if (!respawnShape) return;

		marble.checkpointState.save(respawnShape, this);
	}
}