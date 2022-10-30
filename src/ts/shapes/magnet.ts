import { AudioSource } from "../audio";
import { ForceShape } from "./force_shape";

/** Magnets pull the marble towards itself. */
export class Magnet extends ForceShape {
	dtsPath = "shapes/hazards/magnet/magnet.dts";
	collideable = false;
	sounds = ["magnet.wav"];
	soundSource: AudioSource;

	constructor() {
		super();

		this.addConicForceExceptItsAccurateThisTime(10, 0.7, -90);
	}

	async onLevelStart() {
		this.soundSource = this.level.audio.createAudioSource(this.sounds[0], undefined, this.worldPosition);
		this.soundSource.setLoop(true);
		this.soundSource.play();
		await this.soundSource.promise;
	}
}