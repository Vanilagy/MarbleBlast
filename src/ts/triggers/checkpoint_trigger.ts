import { Shape } from "../shape";
import { Trigger } from "./trigger";

/** A checkpoint trigger sets the current checkpoint to an arbitrary shape in the level. */
export class CheckpointTrigger extends Trigger {
	sounds = ['checkpoint.wav'];

	onMarbleEnter() {
		// Shape can be anything, doesn't necessarily have to be a checkpoint
		let respawnShape = this.level.shapes.find(x => x.srcElement?._name.toLowerCase() === this.element.respawnpoint?.toLowerCase()) as Shape;
		if (!respawnShape) return;

		this.level.saveCheckpointState(respawnShape, this);
		this.level.replay.recordMarbleEnter(this);
	}
}