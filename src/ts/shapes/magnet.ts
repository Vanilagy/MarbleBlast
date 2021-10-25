import { AudioManager, AudioSource } from "../audio";
import { ForceShape } from "./force_shape";

/** Magnets pull the marble towards itself. */
export class Magnet extends ForceShape {
	dtsPath = "shapes/hazards/magnet/magnet.dts";
	useInstancing = true;
	collideable = false;
	sounds = ["magnet.wav"];
	soundSource: AudioSource;

	constructor() {
		super();

		this.addConicForceExceptItsAccurateThisTime(10, 0.7, -90);
	}

	async onLevelStart() {
		this.soundSource = AudioManager.createAudioSource(this.sounds[0], AudioManager.soundGain, this.worldPosition);
		this.soundSource.setLoop(true);
		this.soundSource.play();
		await this.soundSource.promise;
	}
}