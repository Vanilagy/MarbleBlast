import { Shape } from "../shape";

/** On contact, sets a new checkpoint with itself as the respawn shape. */
export class Checkpoint extends Shape {
	dtsPath = "shapes/buttons/checkpoint.dts";
	sounds = ['checkpoint.wav'];

	onMarbleContact() {
		this.level.saveCheckpointState(this);
		this.level.replay.recordMarbleContact(this);
	}
}