import { OFFLINE_CONTEXT_SAMPLE_RATE } from "../audio";
import { Level, PHYSICS_TICK_RATE } from "../level";
import { Mission } from "../mission";
import { Replay } from "../replay";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { workerSetTimeout } from "../worker";
import { mainCanvas, mainRenderer } from "./misc";

/** Handles rendering replays into playable video files. */
export abstract class VideoRenderer {
	static div: HTMLDivElement;
	static configContainer: HTMLDivElement;
	static selectDestinationButton: HTMLButtonElement;
	static overviewText: HTMLParagraphElement;
	static renderButton: HTMLButtonElement;
	static closeButton: HTMLButtonElement;
	static progressBar: HTMLProgressElement;
	static statusText: HTMLParagraphElement;

	static loaded = false;
	static mission: Mission;
	static replay: Replay;
	static tickLength: number;
	static fileHandle: FileSystemFileHandle;
	static stopped = false;

	static {
		this.div = document.querySelector('#video-renderer');
		this.configContainer = this.div.querySelector('._config');
		this.selectDestinationButton = this.div.querySelector('#video-renderer-select-destination');
		this.overviewText = this.div.querySelector('#video-renderer-overview');
		this.renderButton = this.div.querySelector('#video-renderer-render');
		this.closeButton = this.div.querySelector('#video-renderer-close');
		this.progressBar = this.div.querySelector('#video-renderer progress');
		this.statusText = this.div.querySelector('#video-renderer-status');

		this.selectDestinationButton.addEventListener('click', async () => {
			let suggestedFilename = Util.removeSpecialChars(this.mission.title.toLowerCase().split(' ').map(x => Util.uppercaseFirstLetter(x)).join(''));
			let fileHandle = await window.showSaveFilePicker({
				startIn: 'videos',
				suggestedName: `${suggestedFilename}.webm`,
				types: [{
					description: 'Video File',
					accept: {'video/webm' :['.webm']}
				}]
			} as any);
			this.fileHandle = fileHandle;

			this.updateOverviewText();
			this.renderButton.classList.remove('disabled');
		});

		this.renderButton.addEventListener('click', () => {
			if (this.renderButton.textContent === 'Stop') {
				this.stopRender(false);
			} else {
				this.render();
			}
		});

		this.closeButton.addEventListener('click', () => {
			this.stopRender(true);
		});

		// Update the overview text when the playback speed is modified
		(this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).addEventListener('input', () => {
			this.updateOverviewText();
		});

		(this.div.querySelectorAll('._config-row')[6].children[1] as HTMLInputElement).addEventListener('input', () => {
			this.updateAudioSettingsEnabledness();
		});

		let musicToSoundRatioSlider = this.div.querySelectorAll('._config-row')[8].children[1] as HTMLInputElement;
		musicToSoundRatioSlider.addEventListener('input', () => {
			this.updateMusicToSoundRatioDisplay();
		});
	}

