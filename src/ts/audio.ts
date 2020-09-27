import { ResourceManager } from "./resources";
import { Util } from "./util";

export abstract class AudioManager {
	static context: AudioContext;
	static masterGain: GainNode;
	static soundGain: GainNode;
	static musicGain: GainNode;

	static audioBufferCache = new Map<string, Promise<AudioBuffer>>();

	static init() {
		this.context = new AudioContext();

		this.masterGain = this.context.createGain();
		this.masterGain.gain.value = 0.1;
		this.masterGain.connect(this.context.destination);

		this.soundGain = this.context.createGain();
		this.soundGain.connect(this.masterGain);

		this.musicGain = this.context.createGain();
		this.musicGain.gain.value = 0.5;
		this.musicGain.connect(this.masterGain);
	}

	static loadBuffer(path: string) {
		if (this.audioBufferCache.has(path)) return this.audioBufferCache.get(path);

		let promise = new Promise<AudioBuffer>(async (resolve) => {
			let blob = await ResourceManager.loadResource("./assets/data/sound/" + path);
			let arrayBuffer = await blob.arrayBuffer();
			let audioBuffer = await this.context.decodeAudioData(arrayBuffer);

			resolve(audioBuffer);
		});

		this.audioBufferCache.set(path, promise);
		return promise;
	}

	static loadBuffers(paths: string[]) {
		return Promise.all(paths.map((path) => this.loadBuffer(path)));
	}

	static async createAudioSource(path: string | string[], destination = this.soundGain) {
		let chosenPath = (typeof path === "string")? path : Util.randomFromArray(path);
		let buffer = await this.loadBuffer(chosenPath);
		let audioSource = new AudioSource(buffer, destination);
		return audioSource;
	}

	static async play(path: string | string[], volume = 1, destination = this.soundGain) {
		let audioSource = await this.createAudioSource(path, destination);
		audioSource.gain.gain.value = volume;
		audioSource.play();
	}
}

export class AudioSource {
	node: AudioBufferSourceNode;
	gain: GainNode;

	constructor(buffer: AudioBuffer, destination: AudioNode) {
		this.node = AudioManager.context.createBufferSource();
		this.node.buffer = buffer;

		this.gain = AudioManager.context.createGain();
		this.node.connect(this.gain);
		this.gain.connect(destination);
	}

	play() {
		this.node.start();
	}

	stop() {
		this.node.stop();
	}
}