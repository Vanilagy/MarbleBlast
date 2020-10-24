import { ResourceManager } from "./resources";
import { Util } from "./util";
import { state } from "./state";
import * as THREE from "three";
import { TimeState } from "./level";
import { StorageManager } from "./storage";

/** A class used as an utility for sound playback. */
export abstract class AudioManager {
	static context: AudioContext;
	static masterGain: GainNode;
	static soundGain: GainNode;
	static musicGain: GainNode;

	static audioBufferCache = new Map<string, Promise<AudioBuffer>>();
	/** Stores a list of all currently playing audio sources. */
	static audioSources: AudioSource[] = [];

	static init() {
		let AudioContext = window.AudioContext ?? (window as any).webkitAudioContext; // Safari
		this.context = new AudioContext();

		this.masterGain = this.context.createGain();
		this.masterGain.gain.value = 1;
		this.masterGain.connect(this.context.destination);

		this.soundGain = this.context.createGain();
		this.soundGain.gain.value = 0; // These values will be overwritten by the options anyway
		this.soundGain.connect(this.masterGain);

		this.musicGain = this.context.createGain();
		this.musicGain.gain.value = 0;
		this.musicGain.connect(this.masterGain);

		this.updateVolumes();
	}

	/** Loads an audio buffer from a path. Returns the cached version whenever possible. */
	static loadBuffer(path: string) {
		if (path.endsWith('.ogg') && Util.isSafari()) {
			// Safari can't decode OGG, so we serve it a fallback MP3 version instead.
			path = path.replace('.ogg', '.mp3');
		}

		if (this.audioBufferCache.has(path)) return this.audioBufferCache.get(path);

		let promise = new Promise<AudioBuffer>(async (resolve) => {
			let blob = await ResourceManager.loadResource("./assets/data/sound/" + path);
			let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(blob);
			let audioBuffer: AudioBuffer;
			try {
				if (window.AudioContext) {
					audioBuffer = await this.context.decodeAudioData(arrayBuffer);
				} else {
					audioBuffer = await new Promise((res, rej) => {
						this.context.decodeAudioData(
							arrayBuffer, 
							buff => res(buff),
							err => rej(err)
						);
					});
				}
			} catch (e) {
				console.log("Error with decoding Audio Data:", e);
				console.log(path);
			}

			resolve(audioBuffer);
		});

		this.audioBufferCache.set(path, promise);
		return promise;
	}

	static loadBuffers(paths: string[]) {
		return Promise.all(paths.map((path) => this.loadBuffer(path)));
	}

	/**
	 * Creates an audio source.
	 * @param path The path of the audio resource. If it's an array, a random one will be selected.
	 * @param destination The destination node of the audio.
	 * @param position Optional: The position of the audio source in 3D space.
	 */
	static createAudioSource(path: string | string[], destination = this.soundGain, position?: THREE.Vector3) {
		let chosenPath = (typeof path === "string")? path : Util.randomFromArray(path);
		let bufferPromise = this.loadBuffer(chosenPath);
		let audioSource = new AudioSource(bufferPromise, destination, position);

		if (position) {
			// Mute the sound by default to avoid any weird audible artifacts.
			audioSource.gain.gain.value = 0;
		}

		this.audioSources.push(audioSource);
		return audioSource;
	}

	/** Utility method for creating an audio source and playing it immediately. */
	static play(path: string | string[], volume = 1, destination = this.soundGain, position?: THREE.Vector3) {
		let audioSource = this.createAudioSource(path, destination, position);
		audioSource.gain.gain.value = position? 0 : volume;
		audioSource.play();
	}