	static updateOverviewText() {
		let playbackSpeed = Number((this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value) || 1;
		let videoLength = this.tickLength / PHYSICS_TICK_RATE / playbackSpeed;
		let text = `Level: ${this.mission.title}\nVideo duration: ${Util.secondsToTimeString(videoLength, 3)}\nDestination file: ${this.fileHandle? this.fileHandle.name : '–'}`; // Yeah I know, VS Code

		this.overviewText.textContent = text;
	}

	static updateMusicToSoundRatioDisplay() {
		let musicToSoundRatioSlider = this.div.querySelectorAll('._config-row')[8].children[1] as HTMLInputElement;
		let musicToSoundRatioDisplay = this.div.querySelectorAll('._config-row')[8].children[2] as HTMLSpanElement;

		// Tan is a fit function for the job, as we want the first half to output values from 0 to 1, and the second value to output values from 1 to infinity. If you take the reciprocal of the second half, it looks like the mirror image of the first half - because tan trig stuff.
		let ratio = Math.tan(Number(musicToSoundRatioSlider.value) * Math.PI / 2);
		if (musicToSoundRatioSlider.value === '0.5') ratio = 1;
		if (musicToSoundRatioSlider.value === '1') ratio = Infinity;

		musicToSoundRatioDisplay.textContent = `${Math.min(Util.cursedRound(ratio, 10), 1)} : ${Math.min(Util.cursedRound(1/ratio, 10), 1)}`;
	}

	static updateAudioSettingsEnabledness() {
		let enabled = (this.div.querySelectorAll('._config-row')[6].children[1] as HTMLInputElement).checked;

		this.div.querySelectorAll('._config-row')[7].classList.toggle('disabled', !enabled);
		this.div.querySelectorAll('._config-row')[8].classList.toggle('disabled', !enabled);
	}

	/** Creates a Worker that will be responsible for video encoding and writing to disk - it makes sense to perform these operations in a separate thread. */
	static async createWorker() {
		let entire = workerBody.toString();
		let bodyString = entire.slice(entire.indexOf("{") + 1, entire.lastIndexOf("}"));
		let blob = new Blob([bodyString]);
		let worker = new Worker(URL.createObjectURL(blob));

		worker.postMessage(window.location.href.slice(0, window.location.href.lastIndexOf('/') + 1));
		await new Promise<void>(resolve => worker.addEventListener('message', e => e.data === 'ready' && resolve()));

		return worker;
	}

	static async render() {
		// Extract the configuration options from the DOM
		let width = Number((this.div.querySelectorAll('._config-row')[0].children[1] as HTMLInputElement).value);
		let height = Number((this.div.querySelectorAll('._config-row')[1].children[1] as HTMLInputElement).value);
		let kilobitRate = Number((this.div.querySelectorAll('._config-row')[2].children[1] as HTMLInputElement).value);
		let frameRate = Number((this.div.querySelectorAll('._config-row')[3].children[1] as HTMLInputElement).value);
		let playbackSpeed = Number((this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value);
		let fastMode = (this.div.querySelectorAll('._config-row')[5].children[1] as HTMLInputElement).checked;

		let includeAudio = (this.div.querySelectorAll('._config-row')[6].children[1] as HTMLInputElement).checked;
		let audioKilobitRate = Number((this.div.querySelectorAll('._config-row')[7].children[1] as HTMLInputElement).value);
		let musicToSoundRatio = Math.tan(Number((this.div.querySelectorAll('._config-row')[8].children[1] as HTMLInputElement).value) * Math.PI / 2);

		// Check input validity
		if (!Number.isInteger(width) || width < 1 || width % 2 !== 0) {
			state.menu.showAlertPopup("Error", `"Width" has to be a positive even integer.`);
			return;
		}
		if (!Number.isInteger(height) || height < 1 || height % 2 !== 0) {
			state.menu.showAlertPopup("Error", `"Height" has to be a positive even integer.`);
			return;
		}
		if (!isFinite(kilobitRate) || kilobitRate < 1) {
			state.menu.showAlertPopup("Error", `"Bit rate" has an illegal value.`);
			return;
		}
		if (!isFinite(frameRate) || frameRate <= 0) {
			state.menu.showAlertPopup("Error", `"Frame rate" has to be positive.`);
			return;
		}
		if (!isFinite(playbackSpeed) || playbackSpeed <= 0) {
			state.menu.showAlertPopup("Error", `"Playback speed" has to be positive.`);
			return;
		}
		if (!isFinite(audioKilobitRate) || audioKilobitRate < 6) {
			state.menu.showAlertPopup("Error", `"Audio bit rate" has to be at least 6 kbit/s.`);
			return;
		}

		// Store config for later reuse
		StorageManager.data.videoRecorderConfig.width = width;
		StorageManager.data.videoRecorderConfig.height = height;
		StorageManager.data.videoRecorderConfig.kilobitRate = kilobitRate;
		StorageManager.data.videoRecorderConfig.frameRate = frameRate;
		StorageManager.data.videoRecorderConfig.playbackSpeed = playbackSpeed;
		StorageManager.data.videoRecorderConfig.fastMode = fastMode;
		StorageManager.data.videoRecorderConfig.includeAudio = includeAudio;
		StorageManager.data.videoRecorderConfig.audioKilobitRate = audioKilobitRate;
		StorageManager.data.videoRecorderConfig.musicToSoundRatio = musicToSoundRatio;
		StorageManager.store();

		this.configContainer.classList.add('disabled');
		this.progressBar.style.display = 'block';
		this.renderButton.textContent = 'Stop';
		this.closeButton.style.display = 'none';

		let level: Level;

		// This interval updates the progress bar as the level loads
		let id = setInterval(() => {
			let completion = Math.min(level?.getLoadingCompletion() ?? 0, 1);

			this.progressBar.value = completion * 0.1; // First 10% of the progress bar
			this.statusText.textContent = `Loading (${Math.floor(completion * 100)}%)`;

			if (completion >= 1) clearInterval(id);
		}, 16);

		// Create the worker which will handle video encoding for us
		let worker = await this.createWorker();

		try {
			// Load the mission and level
			await this.mission.load();
			level = new Level(this.mission, {
				duration: this.tickLength/PHYSICS_TICK_RATE,
				musicVolume: Math.min(musicToSoundRatio, 1),
				soundVolume: Math.min(1/musicToSoundRatio, 1)
			});
			state.level = level;
			await level.init();
			level.replay = this.replay;
			this.replay.level = level;
			this.replay.mode = 'playback';

			await level.start();

			// Set up the worker with necessary information
			worker.postMessage({
				command: 'setup',
				width,
				height,
				kilobitRate,
				frameRate,
				includeAudio,
				audioKilobitRate,
				fileHandle: this.fileHandle
			});

			// Bubble worker errors up to this context
			worker.addEventListener('message', e => {
				if (e.data.command === 'error') {
					console.error(e);

					level?.stop();
					clearInterval(id);
					this.exitWithError();
				}
			});

			// We use these variables to compute the completion of the encoding process
			let lastVideoChunkTimestamp = 0;
			let lastAudioChunkTimestamp = includeAudio ? 0 : Infinity;
			worker.addEventListener('message', e => {
				if (e.data.command === 'videoChunkEncoded') lastVideoChunkTimestamp = e.data.timestamp;
				else if (e.data.command === 'audioChunkEncoded') lastAudioChunkTimestamp = e.data.timestamp;
			});

			const totalFrames = Math.floor(this.tickLength / PHYSICS_TICK_RATE * frameRate / playbackSpeed);
			const totalTimeUs = 1e6 * totalFrames / frameRate;

			mainRenderer.setSize(width, height);
			mainRenderer.setPixelRatio(1.0);
			level.onResize(width, height, 1.0);

			let compositeCanvas = document.createElement('canvas');
			compositeCanvas.setAttribute('width', width.toString());
			compositeCanvas.setAttribute('height', height.toString());
			let ctx = compositeCanvas.getContext('2d', { willReadFrequently: true });

			// Now, render all the frames we need
			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.stopped) break; // Abort

				let time = 1000 * frame / frameRate;
				level.render(time * playbackSpeed);

				if (level.stopped) break;

				// Compose together the main game canvas and the HUD canvas
				ctx.drawImage(mainCanvas, 0, 0);
				ctx.drawImage(state.menu.hud.hudCanvas, 0, 0);

				let imageBuffer = ctx.getImageData(0, 0, width, height).data.buffer;
				worker.postMessage({
					command: 'videoData',
					data: imageBuffer,
					timestamp: 1000 * time
				}, [imageBuffer]);

				this.statusText.textContent = `Rendering frame ${Math.min(frame + 1, totalFrames)}/${totalFrames}`;
				this.progressBar.value = 0.1 + 0.6 * Math.min(frame + 1, totalFrames)/totalFrames; // 10%-70% of the progress bar

				if (!fastMode) {
					// In slow mode, we wait for the frame to be encoded before we begin generating the next frame. This minimizes strain on the hardware and often prevents WebGL context loss.
					await new Promise<void>(resolve => worker.addEventListener('message', function callback(ev) {
						if (ev.data.command !== 'videoChunkEncoded') return;

						worker.removeEventListener('message', callback);
						resolve();
					}));
				} else {
					// In fast mode, we wait a fixed 16 milliseconds between rendering frames. Rendering any faster has little benefit as we're limited by video encoding speed. Also, we might lose the WebGL context.
					await new Promise<void>(resolve => workerSetTimeout(resolve, 16));
				}

				if (mainRenderer.gl.isContextLost()) throw new Error("Context lost");
			}

			if (includeAudio) {
				let audioContext = level.audio.context as OfflineAudioContext;
				let audioBuffer = await audioContext.startRendering();
				let audioData = this.createAudioData(audioBuffer, playbackSpeed);

				worker.postMessage({
					command: 'audioData',
					audioData
				}, [audioData as any]);
			}

			level.stop();
			state.level = null;

			if (this.stopped) {
				worker.terminate();
				return;
			}

			// Tell the worker that we're done sending frames
			worker.postMessage({
				command: 'finishUp'
			});

			// This varibles lets us make it look like encoding started right when the last frame finished rendering, instead of earlier.
			let getMinChunkTimestamp = () => Math.min(lastVideoChunkTimestamp, lastAudioChunkTimestamp);
			let lastChunkTimestampAtRenderFinish = getMinChunkTimestamp();

			// This interval updates the progress bar based on the encoding completion
			id = setInterval(() => {
				let completion = (getMinChunkTimestamp() - lastChunkTimestampAtRenderFinish) / (totalTimeUs - lastChunkTimestampAtRenderFinish);
				this.statusText.textContent = `Encoding (${(100 * completion).toFixed(1)}%)`;
				this.progressBar.value = 0.7 + 0.3 * completion; // Last 30% of the progress bar
			}, 16);

			await new Promise<void>(resolve => worker.addEventListener('message', e => e.data === 'done' && resolve()));
			clearInterval(id);

			if (this.stopped) {
				worker.terminate();
				return;
			}

			this.statusText.textContent = `Finalizing...`;
			this.progressBar.value = 1.0;

			await Util.wait(200); // Fake some work 😂😂😂😂

			state.menu.showAlertPopup("Rendering complete", "The replay has been successfully rendered to the specified destination video file.");
		} catch (e) {
			console.error(e);

			level?.stop();
			clearInterval(id);
			this.exitWithError();
		} finally {
			worker.terminate();
			this.hide();
		}
	}

