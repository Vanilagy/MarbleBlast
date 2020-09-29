import { ForceShape } from "./force_shape";
import OIMO from "../declarations/oimo";
import { AudioSource, AudioManager } from "../audio";

export class Tornado extends ForceShape {
	dtsPath = "shapes/hazards/tornado.dts";
	collideable = false;
	sounds = ["tornado.wav"];
	soundSource: AudioSource;

	constructor() {
		super();

		this.addSphericalForce(8, -60);
		this.addSphericalForce(3, 60);
		this.addFieldForce(3, new OIMO.Vec3(0, 0, 150));
	}

	async onLevelStart() {
		this.soundSource = await AudioManager.createAudioSource(this.sounds[0], AudioManager.soundGain, this.worldPosition);
		this.soundSource.node.loop = true;
		this.soundSource.play();
	}
}