	/** Updates the pan and volume of positional audio sources based on the listener's location. */
	static updatePositionalAudio(time: TimeState, listenerPos: THREE.Vector3, listenerYaw: number) {
		let quat = state.currentLevel.getOrientationQuat(time);
		quat.conjugate();

		for (let source of this.audioSources) {
			if (!source.position) continue;

			// Get the relative position of the audio source from the listener's POV
			let relativePosition = source.position.clone().sub(listenerPos);
			relativePosition.applyQuaternion(quat);
			relativePosition.applyAxisAngle(new THREE.Vector3(0, 0, 1), -listenerYaw);
			relativePosition.normalize();
			relativePosition.z = 0;

			let distance = source.position.distanceTo(listenerPos);
			let panRemoval = Util.clamp(distance / 1, 0, 1); // If the listener is very close to the center, start moving to the audio source to the center.
			
			source.setPannerValue(-relativePosition.y * 0.7 * panRemoval);
			source.gain.gain.value = Util.clamp(1 - distance / 30, 0, 1) * source.gainFactor;
		}
	}

	static updateVolumes() {
		// Quadratic because it feels better
		this.musicGain.gain.linearRampToValueAtTime(StorageManager.data.settings.musicVolume ** 2, this.context.currentTime + 0.01);
		this.soundGain.gain.linearRampToValueAtTime(StorageManager.data.settings.soundVolume ** 2, this.context.currentTime + 0.01);
	}

	static stopAllAudio() {
		for (let source of this.audioSources.slice()) {
			source.stop();
		}
	}

	/** Normalizes the volume of positional audio sources based on the sounds around them to prevent the user's permanent loss of hearing. */
	static normalizePositionalAudioVolume() {
		let sources = this.audioSources.filter(x => x.position); // Get all positional sources

		for (let i = 0; i < sources.length; i++) {
			let source = sources[i];
			let receivedVolume = 0;

			// Accumulate the total received volume at this point
			for (let j = 0; j < sources.length; j++) {
				if (i === j) continue;
				let otherSource = sources[j];
				let distance = source.position.distanceTo(otherSource.position);
				let preceivedVolume = Util.clamp(1 - distance / 30, 0, 1);
				receivedVolume += preceivedVolume;
			}

			// Normalize it
			source.gainFactor = Math.min(1 / receivedVolume, 1);
		}
	}
}

/** A small wrapper around audio nodes that are used to play a sound. */
export class AudioSource {
	promise: Promise<AudioBuffer>;
	destination: AudioNode;
	node: AudioBufferSourceNode;
	gain: GainNode;
	panner: StereoPannerNode | PannerNode;
	position: THREE.Vector3;
	stopped = false;
	gainFactor = 1;

	constructor(bufferPromise: Promise<AudioBuffer>, destination: AudioNode, position?: THREE.Vector3) {
		this.promise = bufferPromise;
		this.destination = destination;
		this.position = position;
		
		this.gain = AudioManager.context.createGain();

		if (AudioManager.context.createStereoPanner)
			this.panner = AudioManager.context.createStereoPanner();
		else
			this.panner = AudioManager.context.createPanner();
		this.gain.connect(this.panner);
		this.panner.connect(this.destination);

		this.node = AudioManager.context.createBufferSource();
		this.node.connect(this.gain);

		this.init();
	}

	async init() {
		let buffer = await this.promise;
		if (this.stopped) return; // The sound may have already been stopped, so don't continue.
		
		this.node.buffer = buffer;
	}

	setPannerValue(val: number) {
		if (AudioManager.context.createStereoPanner) {
			(this.panner as StereoPannerNode).pan.value = val;
		} else {
			// https://stackoverflow.com/a/59545726
			(this.panner as PannerNode).panningModel = 'equalpower';
			(this.panner as PannerNode).setPosition(val, 0, 1 - Math.abs(val));
		}
	}

	async play() {
		await this.promise;
		if (this.stopped) return; // The sound may have already been stopped, so don't continue.

		this.node.start();
		this.node.onended = () => {
			this.stop(); // Call .stop for clean-up purposes
		};
	};

	stop() {
		this.stopped = true;
		try {this.node.stop()} catch (e) {}
		Util.removeFromArray(AudioManager.audioSources, this);
	}
}