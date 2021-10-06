import { Shape } from "../shape";

export class Checkpoint extends Shape {
	dtsPath = "shapes/buttons/checkpoint.dts";
	useInstancing = true;
	sounds = ['checkpoint.wav'];

	onMarbleContact() {
		this.level.saveCheckpointState(this);
		this.level.replay.recordMarbleContact(this);
	}
}