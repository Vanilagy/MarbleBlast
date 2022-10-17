import { AudioManager } from "../audio";
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
				}],
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
	}

	static updateOverviewText() {
		let playbackSpeed = Number((this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value) || 1;
		let videoLength = this.tickLength / PHYSICS_TICK_RATE / playbackSpeed;
		let text = `Level: ${this.mission.title}\nVideo duration: ${Util.secondsToTimeString(videoLength, 3)}\nDestination file: ${this.fileHandle? this.fileHandle.name : '–'}`; // Yeah I know, VS Code

		this.overviewText.textContent = text;
	}

	/** Creates a Worker that will be responsible for video encoding and writing to disk - it makes sense to perform these operations in a separate thread. */
	static async createWorker() {
		const body = () => {
			let url: string;
			let webmWriter: WebMWriter;
			let encoder: VideoEncoder;
			let fileWritableStream: FileSystemWritableFileStream;
			let frames: VideoFrame[] = [];

			self.onmessage = async (e: MessageEvent) => {
				if (!url) {
					// The first message received will be the url
					url = e.data;
					self.importScripts(url + 'lib/webm_writer.js');

					self.postMessage('ready');
					return;
				}

				let data = e.data;

				try {
					if (data.command === 'setup') {
						// Set up the writable stream, the WebM writer and video encoder.

						fileWritableStream = await data.fileHandle.createWritable();

						webmWriter = new WebMWriter({
							fileWriter: fileWritableStream,
							codec: 'VP9',
							width: data.width,
							height: data.height
						});

						encoder = new VideoEncoder({
							output: chunk => {
								webmWriter.addFrame(chunk);
								self.postMessage({
									command: 'chunkEncoded',
									timestamp: chunk.timestamp
								});
							},
							error: e => console.error(e)
						});
						encoder.configure({
							codec: "vp09.00.10.08",
							width: data.width,
							height: data.height,
							bitrate: 1000 * data.kilobitRate,
							latencyMode: 'realtime'
						});
					} else if (data.command === 'frame') {
						// Encode a new video frame
						encoder.encode(data.frame);
						data.frame.close();
					} else if (data.command === 'encodeAll') { // Not used atm
						for (let frame of frames) {
							encoder.encode(frame);
							frame.close();
						}
					} else if (data.command === 'finishUp') {
						// Finishes the remaining work

						await encoder.flush();
						encoder.close();

						await webmWriter.complete();
						fileWritableStream.close();

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
		};

		let entire = body.toString();
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

		// Check input validity
		if (!Number.isInteger(width) || width < 1) {
			state.menu.showAlertPopup("Error", `"Width" has to be a positive integer.`);
		}
		if (!Number.isInteger(height) || height < 1) {
			state.menu.showAlertPopup("Error", `"Height" has to be a positive integer.`);
		}
		if (!isFinite(kilobitRate) || kilobitRate < 1) {
			state.menu.showAlertPopup("Error", `"Bit rate" has an illegal value.`);
		}
		if (!isFinite(frameRate) || frameRate <= 0) {
			state.menu.showAlertPopup("Error", `"Frame rate" has to be positive.`);
		}
		if (!isFinite(playbackSpeed) || playbackSpeed <= 0) {
			state.menu.showAlertPopup("Error", `"Playback speed" has to be positive.`);
		}

		// Store config for later reuse
		StorageManager.data.videoRecorderConfig.width = width;
		StorageManager.data.videoRecorderConfig.height = height;
		StorageManager.data.videoRecorderConfig.kilobitRate = kilobitRate;
		StorageManager.data.videoRecorderConfig.frameRate = frameRate;
		StorageManager.data.videoRecorderConfig.playbackSpeed = playbackSpeed;
		StorageManager.data.videoRecorderConfig.fastMode = fastMode;
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
			// Disable all new audio for the time being (to silence the level playback)
			AudioManager.enabled = false;

			// Load the mission and level
			await this.mission.load();
			level = new Level(this.mission, true);
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
				fileHandle: this.fileHandle
			});

			// Bubble worker errors up to this context
			let workerThrew = false;
			worker.addEventListener('message', e => {
				if (e.data.command === 'error') {
					workerThrew = true;
					console.error(e);
				}
			});

			// We use this variable to compute the completion of the encoding process
			let lastChunkTimestamp = 0;
			worker.addEventListener('message', e => {
				if (e.data.command === 'chunkEncoded') lastChunkTimestamp = e.data.timestamp;
			});

			const totalFrames = Math.floor(this.tickLength / PHYSICS_TICK_RATE * frameRate / playbackSpeed);
			const totalTimeUs = 1e6 * totalFrames / frameRate;

			mainRenderer.setSize(width, height);
			mainRenderer.setPixelRatio(1.0);
			level.onResize(width, height, 1.0);

			let compositeCanvas = document.createElement('canvas');
			compositeCanvas.setAttribute('width', width.toString());
			compositeCanvas.setAttribute('height', height.toString());
			let ctx = compositeCanvas.getContext('2d');

			// Now, render all the frames we need
			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.stopped) break; // Abort

				let time = 1000 * frame / frameRate;
				level.render(time * playbackSpeed);

				if (level.stopped) break;

				// Compose together the main game canvas and the HUD canvas
				ctx.drawImage(mainCanvas, 0, 0);
				ctx.drawImage(state.menu.hud.hudCanvas, 0, 0);

				// Create the video frame and send it off to the worker
				let videoFrame = new VideoFrame(compositeCanvas, { timestamp: 1000 * time });
				worker.postMessage({
					command: 'frame',
					frame: videoFrame
				}, [videoFrame] as any);

				this.statusText.textContent = `Rendering frame ${Math.min(frame + 1, totalFrames)}/${totalFrames}`;
				this.progressBar.value = 0.1 + 0.6 * Math.min(frame + 1, totalFrames)/totalFrames; // 10%-70% of the progress bar

				if (!fastMode) {
					// In slow mode, we wait for the frame to be encoded before we begin generating the next frame. This minimizes strain on the hardware and often prevents WebGL context loss.
					await new Promise<void>(resolve => worker.addEventListener('message', function callback(ev) {
						if (ev.data.command !== 'chunkEncoded') return;

						worker.removeEventListener('message', callback);
						resolve();
					}));
				} else {
					// In fast mode, we wait a fixed 16 milliseconds between rendering frames. Rendering any faster has little benefit as we're limited by video encoding speed. Also, we might lose the WebGL context.
					await new Promise<void>(resolve => workerSetTimeout(resolve, 16));
				}

				if (workerThrew) throw new Error("Error in Worker");
				if (mainRenderer.gl.isContextLost()) throw new Error("Context lost");
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
			let lastChunkTimestampAtRenderFinish = lastChunkTimestamp;

			// This interval updates the progress bar based on the encoding completion
			id = setInterval(() => {
				let completion = (lastChunkTimestamp - lastChunkTimestampAtRenderFinish) / (totalTimeUs - lastChunkTimestampAtRenderFinish);
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

			let lostContext = mainRenderer.gl.isContextLost();
			let message: string;

			if (lostContext) {
				// Show a more insightful error message when WebGL context loss was the culprit
				message = `Your WebGL context has been lost during rendering, meaning that your browser thought the rendering task was too taxing on your hardware. Rendering using fast mode might be the cause of this. Please reload the page to restore the context.`;
			} else {
				message = "There has been an error during video rendering.";
			}

			state.menu.showAlertPopup("Rendering failed", message);

			level?.stop();
			state.level = null;
			clearInterval(id);
		} finally {
			worker.terminate();
			AudioManager.enabled = true;
			this.hide();
		}
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
}