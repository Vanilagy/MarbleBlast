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

	static assetPath: string;
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

	static setAssetPath(path: string) {
		this.assetPath = path;
	}

	static toFullPath(path: string) {
		if (path.endsWith('.ogg') && Util.isSafari()) {
			// Safari can't decode OGG, so we serve it a fallback MP3 version instead.
			path = path.replace('.ogg', '.mp3');
		}

		let fullPath = this.assetPath + path;

		return fullPath;
	}

	/** Loads an audio buffer from a path. Returns the cached version whenever possible. */
	static loadBuffer(path: string) {
		let fullPath = this.toFullPath(path);

		// If there's a current level, see if there's a sound file for this path contained in it
		let mission = state.level?.mission;
		let zipFile: JSZip.JSZipObject;
		if (mission && mission.zipDirectory && mission.zipDirectory.files['data/sound/' + path]) {
			zipFile = mission.zipDirectory.files['data/sound/' + path];
		} else {
			// Return the cached version if there is one
			if (this.audioBufferCache.has(fullPath)) return this.audioBufferCache.get(fullPath);
		}

		let promise = new Promise<AudioBuffer>(async (resolve, reject) => {
			try {
				let blob = zipFile? await zipFile.async('blob') : await ResourceManager.loadResource(fullPath);
				let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(blob);
				let audioBuffer: AudioBuffer;

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
	
				resolve(audioBuffer);
			} catch (e) {
				reject(e);
			}
		});

		if (!zipFile) this.audioBufferCache.set(fullPath, promise);
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
	 * @param preferStreaming If true, uses a normal <audio> element instead of play the audio as quickly as possible.
	 */
	static createAudioSource(path: string | string[], destination = this.soundGain, position?: THREE.Vector3, preferStreaming = false) {
		let chosenPath = (typeof path === "string")? path : Util.randomFromArray(path);
		let fullPath = this.toFullPath(chosenPath);
		let audioSource: AudioSource;

		if (preferStreaming) {
			if (this.audioBufferCache.has(fullPath)) {
				// We already got the buffer, prefer that over streaming
				preferStreaming = false;
			} else {
				let audioElement = new Audio();
				audioElement.src = fullPath;
				audioElement.preload = 'auto';
				audioSource = new AudioSource(audioElement, destination, position);
			}
		}
		if (!preferStreaming) {
			let bufferPromise = this.loadBuffer(chosenPath);
			audioSource = new AudioSource(bufferPromise, destination, position);
		}

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
		let quat = state.level.getOrientationQuat(time);
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
			let panRemoval = Util.clamp(distance / 1, 0, 1); // If the listener is very close to the center, start moving the audio source to the center.
			
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
	promise: Promise<AudioBuffer | void>;
	destination: AudioNode;
	node: AudioBufferSourceNode | MediaElementAudioSourceNode;
	gain: GainNode;
	panner: StereoPannerNode | PannerNode;
	position: THREE.Vector3;
	stopped = false;
	gainFactor = 1;
	audioElement: HTMLAudioElement;

	constructor(source: Promise<AudioBuffer> | HTMLAudioElement, destination: AudioNode, position?: THREE.Vector3) {
		if (source instanceof Promise) {
			this.promise = source;
		} else {
			this.audioElement = source;
			this.promise = new Promise(resolve => {
				source.addEventListener('canplaythrough', () => resolve());
			});
		}
		
		this.destination = destination;
		this.position = position;
		
		this.gain = AudioManager.context.createGain();

		if (AudioManager.context.createStereoPanner)
			this.panner = AudioManager.context.createStereoPanner();
		else
			this.panner = AudioManager.context.createPanner();
		this.gain.connect(this.panner);
		this.panner.connect(this.destination);
		
		if (source instanceof Promise) {
			this.node = AudioManager.context.createBufferSource();
		} else {
			this.node = AudioManager.context.createMediaElementSource(source);
		}

		this.node.connect(this.gain);
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

	setLoop(loop: boolean) {
		if (this.audioElement) this.audioElement.loop = loop;
		else (this.node as AudioBufferSourceNode).loop = loop;
	}

	setPlaybackRate(playbackRate: number) {
		if (this.audioElement) this.audioElement.playbackRate = playbackRate;
		else (this.node as AudioBufferSourceNode).playbackRate.value = playbackRate;
	}

	async play() {
		if (this.stopped) {
			this.stopped = false;

			if (this.node instanceof AudioBufferSourceNode) {
				// Gotta recreate this stuff
				this.node = AudioManager.context.createBufferSource();
				this.node.connect(this.gain);
				this.stopped = false;
				AudioManager.audioSources.push(this);
			}
		}

		let maybeBuffer = await this.promise;
		if (this.stopped) return;

		if (this.node instanceof AudioBufferSourceNode) {
			this.node.buffer = maybeBuffer as AudioBuffer;
			this.node.start();
			this.node.onended = () => {
				this.stop(); // Call .stop for clean-up purposes
			};
		} else {
			this.audioElement.play();
			this.audioElement.addEventListener('ended', () => this.stop());
		}
	}

	stop() {
		this.stopped = true;
		try {
			if (this.audioElement) this.audioElement.pause();
			else (this.node as AudioBufferSourceNode).stop();
		} catch (e) {}
		Util.removeFromArray(AudioManager.audioSources, this);
	}
}