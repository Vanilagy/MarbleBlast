import { Level, PHYSICS_TICK_RATE } from "../level";
import { Mission } from "../mission";
import { Replay } from "../replay";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { workerSetTimeout } from "../worker";
import { mainCanvas, mainRenderer } from "./misc";

export abstract class VideoRenderer {
	static div: HTMLDivElement;
	static configContainer: HTMLDivElement;
	static selectDestinationButton: HTMLButtonElement;
	static overviewText: HTMLParagraphElement;
	static renderButton: HTMLButtonElement;
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
		this.progressBar = this.div.querySelector('#video-renderer progress');
		this.statusText = this.div.querySelector('#video-renderer-status');

		this.selectDestinationButton.addEventListener('click', async () => {
			let fileHandle = await window.showSaveFilePicker({
				startIn: 'videos',
				suggestedName: 'myRender.webm',
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
				this.stopRender();
			} else {
				this.render();
			}
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
						encoder.encode(data.frame);
						data.frame.close();
					} else if (data.command === 'encodeAll') { // Not used atm
						for (let frame of frames) {
							encoder.encode(frame);
							frame.close();
						}
					} else if (data.command === 'finishUp') {
						await encoder.flush();
						encoder.close();

						await webmWriter.complete();
						fileWritableStream.close();

						self.postMessage('done');
					}
				} catch (e) {
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
		let width = Number((this.div.querySelectorAll('._config-row')[0].children[1] as HTMLInputElement).value);
		let height = Number((this.div.querySelectorAll('._config-row')[1].children[1] as HTMLInputElement).value);
		let kilobitRate = Number((this.div.querySelectorAll('._config-row')[2].children[1] as HTMLInputElement).value);
		let frameRate = Number((this.div.querySelectorAll('._config-row')[3].children[1] as HTMLInputElement).value);
		let playbackSpeed = Number((this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value);
		let fastMode = (this.div.querySelectorAll('._config-row')[5].children[1] as HTMLInputElement).checked;

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

		StorageManager.data.videoRecorderConfig.width = width;
		StorageManager.data.videoRecorderConfig.height = height;
		StorageManager.data.videoRecorderConfig.kilobitRate =kilobitRate;
		StorageManager.data.videoRecorderConfig.frameRate = frameRate;
		StorageManager.data.videoRecorderConfig.playbackSpeed = playbackSpeed;
		StorageManager.data.videoRecorderConfig.fastMode = fastMode;
		StorageManager.store();

		this.configContainer.classList.add('disabled');
		this.progressBar.style.display = 'block';
		this.renderButton.textContent = 'Stop';

		let level: Level;

		let id = setInterval(() => {
			let completion = Math.min(level?.getLoadingCompletion() ?? 0, 1);

			this.progressBar.value = completion * 0.1;
			this.statusText.textContent = `Loading (${Math.floor(completion * 100)}%)`;

			if (completion >= 1) clearInterval(id);
		}, 16);

		let worker = await this.createWorker();

		try {
			await this.mission.load();
			level = new Level(this.mission, true);
			state.level = level;
			await level.init();
			level.replay = this.replay;
			this.replay.level = level;
			this.replay.mode = 'playback';

			await level.start();

			worker.postMessage({
				command: 'setup',
				width,
				height,
				kilobitRate,
				fileHandle: this.fileHandle
			});

			// Bubble worker errors up to this context
			worker.addEventListener('message', e => {
				if (e.data.command === 'error') throw new Error(e.data.error);
			});

			let lastChunkTimestamp = 0;
			worker.addEventListener('message', e => {
				if (e.data.command === 'chunkEncoded') lastChunkTimestamp = e.data.timestamp;
			});

			const totalFrames = Math.floor(this.tickLength / PHYSICS_TICK_RATE * frameRate / playbackSpeed);
			const totalTimeUs = 1e6 * totalFrames / frameRate;

			mainRenderer.setSize(width, height);
			mainRenderer.setPixelRatio(1.0);
			level.onResize(width, height);

			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.stopped) break;

				let time = 1000 * frame / frameRate;
				level.render(time * playbackSpeed);

				if (level.stopped) break;

				let videoFrame = new VideoFrame(mainCanvas, { timestamp: 1000 * time });
				worker.postMessage({
					command: 'frame',
					frame: videoFrame
				}, [videoFrame] as any);

				this.statusText.textContent = `Rendering frame ${Math.min(frame + 1, totalFrames)}/${totalFrames}`;
				this.progressBar.value = 0.1 + 0.6 * Math.min(frame + 1, totalFrames)/totalFrames;

				if (!fastMode) {
					await new Promise<void>(resolve => worker.addEventListener('message', function callback(ev) {
						if (ev.data.command !== 'chunkEncoded') return;

						worker.removeEventListener('message', callback);
						resolve();
					}));
				} else {
					await new Promise<void>(resolve => workerSetTimeout(resolve, 16));
				}
			}

			level.stop();
			state.level = null;

			if (this.stopped) {
				worker.terminate();
				return;
			}

			worker.postMessage({
				command: 'finishUp'
			});

			let lastChunkTimestampAtRenderFinish = lastChunkTimestamp;

			id = setInterval(() => {
				let completion = (lastChunkTimestamp - lastChunkTimestampAtRenderFinish) / (totalTimeUs - lastChunkTimestampAtRenderFinish);
				this.statusText.textContent = `Encoding (${(100 * completion).toFixed(1)}%)`;
				this.progressBar.value = 0.7 + 0.3 * completion;
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

			this.hide();
			state.menu.showAlertPopup("Rendering complete", "The replay has been successfully rendered to the specified destination video file.");
		} catch (e) {
			console.error(e);

			let lostContext = mainRenderer.gl.isContextLost();
			let message: string;

			this.hide();
			if (lostContext) {
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
		}
	}

	static async stopRender() {
		if (!(await state.menu.showConfirmPopup('Stop rendering', "Are you sure you want to cancel the ongoing rendering process?"))) {
			return;
		}

		this.stopped = true;
		this.hide();
	}

	static show(mission: Mission, replay: Replay) {
		this.div.classList.remove('hidden');
		state.menu.levelSelect.hide();
		this.stopped = false;

		this.mission = mission;
		this.replay = replay;

		let tickLength = replay.marblePositions.length;
		if (replay.finishTime) {
			tickLength = Math.min(tickLength, replay.finishTime.tickIndex + 2 * PHYSICS_TICK_RATE);
		}
		this.tickLength = tickLength;

		this.updateOverviewText();

		if (!this.loaded) {
			this.loaded = true;

			let playbackSpeedString = StorageManager.data.videoRecorderConfig.playbackSpeed.toString();
			if (!playbackSpeedString.includes('.')) playbackSpeedString += '.0';

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
	}
}