	/** Creates an AudioData object from a given AudioBuffer. Also linearly resamples the audio signals if the playback speed isn't 1. */
	static createAudioData(audioBuffer: AudioBuffer, playbackSpeed: number) {
		let frameCountPerChannel = Math.floor(audioBuffer.length / playbackSpeed);
		let audioDataData = new Float32Array(frameCountPerChannel * 2);

		if (playbackSpeed === 1) {
			// Fast path
			audioBuffer.copyFromChannel(audioDataData, 0);
			audioBuffer.copyFromChannel(audioDataData.subarray(frameCountPerChannel), 1);
		} else {
			// Linearly resample the audio
			let channelData = [audioBuffer.getChannelData(0), audioBuffer.getChannelData(1)];

			for (let i = 0; i < frameCountPerChannel; i++) {
				let index = i * playbackSpeed;

				for (let j = 0; j < 2; j++) {
					let data = channelData[j];
					let valueLow = data[Math.floor(index)];
					let valueHigh = data[Math.ceil(index)];
					let value = Util.lerp(valueLow, valueHigh, index % 1);

					audioDataData[j*frameCountPerChannel + i] = value;
				}
			}
		}

		let audioData = new AudioData({
			format: 'f32-planar',
			sampleRate: OFFLINE_CONTEXT_SAMPLE_RATE,
			numberOfFrames: frameCountPerChannel,
			numberOfChannels: 2,
			timestamp: 0,
			data: audioDataData
		});

		return audioData;
	}

