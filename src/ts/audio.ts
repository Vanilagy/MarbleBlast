import { ResourceManager } from "./resources";
import { Util } from "./util";
import { state } from "./state";
import { TimeState } from "./level";
import { StorageManager } from "./storage";
import { Vector3 } from "./math/vector3";

export const OFFLINE_CONTEXT_SAMPLE_RATE = 48_000;
const audioBufferCachePromises = new Map<string, Promise<AudioBuffer>>();
const audioBufferCache = new Map<string, AudioBuffer>();

/** A class used as an utility for sound playback. */
export class AudioManager {
	context: AudioContext | OfflineAudioContext;
	masterGain: GainNode;
	soundGain: GainNode;
	musicGain: GainNode;

	assetPath: string;
	/** Stores a list of all currently playing audio sources. */
	audioSources: AudioSource[] = [];
	/** Can be set to schedule audio events to happen at a specific time. Useful for offline audio rendering. */
	currentTimeOverride: number = null;

	get currentTime() {
		return this.currentTimeOverride ?? this.context.currentTime;
	}

	init(offline?: { duration: number }) {
		if (window.AudioContext) {
			if (!offline) {
				this.context = new AudioContext();
			} else {
				this.context = new OfflineAudioContext(2, offline.duration * OFFLINE_CONTEXT_SAMPLE_RATE, OFFLINE_CONTEXT_SAMPLE_RATE);
			}
		} else {
			// Safari
			if (!offline) {
				this.context = new (window as any).webkitAudioContext;
			} else {
				this.context = new (window as any).webkitOfflineAudioContext(2, offline.duration * OFFLINE_CONTEXT_SAMPLE_RATE, OFFLINE_CONTEXT_SAMPLE_RATE);
			}
		}

		this.masterGain = this.context.createGain();
		this.masterGain.gain.value = 1;
		this.masterGain.connect(this.context.destination);

		this.soundGain = this.context.createGain();
		this.soundGain.gain.value = 0; // These values will be overwritten by the options anyway
		this.soundGain.connect(this.masterGain);

		this.musicGain = this.context.createGain();
		this.musicGain.gain.value = 0;
		this.musicGain.connect(this.masterGain);

		if (!offline) this.updateVolumes();

		window.onfocus = () => {
			if (Util.isTouchDevice) this.masterGain.gain.value = 1;
		};
		window.onblur = () => {
			// If we're on a touch device, mute the site when we blur it
			if (Util.isTouchDevice) this.masterGain.gain.value = 0;
		};
	}

	setAssetPath(path: string) {
		this.assetPath = path;
	}

	toFullPath(path: string) {
		let fullPath = this.assetPath + path;
		return fullPath;
	}

	/** Loads an audio buffer from a path. Returns the cached version whenever possible. */
	async loadBuffer(path: string) {
		let fullPath = this.toFullPath(path);

		// If there's a current level, see if there's a sound file for this path contained in it
		let mission = state.level?.mission;
		let zipFile: JSZip.JSZipObject;
		if (mission && mission.zipDirectory && mission.zipDirectory.files['data/sound/' + path]) {
			zipFile = mission.zipDirectory.files['data/sound/' + path];
		} else {
			// Return the cached version if there is one
			await audioBufferCachePromises.get(fullPath);
			if (audioBufferCache.has(fullPath)) return audioBufferCache.get(fullPath);
		}

		let promise = (async () => {
			let blob = zipFile? await zipFile.async('blob') : await ResourceManager.loadResource(fullPath);
			let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(blob);
			let audioBuffer: AudioBuffer;

			if (path.endsWith('.ogg') && Util.isSafari()) {
				// Safari can't deal with .ogg. Apparently Firefox can't deal with some of them either??
				audioBuffer = await oggDecoder.decodeOggData(arrayBuffer);
			} else if (window.AudioContext) {
				try {
					// Since decoding an ArrayBuffer detaches it, but we might need it later in this function, we need
					// to clone the buffer here.
					let clonedBuffer = arrayBuffer.slice(0, arrayBuffer.byteLength);
					audioBuffer = await this.context.decodeAudioData(clonedBuffer);
				} catch (e) {
					// Firefox should hit this case sometimes
					audioBuffer = await oggDecoder.decodeOggData(arrayBuffer);
				}
			} else {
				audioBuffer = await new Promise((res, rej) => {
					this.context.decodeAudioData(
						arrayBuffer,
						buff => res(buff),
						err => rej(err)
					);
				});
			}

			audioBufferCache.set(fullPath, audioBuffer);
			audioBufferCachePromises.delete(fullPath);

			return audioBuffer;
		})();

		if (!zipFile) audioBufferCachePromises.set(fullPath, promise);
		return promise;
	}

