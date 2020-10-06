import { ForceShape } from "./force_shape";
import { AudioSource, AudioManager } from "../audio";

export class SmallDuctFan extends ForceShape {
	dtsPath = "shapes/hazards/ductfan.dts";
	sounds = ["fan_loop.wav"];
	soundSource: AudioSource;
	useInstancing = true;

	constructor() {
		super();

		this.addConicForce(5, 0.7, 10);
	}

	async onLevelStart() {
		this.soundSource = await AudioManager.createAudioSource(this.sounds[0], AudioManager.soundGain, this.worldPosition);
		this.soundSource.node.loop = true;
		this.soundSource.play();
	}
}