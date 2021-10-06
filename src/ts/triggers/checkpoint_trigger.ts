import { Checkpoint } from "../shapes/checkpoint";
import { Trigger } from "./trigger";

export class CheckpointTrigger extends Trigger {
	sounds = ['checkpoint.wav'];

	onMarbleEnter() {
		let checkpoint = this.level.shapes.find(x => x.srcElement?._name === this.element.respawnpoint) as Checkpoint;
		if (!checkpoint) return;

		this.level.saveCheckpointState(checkpoint, this);;
		this.level.replay.recordMarbleEnter(this);
	}
}