	loadBuffers(paths: string[]) {
		return Promise.all(paths.map((path) => this.loadBuffer(path)));
	}

	/**
	 * Creates an audio source.
	 * @param path The path of the audio resource. If it's an array, a random one will be selected.
	 * @param destination The destination node of the audio.
	 * @param position Optional: The position of the audio source in 3D space.
	 * @param preferStreaming If true, uses a normal <audio> element instead of play the audio as quickly as possible.
	 */
	createAudioSource(path: string | string[], destination = this.soundGain, position?: Vector3, preferStreaming = false) {
		let chosenPath = (typeof path === "string")? path : Util.randomFromArray(path);
		let fullPath = this.toFullPath(chosenPath);
		let audioSource: AudioSource;

		if (chosenPath.endsWith('.ogg') && Util.isSafari()) preferStreaming = false; // We can't

		if (preferStreaming) {
			if (audioBufferCache.has(fullPath)) {
				// We already got the buffer, prefer that over streaming
				preferStreaming = false;
			} else {
				let audioElement = new Audio();
				audioElement.src = fullPath;
				audioElement.preload = 'auto';
				audioSource = new AudioSource(this, audioElement, destination, position);
			}
		}
		if (!preferStreaming) {
			let bufferPromise = this.loadBuffer(chosenPath);
			audioSource = new AudioSource(this, bufferPromise, destination, position);
		}

		if (position) {
			// Mute the sound by default to avoid any weird audible artifacts.
			audioSource.gain.gain.setValueAtTime(0, this.currentTime);
		}

		this.audioSources.push(audioSource);
		return audioSource;
	}

	/** Utility method for creating an audio source and playing it immediately. */
	play(path: string | string[], volume = 1, destination = this.soundGain, position?: Vector3) {
		let audioSource = this.createAudioSource(path, destination, position);
		audioSource.gain.gain.setValueAtTime(position? 0 : volume, this.currentTime);
		audioSource.play();
	}

	/** Updates the pan and volume of positional audio sources based on the listener's location. */
	updatePositionalAudio(time: TimeState, listenerPos: Vector3, listenerYaw: number) {
		let quat = state.level.getOrientationQuat(time);
		quat.conjugate();

		for (let source of this.audioSources) {
			if (!source.position) continue;

			// Get the relative position of the audio source from the listener's POV
			let relativePosition = source.position.clone().sub(listenerPos);
			relativePosition.applyQuaternion(quat);
			relativePosition.applyAxisAngle(new Vector3(0, 0, 1), -listenerYaw);
			relativePosition.normalize();
			relativePosition.z = 0;

			let distance = source.position.distanceTo(listenerPos);
			let panRemoval = Util.clamp(distance / 1, 0, 1); // If the listener is very close to the center, start moving the audio source to the center.

			source.setPannerValue(-relativePosition.y * 0.7 * panRemoval);
			source.gain.gain.setValueAtTime(Util.clamp(1 - distance / 30, 0, 1) * source.gainFactor, this.currentTime);
		}
	}

	updateVolumes() {
		// Quadratic because it feels better
		this.musicGain.gain.linearRampToValueAtTime(StorageManager.data.settings.musicVolume ** 2, this.currentTime + 0.01);
		this.soundGain.gain.linearRampToValueAtTime(StorageManager.data.settings.soundVolume ** 2, this.currentTime + 0.01);
	}

