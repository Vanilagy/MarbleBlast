import { ResourceManager } from "./resources";
import { Util } from "./util";
import { state } from "./state";
import * as THREE from "three";
import { TimeState } from "./level";

export abstract class AudioManager {
	static context: AudioContext;
	static masterGain: GainNode;
	static soundGain: GainNode;
	static musicGain: GainNode;

	static audioBufferCache = new Map<string, Promise<AudioBuffer>>();
	static positionalSources: AudioSource[] = [];

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

	static async createAudioSource(path: string | string[], destination = this.soundGain, position?: THREE.Vector3) {
		let chosenPath = (typeof path === "string")? path : Util.randomFromArray(path);
		let buffer = await this.loadBuffer(chosenPath);
		let audioSource = new AudioSource(buffer, destination, position);

		if (position) {
			audioSource.gain.gain.value = 0;
			this.positionalSources.push(audioSource);
		}

		return audioSource;
	}

	static async play(path: string | string[], volume = 1, destination = this.soundGain, position?: THREE.Vector3) {
		let audioSource = await this.createAudioSource(path, destination, position);
		audioSource.gain.gain.value = position? 0 : volume;
		audioSource.play();
	}

	static updatePositionalAudio(time: TimeState, listenerPos: THREE.Vector3, listenerYaw: number) {
		let quat = state.currentLevel.getOrientationQuat(time);
		quat.conjugate();

		for (let source of this.positionalSources) {
			let relativePosition = source.position.clone().sub(listenerPos);
			relativePosition.applyQuaternion(quat);
			relativePosition.applyAxisAngle(new THREE.Vector3(0, 0, 1), -listenerYaw);
			relativePosition.normalize();
			relativePosition.z = 0;

			let distance = source.position.distanceTo(listenerPos);
			let panRemoval = Util.clamp(distance / 1, 0, 1)
			
			source.panner.pan.value = -relativePosition.y * 0.8 * panRemoval;
			source.gain.gain.value = Util.clamp(1 - distance / 30, 0, 1);
		}
	}
}

export class AudioSource {
	node: AudioBufferSourceNode;
	gain: GainNode;
	panner: StereoPannerNode;
	position: THREE.Vector3;

	constructor(buffer: AudioBuffer, destination: AudioNode, position?: THREE.Vector3) {
		this.node = AudioManager.context.createBufferSource();
		this.node.buffer = buffer;

		this.gain = AudioManager.context.createGain();
		this.panner = AudioManager.context.createStereoPanner();
		this.node.connect(this.gain);
		this.gain.connect(this.panner);
		this.panner.connect(destination);

		this.position = position;
	}

	play() {
		this.node.start();
		this.node.onended = () => {
			this.stop();
		};
	};

	stop() {
		this.node.stop();
		if (this.position) Util.removeFromArray(AudioManager.positionalSources, this);
	}
}