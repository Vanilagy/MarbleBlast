import { ForceShape } from "./force_shape";
import { AudioSource } from "../audio";

/** Blows the marble away, but not much. */
export class SmallDuctFan extends ForceShape {
	dtsPath = "shapes/hazards/ductfan.dts";
	sounds = ["fan_loop.wav"];
	soundSource: AudioSource;

	constructor() {
		super();

		this.addConicForce(5, 2.617, 10);
	}

	async onLevelStart() {
		this.soundSource = this.level.audio.createAudioSource(this.sounds[0], undefined, this.worldPosition);
		this.soundSource.setLoop(true);
		this.soundSource.play();
		await this.soundSource.promise;
	}
}