	stopAllAudio() {
		for (let source of this.audioSources.slice()) {
			source.stop();
		}
	}

	/** Normalizes the volume of positional audio sources based on the sounds around them to prevent the user's permanent loss of hearing. */
	normalizePositionalAudioVolume() {
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
	manager: AudioManager;
	promise: Promise<AudioBuffer | void>;
	destination: AudioNode;
	node: AudioBufferSourceNode | MediaElementAudioSourceNode;
	gain: GainNode;
	panner: StereoPannerNode | PannerNode;
	position: Vector3;
	stopped = false;
	playing = false;
	gainFactor = 1;
	audioElement: HTMLAudioElement;
	loop = false;
	playbackRate = 1;

	constructor(manager: AudioManager, source: Promise<AudioBuffer> | HTMLAudioElement, destination: AudioNode, position?: Vector3) {
		this.manager = manager;

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

		this.gain = this.manager.context.createGain();

		if (this.manager.context.createStereoPanner)
			this.panner = this.manager.context.createStereoPanner();
		else
			this.panner = this.manager.context.createPanner();
		this.gain.connect(this.panner);
		this.panner.connect(this.destination);

		if (source instanceof Promise) {
			this.node = this.manager.context.createBufferSource();
		} else {
			this.node = (this.manager.context as AudioContext).createMediaElementSource(source);
		}

		this.node.connect(this.gain);
	}

	setPannerValue(value: number) {
		if (this.manager.context.createStereoPanner) {
			(this.panner as StereoPannerNode).pan.setValueAtTime(value, this.manager.currentTime);
		} else {
			// https://stackoverflow.com/a/59545726
			(this.panner as PannerNode).panningModel = 'equalpower';
			(this.panner as PannerNode).setPosition(value, 0, 1 - Math.abs(value)); // Can't schedule it
		}
	}

	setLoop(loop: boolean) {
		if (this.audioElement) this.audioElement.loop = loop;
		else (this.node as AudioBufferSourceNode).loop = loop;
		this.loop = loop;
	}

	setPlaybackRate(playbackRate: number) {
		if (this.audioElement) this.audioElement.playbackRate = playbackRate;
		else (this.node as AudioBufferSourceNode).playbackRate.setValueAtTime(playbackRate, this.manager.currentTime);
		this.playbackRate = playbackRate;
	}

	async play() {
		if (this.playing) return;

		if (this.stopped) {
			this.stopped = false;

			if (this.node instanceof AudioBufferSourceNode) {
				// Gotta recreate this stuff
				this.node = this.manager.context.createBufferSource();
				this.node.connect(this.gain);
				this.node.loop = this.loop;
				this.node.playbackRate.setValueAtTime(this.playbackRate, this.manager.currentTime);
				this.stopped = false;
				this.manager.audioSources.push(this);
			}
		}

		let maybeBuffer = await this.promise;
		if (this.stopped) return;

		if (this.node instanceof AudioBufferSourceNode) {
			if (this.node.buffer) return; // Async stuff idk, could happen

			this.node.buffer = maybeBuffer as AudioBuffer;
			this.node.start(this.manager.currentTime);
			this.node.onended = () => {
				this.stop(); // Call .stop for clean-up purposes
			};
		} else {
			this.audioElement?.play();
			this.audioElement?.addEventListener('ended', () => this.stop());
		}

		this.playing = true;
	}

	stop() {
		if (this.stopped) return;

		this.stopped = true;
		this.playing = false;

		try {
			if (this.audioElement) {
				this.audioElement.pause();

				// https://stackoverflow.com/questions/40843798/hide-html5-audio-video-notification-in-android-chrome
				// Okay this doesn't seem to be working actually
				this.audioElement.currentTime = 0;
				this.audioElement.load();
			} else {
				(this.node as AudioBufferSourceNode).stop(this.manager.currentTime);
			}
		} catch (e) {}

		Util.removeFromArray(this.manager.audioSources, this);
	}
}

const oggDecoder = OggdecModule();
export const mainAudioManager = new AudioManager();