	static async stopRender(force: boolean) {
		if (!force && !(await state.menu.showConfirmPopup('Stop rendering', "Are you sure you want to cancel the ongoing rendering process?"))) {
			return;
		}

		this.stopped = true;
		this.hide();
	}

	/** Opens the video renderer UI, ready to render the specified `replay`. */
	static show(mission: Mission, replay: Replay) {
		if (!('showSaveFilePicker' in window) || !('VideoEncoder' in window)) {
			state.menu.showAlertPopup("Not supported", "Unfortunately, your browser does not support the technology required by the video renderer. To access this feature, try using Chromium 94 or above (Chrome 94, Edge 94, Opera 80) on desktop.");
			return;
		}

		this.div.classList.remove('hidden');
		state.menu.levelSelect.hide();
		this.stopped = false;

		this.mission = mission;
		this.replay = replay;

		// Compute how many simulation ticks the replay is long
		let tickLength = replay.marblePositions.length;
		if (replay.finishTime) {
			// Cap the replay to last only 2 more seconds after the finish has been reached (theoretically, players can idle in the finish animation by waiting to submit their score)
			let tickIndex = replay.finishTime.tickIndex ?? Math.floor(replay.finishTime.currentAttemptTime * PHYSICS_TICK_RATE / 1000);
			tickLength = Math.min(tickLength, tickIndex + 2 * PHYSICS_TICK_RATE);
		}
		this.tickLength = tickLength;

		this.updateOverviewText();

		if (!this.loaded) {
			this.loaded = true;

			let playbackSpeedString = StorageManager.data.videoRecorderConfig.playbackSpeed.toString();
			if (!playbackSpeedString.includes('.')) playbackSpeedString += '.0';

			// Set the initial values to the ones stored
			(this.div.querySelectorAll('._config-row')[0].children[1] as HTMLInputElement).value = StorageManager.data.videoRecorderConfig.width.toString();
			(this.div.querySelectorAll('._config-row')[1].children[1] as HTMLInputElement).value = StorageManager.data.videoRecorderConfig.height.toString();
			(this.div.querySelectorAll('._config-row')[2].children[1] as HTMLInputElement).value = StorageManager.data.videoRecorderConfig.kilobitRate.toString();
			(this.div.querySelectorAll('._config-row')[3].children[1] as HTMLInputElement).value = StorageManager.data.videoRecorderConfig.frameRate.toString();
			(this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value = playbackSpeedString;
			(this.div.querySelectorAll('._config-row')[5].children[1] as HTMLInputElement).checked = StorageManager.data.videoRecorderConfig.fastMode;

			(this.div.querySelectorAll('._config-row')[6].children[1] as HTMLInputElement).checked = StorageManager.data.videoRecorderConfig.includeAudio;
			(this.div.querySelectorAll('._config-row')[7].children[1] as HTMLInputElement).value = StorageManager.data.videoRecorderConfig.audioKilobitRate.toString();
			(this.div.querySelectorAll('._config-row')[8].children[1] as HTMLInputElement).value = (2 * Math.atan(StorageManager.data.videoRecorderConfig.musicToSoundRatio) / Math.PI).toString();

			this.updateMusicToSoundRatioDisplay();
			this.updateAudioSettingsEnabledness();
		}
	}

	static hide() {
		this.div.classList.add('hidden');
		state.menu.levelSelect.show();

		this.fileHandle = null;
		this.renderButton.classList.add('disabled');
		this.progressBar.style.display = 'none';
		this.progressBar.value = 0;
		this.statusText.textContent = '';
		this.configContainer.classList.remove('disabled');
		this.renderButton.textContent = 'Render';
		this.closeButton.style.display = '';
	}

	static exitWithError() {
		let lostContext = mainRenderer.gl.isContextLost();
		let message: string;

		if (lostContext) {
			// Show a more insightful error message when WebGL context loss was the culprit
			message = `Your WebGL context has been lost during rendering, meaning that your browser thought the rendering task was too taxing on your hardware. Rendering using fast mode might be the cause of this. Please reload the page to restore the context.`;
		} else {
			message = "There has been an error during video rendering.";
		}

		state.menu.showAlertPopup("Rendering failed", message);

		state.level = null;
		this.stopped = true;
	}
}

const workerBody = () => {
	let url: string;
	let webmWriter: WebMWriter;
	let videoEncoder: VideoEncoder;
	let audioEncoder: AudioEncoder;
	let fileWritableStream: FileSystemWritableFileStream;
	let width: number;
	let height: number;
	let lastVideoKeyFrame = -Infinity;

	self.onmessage = async (e: MessageEvent) => {
		if (!url) {
			// The first message received will be the url
			url = e.data;
			self.importScripts(url + 'lib/webm.js');

			self.postMessage('ready');
			return;
		}

		let data = e.data;

		try {
			if (data.command === 'setup') {
				// Set up the writable stream, the WebM writer and video encoder.

				fileWritableStream = await data.fileHandle.createWritable();
				width = data.width;
				height = data.height;

				const audioSampleRate = 48_000;

				webmWriter = new WebMWriter({
					target: fileWritableStream,
					video: {
						codec: 'V_VP9',
						width: data.width,
						height: data.height,
						frameRate: data.frameRate
					},
					audio: (data.includeAudio ? {
						codec: 'A_OPUS',
						numberOfChannels: 2,
						sampleRate: audioSampleRate
					} : undefined)
				});

				videoEncoder = new VideoEncoder({
					output: (chunk, metadata) => {
						webmWriter.addVideoChunk(chunk, metadata);
						if (chunk.type === 'key') {
							lastVideoKeyFrame = Math.max(lastVideoKeyFrame, chunk.timestamp);
						}

						self.postMessage({
							command: 'videoChunkEncoded',
							timestamp: chunk.timestamp
						});
					},
					error: e => console.error(e)
				});
				videoEncoder.configure({
					codec: "vp09.00.10.08",
					width: data.width,
					height: data.height,
					bitrate: 1000 * data.kilobitRate,
					latencyMode: 'realtime'
				});

				if (data.includeAudio) {
					audioEncoder = new AudioEncoder({
						output: (chunk, metadata) => {
							webmWriter.addAudioChunk(chunk, metadata);
							self.postMessage({
								command: 'audioChunkEncoded',
								timestamp: chunk.timestamp
							});
						},
						error: e => console.error(e)
					});
					audioEncoder.configure({
						codec: 'opus',
						numberOfChannels: 2,
						sampleRate: audioSampleRate,
						bitrate: 1000 * data.audioKilobitRate
					});
				}
			} else if (data.command === 'videoData') {
				// Convert RGBA to YUV manually to avoid unwanted color space conversions by the user agent
				let yuv = RGBAToYUV420({ width, height, data: new Uint8ClampedArray(data.data) });
				let videoFrame = new VideoFrame(yuv, {
					format: 'I420',
					codedWidth: width,
					codedHeight: height,
					timestamp: data.timestamp,
					colorSpace: {
						matrix: 'bt709',
						transfer: 'bt709',
						primaries: 'bt709',
						fullRange: false
					}
				});

				// Force a video key frame every five seconds for better seeking
				let needsKeyFrame = videoFrame.timestamp - lastVideoKeyFrame >= 5_000_000;
				if (needsKeyFrame) lastVideoKeyFrame = videoFrame.timestamp;

				// Encode a new video frame
				videoEncoder.encode(videoFrame, { keyFrame: needsKeyFrame });
				videoFrame.close();
			} else if (data.command === 'audioData') {
				audioEncoder.encode(data.audioData);
				data.audioData.close();
			} else if (data.command === 'finishUp') {
				// Finishes the remaining work

				await Promise.all([videoEncoder.flush(), audioEncoder?.flush()]);
				videoEncoder.close();
				audioEncoder?.close();

				webmWriter.finalize();
				await fileWritableStream.close();

				self.postMessage('done');
			}
		} catch (e) {
			// Bubble up the error
			self.postMessage({
				command: 'error',
				error: e
			});
		}
	};

	/** Converts RGBA image data into Y'UV 4:2:0 using the BT.709 color space. Width and height have to be even. */
	const RGBAToYUV420 = ({ width, height, data }: { width: number, height: number, data: Uint8ClampedArray }) => {
		let yuv = new Uint8Array(width * height * 1.5);

		// Using loop tiling as a cache optimization
		const tileSize = 64;
		for (let y0 = 0; y0 < height; y0 += tileSize) {
			for (let x0 = 0; x0 < width; x0 += tileSize) {
				let limitX = Math.min(width, x0 + tileSize);
				let limitY = Math.min(height, y0 + tileSize);

				for (let y = y0; y < limitY; y++) {
					for (let x = x0; x < limitX; x++) {
						let R = data[4*(y*width + x) + 0];
						let G = data[4*(y*width + x) + 1];
						let B = data[4*(y*width + x) + 2];

						// Uses the matrix given in https://en.wikipedia.org/wiki/YCbCr#ITU-R_BT.709_conversion, then adds 128 to the chroma channels, then remaps full range to the condensed, broadcast range (also explained in that article). This entire transformation is condensed into a single matrix, used here:
						let Y = 0.182586*R + 0.614231*G + 0.0620071*B + 16;
						let U = -0.100668*R - 0.338547*G + 0.439216*B + 128.439;
						let V = 0.439216*R - 0.398984*G - 0.0426039*B + 128.439;

						yuv[y*width + x] = Y;

						if (x % 2 === 0 && y % 2 === 0) {
							yuv[1*width*height + (y*width/4 + x/2)] = U;
							yuv[1.25*width*height + (y*width/4 + x/2)] = V;
						}
					}
				}
			}
		}

		return yuv;
	};
};