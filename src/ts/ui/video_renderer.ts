import { OFFLINE_CONTEXT_SAMPLE_RATE } from "../audio";
import { GO_TIME, Level, PHYSICS_TICK_RATE } from "../level";
import { Mission } from "../mission";
import { MissionLibrary } from "../mission_library";
import { Replay } from "../replay";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { workerSetTimeout } from "../worker";
import { mainCanvas, mainRenderer } from "./misc";

interface CompilationManifest {
	schedule: ({
		type: 'replay',
		filename: string,
		runner?: string,
		replay?: Replay,
		mission?: Mission
	} | {
		type: 'sectionStart',
		name: string
	} | {
		type: 'sectionEnd',
		name: string
	})[],
	runners?: {
		name: string,
		id: string,
		marbleTexture?: string,
		reflectiveMarble?: boolean
	}[],
	showInfo?: boolean,
	outputFilename?: string,
	chaptersFilename?: string
}

type ReplayEntry = CompilationManifest['schedule'][number] & { type: 'replay' };

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
	static compilationLoadingElement: HTMLDivElement;

	static loaded = false;
	static tickLength: number;
	static fileHandle: FileSystemFileHandle;
	static directoryHandle: FileSystemDirectoryHandle;
	static compilation: CompilationManifest = null;
	static process: RenderingProcess = null;
	static chapterFileHandle: FileSystemFileHandle;

	static get isCompilation() {
		return !!this.directoryHandle;
	}

	static {
		this.div = document.querySelector('#video-renderer');
		this.configContainer = this.div.querySelector('._config');
		this.selectDestinationButton = this.div.querySelector('#video-renderer-select-destination');
		this.overviewText = this.div.querySelector('#video-renderer-overview');
		this.renderButton = this.div.querySelector('#video-renderer-render');
		this.closeButton = this.div.querySelector('#video-renderer-close');
		this.progressBar = this.div.querySelector('#video-renderer progress');
		this.statusText = this.div.querySelector('#video-renderer-status');
		this.compilationLoadingElement = this.div.querySelector('#video-renderer-compilation-loading');

		this.selectDestinationButton.addEventListener('click', async () => {
			let mission = (this.compilation.schedule[0] as ReplayEntry).mission;
			let suggestedFilename = Util.removeSpecialChars(mission.title.toLowerCase().split(' ').map(x => Util.uppercaseFirstLetter(x)).join(''));

			try {
				this.fileHandle = await window.showSaveFilePicker({
					startIn: 'videos',
					suggestedName: `${suggestedFilename}.webm`,
					types: [{
						description: 'Video File',
						accept: {'video/webm' :['.webm']}
					}]
				} as any);
			} catch (e) {
				return;
			}

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

		(this.div.querySelectorAll('._config-row')[7].children[1] as HTMLInputElement).addEventListener('input', () => {
			this.updateAudioSettingsEnabledness();
		});

		let musicToSoundRatioSlider = this.div.querySelectorAll('._config-row')[9].children[1] as HTMLInputElement;
		musicToSoundRatioSlider.addEventListener('input', () => {
			this.updateMusicToSoundRatioDisplay();
		});
	}

	static updateOverviewText() {
		let playbackSpeed = Number((this.div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value) || 1;
		let videoLength = this.tickLength / PHYSICS_TICK_RATE / playbackSpeed; // Somewhat approximate since it doesn't factor in FPS
		let text = `Video duration: ${Util.secondsToTimeString(videoLength, 3)}\nDestination file: ${this.fileHandle? this.fileHandle.name : '–'}`; // Yeah I know, VS Code

		if (this.isCompilation) {
			let levelCount = this.compilation.schedule.filter(x => x.type === 'replay').length;
			text = `Levels: ${levelCount}\n` + text;
		} else {
			let mission = (this.compilation.schedule[0] as ReplayEntry).mission;
			text = `Level: ${mission.title}\n` + text;
		}

		this.overviewText.textContent = text;
	}

	static updateMusicToSoundRatioDisplay() {
		let musicToSoundRatioSlider = this.div.querySelectorAll('._config-row')[9].children[1] as HTMLInputElement;
		let musicToSoundRatioDisplay = this.div.querySelectorAll('._config-row')[9].children[2] as HTMLSpanElement;

		// Tan is a fit function for the job, as we want the first half to output values from 0 to 1, and the second value to output values from 1 to infinity. If you take the reciprocal of the second half, it looks like the mirror image of the first half - because tan trig stuff.
		let ratio = Math.tan(Number(musicToSoundRatioSlider.value) * Math.PI / 2);
		if (musicToSoundRatioSlider.value === '0.5') ratio = 1;
		if (musicToSoundRatioSlider.value === '1') ratio = Infinity;

		musicToSoundRatioDisplay.textContent = `${Math.min(Util.cursedRound(ratio, 10), 1)} : ${Math.min(Util.cursedRound(1/ratio, 10), 1)}`;
	}

	static updateAudioSettingsEnabledness() {
		let enabled = (this.div.querySelectorAll('._config-row')[7].children[1] as HTMLInputElement).checked;

		this.div.querySelectorAll('._config-row')[8].classList.toggle('disabled', !enabled);
		this.div.querySelectorAll('._config-row')[9].classList.toggle('disabled', !enabled);
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
		this.process = new RenderingProcess();
		await this.process.run();
		this.hide();
	}

	static async stopRender(force: boolean) {
		if (!force && !(await state.menu.showConfirmPopup('Stop rendering', "Are you sure you want to cancel the ongoing rendering process?"))) {
			return;
		}

		this.process?.stop();
		this.hide();
	}

	static show() {
		this.div.classList.remove('hidden');
		state.menu.levelSelect.hide();
		if (!this.loaded) this.initUiFromStoredConfig();
	}

	/** Opens the video renderer UI, ready to render the specified `replay`. */
	static showForSingleReplay(mission: Mission, replay: Replay) {
		if (!('showSaveFilePicker' in window) || !('VideoEncoder' in window)) {
			this.showNotSupportedAlert();
			return;
		}

		this.show();

		// Create a simple "compilation" that will model recording a single replay with no extra text
		this.compilation = {
			schedule: [{
				type: 'replay',
				filename: null,
				replay,
				mission
			}],
			showInfo: false
		};

		this.computeLength();
		this.updateOverviewText();
		this.selectDestinationButton.style.display = '';
	}

	/** Opens the video renderer UI, ready to render the compilation specified in the given directory.. */
	static async showForCompilation(directoryHandle: FileSystemDirectoryHandle) {
		this.directoryHandle = directoryHandle;

		let compilationManifestFile: FileSystemFileHandle;
		try {
			compilationManifestFile = await directoryHandle.getFileHandle('manifest.json');
		} catch (e) {
			state.menu.showAlertPopup('Missing compilation manifest file', "The selected directory does not contain a manifest.json file, which is required. For a tutorial on how to render compilations, click [here](https://github.com/Vanilagy/MarbleBlast/tree/master/docs/compilation_how_to.md).");
			return;
		}

		this.show();
		this.selectDestinationButton.style.display = 'none';
		this.compilationLoadingElement.classList.remove('hidden');

		try {
			let fileText = await (await compilationManifestFile.getFile()).text();
			this.compilation = JSON.parse(fileText);

			let replayCount = this.compilation.schedule.filter(x => x.type === 'replay').length;

			// Load and check all of the replays
			let i = 0;
			for (let entry of this.compilation.schedule) {
				if (entry.type !== 'replay') continue;

				let loaded = i++ / replayCount;
				this.compilationLoadingElement.textContent = `Loading... (${Math.floor(loaded * 100)}%)`;

				let arrayBuffer: ArrayBuffer;

				try {
					let replayFile = await directoryHandle.getFileHandle(entry.filename);
					arrayBuffer = await (await replayFile.getFile()).arrayBuffer();
				} catch {
					state.menu.showAlertPopup('Replay file does not exist', `The file "${entry.filename}", which the manifest references, was not found.`);
					this.hide();
					return;
				}

				let replay = Replay.fromSerialized(arrayBuffer);
				let mission = MissionLibrary.allMissions.find(x => x.path === replay.missionPath);
				if (!mission) throw new Error("Mission not found.");

				entry.replay = replay;
				entry.mission = mission;

				if (typeof entry.runner === 'string') {
					let runnerId = entry.runner;
					let runnerDefinition = this.compilation.runners.find(x => x.id === runnerId);
					if (!runnerDefinition) {
						state.menu.showAlertPopup('Runner definition not found', `Runner with ID "${entry.runner}" referenced in the manifest but not defined.`);
						this.hide();
						return;
					}

					if (runnerDefinition.marbleTexture) {
						try {
							await (await VideoRenderer.directoryHandle.getFileHandle(runnerDefinition.marbleTexture)).getFile();
						} catch {
							state.menu.showAlertPopup('Marble texture file not found.', `Texture file "${runnerDefinition.marbleTexture}" was referenced in the manifest but not found.`);
							this.hide();
							return;
						}
					}
				}
			}

			this.fileHandle = await directoryHandle.getFileHandle(this.compilation.outputFilename ?? 'output.webm', { create: true });
			this.chapterFileHandle = await directoryHandle.getFileHandle(this.compilation.chaptersFilename ?? 'chapters.txt', { create: true });

			this.compilationLoadingElement.classList.add('hidden');
			this.renderButton.classList.remove('disabled');
			this.computeLength();
			this.updateOverviewText();
		} catch (e) {
			console.error(e);
			this.hide();
			state.menu.showAlertPopup('Error', "An error occurred while loading the compilation. Your compilation manifest might be malformed - check the web console.");
		}
	}

	static computeTickLengthForReplay(replay: Replay) {
		// Compute how many simulation ticks the replay is long

		let tickLength = replay.marblePositions.length - 1; // The last tick always means the end of the replay, so don't include it
		if (replay.finishTime) {
			// Cap the replay to last only 2 more seconds after the finish has been reached (theoretically, players can idle in the finish animation by waiting to submit their score)
			let tickIndex = replay.finishTime.tickIndex ?? Math.floor(replay.finishTime.currentAttemptTime * PHYSICS_TICK_RATE / 1000);
			tickLength = Math.min(tickLength, tickIndex + 2 * PHYSICS_TICK_RATE);
		}

		return tickLength;
	}

	static computeLength() {
		this.tickLength = 0;

		for (let entry of this.compilation.schedule) {
			if (entry.type !== 'replay') continue;

			let replay = entry.replay;
			this.tickLength += this.computeTickLengthForReplay(replay);
		}
	}

	static initUiFromStoredConfig() {
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
		(this.div.querySelectorAll('._config-row')[6].children[1] as HTMLInputElement).checked = StorageManager.data.videoRecorderConfig.bt709;

		(this.div.querySelectorAll('._config-row')[7].children[1] as HTMLInputElement).checked = StorageManager.data.videoRecorderConfig.includeAudio;
		(this.div.querySelectorAll('._config-row')[8].children[1] as HTMLInputElement).value = StorageManager.data.videoRecorderConfig.audioKilobitRate.toString();
		(this.div.querySelectorAll('._config-row')[9].children[1] as HTMLInputElement).value = (2 * Math.atan(StorageManager.data.videoRecorderConfig.musicToSoundRatio) / Math.PI).toString();

		this.updateMusicToSoundRatioDisplay();
		this.updateAudioSettingsEnabledness();
	}

	static hide() {
		this.div.classList.add('hidden');
		state.menu.levelSelect.show();

		this.directoryHandle = null;
		this.fileHandle = null;
		this.chapterFileHandle = null;
		this.process = null;
		this.compilation = null;
		this.renderButton.classList.add('disabled');
		this.progressBar.style.display = 'none';
		this.progressBar.value = 0;
		this.statusText.textContent = '';
		this.configContainer.classList.remove('disabled');
		this.renderButton.textContent = 'Render';
		this.closeButton.style.display = '';
		this.compilationLoadingElement.classList.add('hidden');
		document.title = 'Marble Blast Web';
	}

	static showNotSupportedAlert() {
		state.menu.showAlertPopup("Not supported", "Unfortunately, your browser does not support the technology required by the video renderer. To access this feature, try using Chromium 94 or above (Chrome 94, Edge 94, Opera 80) on desktop.");
	}
}

class RenderingProcess {
	// Config:
	width: number;
	height: number;
	kilobitRate: number;
	frameRate: number;
	playbackSpeed: number;
	fastMode: boolean;
	bt709: boolean;
	includeAudio: boolean;
	audioKilobitRate: number;
	musicToSoundRatio: number;

	level: Level;
	worker: Worker;
	lastVideoChunkTimestamp: number;
	lastAudioChunkTimestamp: number;
	ctx: CanvasRenderingContext2D;
	renderedFrames = 0;
	totalFrameCount: number;
	totalTimeUs: number;
	levelCount: number;
	renderedLevels = 0;
	intervalId: any;
	stopped = false;
	currentEntry: ReplayEntry;
	wakeLock: WakeLockSentinel;
	chaptersText = "";

	async run() {
		try {
			this.readConfiguration();
			let configValid = this.validateConfiguration();
			if (!configValid) return;
			this.storeConfiguration();

			this.prepareUi();
			await this.createWorker();
			this.setUpWorker();
			await this.keepScreenAwake();

			await this.renderLevels();

			this.initFinalization();

			if (this.stopped) return;

			await this.awaitEncoding();
			await this.finalize();
		} catch (e) {
			console.error(e);
			this.level?.stop();
			clearInterval(this.intervalId);
			this.exitWithError();
		} finally {
			this.worker?.terminate();
			this.releaseWakeLock();
		}
	}

	async renderLevels() {
		for (let entry of VideoRenderer.compilation.schedule) {
			if (entry.type !== 'replay') continue;
			if (this.stopped) break;

			this.currentEntry = entry;
			let { mission, replay } = entry;

			await this.loadLevel(mission, replay);
			this.initRendering();
			await this.renderFrames();
			await this.renderAudio();

			this.level.stop();
			state.level = null;
			replay.level = null; // GC

			this.renderedLevels++;
		}
	}

	readConfiguration() {
		const div = VideoRenderer.div;

		// Video config
		this.width = Number((div.querySelectorAll('._config-row')[0].children[1] as HTMLInputElement).value);
		this.height = Number((div.querySelectorAll('._config-row')[1].children[1] as HTMLInputElement).value);
		this.kilobitRate = Number((div.querySelectorAll('._config-row')[2].children[1] as HTMLInputElement).value);
		this.frameRate = Number((div.querySelectorAll('._config-row')[3].children[1] as HTMLInputElement).value);
		this.playbackSpeed = Number((div.querySelectorAll('._config-row')[4].children[1] as HTMLInputElement).value);
		this.fastMode = (div.querySelectorAll('._config-row')[5].children[1] as HTMLInputElement).checked;
		this.bt709 = (div.querySelectorAll('._config-row')[6].children[1] as HTMLInputElement).checked;

		// Audio config
		this.includeAudio = (div.querySelectorAll('._config-row')[7].children[1] as HTMLInputElement).checked;
		this.audioKilobitRate = Number((div.querySelectorAll('._config-row')[8].children[1] as HTMLInputElement).value);
		this.musicToSoundRatio = Math.tan(Number((div.querySelectorAll('._config-row')[9].children[1] as HTMLInputElement).value) * Math.PI / 2);
	}

	validateConfiguration() {
		if (!Number.isInteger(this.width) || this.width < 1 || this.width % 2 !== 0) {
			state.menu.showAlertPopup("Error", `"Width" has to be a positive even integer.`);
			return false;
		}
		if (!Number.isInteger(this.height) || this.height < 1 || this.height % 2 !== 0) {
			state.menu.showAlertPopup("Error", `"Height" has to be a positive even integer.`);
			return false;
		}
		if (!isFinite(this.kilobitRate) || this.kilobitRate < 1) {
			state.menu.showAlertPopup("Error", `"Bit rate" has an illegal value.`);
			return false;
		}
		if (!isFinite(this.frameRate) || this.frameRate <= 0) {
			state.menu.showAlertPopup("Error", `"Frame rate" has to be positive.`);
			return false;
		}
		if (!isFinite(this.playbackSpeed) || this.playbackSpeed <= 0) {
			state.menu.showAlertPopup("Error", `"Playback speed" has to be positive.`);
			return false;
		}
		if (!isFinite(this.audioKilobitRate) || this.audioKilobitRate < 6) {
			state.menu.showAlertPopup("Error", `"Audio bit rate" has to be at least 6 kbit/s.`);
			return false;
		}

		return true;
	}

	storeConfiguration() {
		StorageManager.data.videoRecorderConfig.width = this.width;
		StorageManager.data.videoRecorderConfig.height = this.height;
		StorageManager.data.videoRecorderConfig.kilobitRate = this.kilobitRate;
		StorageManager.data.videoRecorderConfig.frameRate = this.frameRate;
		StorageManager.data.videoRecorderConfig.playbackSpeed = this.playbackSpeed;
		StorageManager.data.videoRecorderConfig.fastMode = this.fastMode;
		StorageManager.data.videoRecorderConfig.bt709 = this.bt709;
		StorageManager.data.videoRecorderConfig.includeAudio = this.includeAudio;
		StorageManager.data.videoRecorderConfig.audioKilobitRate = this.audioKilobitRate;
		StorageManager.data.videoRecorderConfig.musicToSoundRatio = this.musicToSoundRatio;
		StorageManager.store();
	}

	computeFrameCountForReplay(replay: Replay) {
		return Math.floor(VideoRenderer.computeTickLengthForReplay(replay) / PHYSICS_TICK_RATE * this.frameRate / this.playbackSpeed);
	}

	prepareUi() {
		VideoRenderer.configContainer.classList.add('disabled');
		VideoRenderer.progressBar.style.display = 'block';
		VideoRenderer.renderButton.textContent = 'Stop';
		VideoRenderer.closeButton.style.display = 'none';

		let replayEntries = VideoRenderer.compilation.schedule.filter(x => x.type === 'replay') as ReplayEntry[];

		this.totalFrameCount = replayEntries.reduce((acc, entry) => acc + this.computeFrameCountForReplay(entry.replay), 0);
		this.totalTimeUs = 1e6 * this.totalFrameCount / this.frameRate;
		this.levelCount = replayEntries.length;
	}

	async createWorker() {
		let entire = workerBody.toString();
		let bodyString = entire.slice(entire.indexOf("{") + 1, entire.lastIndexOf("}"));
		let blob = new Blob([bodyString]);
		let worker = new Worker(URL.createObjectURL(blob));

		worker.postMessage(window.location.href.slice(0, window.location.href.lastIndexOf('/') + 1));
		await new Promise<void>(resolve => worker.addEventListener('message', e => e.data === 'ready' && resolve()));

		this.worker = worker;
	}

	async loadLevel(mission: Mission, replay: Replay) {
		this.beginUpdatingUiBasedOnLoadingProgress();

		await mission.load();

		this.level = new Level(mission, {
			duration: this.computeFrameCountForReplay(replay) / this.frameRate * this.playbackSpeed,
			musicVolume: Math.min(this.musicToSoundRatio, 1),
			soundVolume: Math.min(1/this.musicToSoundRatio, 1),
			...await this.getMarbleConfigForCurrentRunner()
		});
		state.level = this.level;
		await this.level.init();

		this.level.replay = replay;
		replay.level = this.level;
		replay.mode = 'playback';

		await this.level.start();

		clearInterval(this.intervalId);
	}

	async getMarbleConfigForCurrentRunner() {
		let marbleTexture: Blob;
		let reflectiveMarble: boolean;
		if (typeof this.currentEntry.runner === 'string') {
			let runner = VideoRenderer.compilation.runners.find(x => x.id === this.currentEntry.runner);
			let marbleTextureFilename = runner.marbleTexture;
			if (marbleTextureFilename) {
				marbleTexture = await (await VideoRenderer.directoryHandle.getFileHandle(marbleTextureFilename)).getFile();
			} else if (marbleTextureFilename === null) {
				marbleTexture = null;
			}
			reflectiveMarble = runner.reflectiveMarble;
		}

		return { marbleTexture, reflectiveMarble };
	}

	beginUpdatingUiBasedOnLoadingProgress() {
		this.intervalId = setInterval(() => {
			let completion = Math.min(this.level?.getLoadingCompletion() ?? 0, 1);

			VideoRenderer.progressBar.value = (this.renderedLevels + completion * 0.1) / this.levelCount;
			VideoRenderer.progressBar.value *= 0.8;
			VideoRenderer.statusText.textContent = `Loading (${Math.floor(completion * 100)}%)`;
		}, 16);
	}

	setUpWorker() {
		this.worker.postMessage({
			command: 'setup',
			width: this.width,
			height: this.height,
			kilobitRate: this.kilobitRate,
			frameRate: this.frameRate,
			includeAudio: this.includeAudio,
			audioKilobitRate: this.audioKilobitRate,
			fileHandle: VideoRenderer.fileHandle
		});

		// Bubble worker errors up to this context
		this.worker.addEventListener('message', e => {
			if (e.data.command === 'error') {
				console.error(e);

				this.level?.stop();
				clearInterval(this.intervalId);
				this.exitWithError();
			}
		});

		// We use these variables to compute the completion of the encoding process
		this.lastVideoChunkTimestamp = 0;
		this.lastAudioChunkTimestamp = this.includeAudio ? 0 : Infinity;
		this.worker.addEventListener('message', e => {
			if (e.data.command === 'videoChunkEncoded') this.lastVideoChunkTimestamp = e.data.timestamp;
			else if (e.data.command === 'audioChunkEncoded') this.lastAudioChunkTimestamp = e.data.timestamp;
		});
	}

	initRendering() {
		mainRenderer.setSize(this.width, this.height);
		mainRenderer.setPixelRatio(1.0);
		this.level.onResize(this.width, this.height, 1.0);

		let compositeCanvas = document.createElement('canvas');
		compositeCanvas.setAttribute('width', this.width.toString());
		compositeCanvas.setAttribute('height', this.height.toString());
		this.ctx = compositeCanvas.getContext('2d', { willReadFrequently: true });
	}

	async renderFrames() {
		const frameCount = this.computeFrameCountForReplay(this.currentEntry.replay);

		// Now, render all the frames we need
		for (let frame = 0; frame < frameCount; frame++) {
			if (this.stopped) break; // Abort

			let time = 1000 * frame * this.playbackSpeed / this.frameRate;
			this.level.render(time);
			if (this.level.stopped) break;

			this.composeFrame(time);
			this.sendFrameToWorker();
			if (frame === 0) this.appendToChaptersText();

			this.renderedFrames++;
			document.title = `Rendering (${(100 * this.renderedFrames / this.totalFrameCount).toFixed(1)}%) - Marble Blast Web`;
			VideoRenderer.statusText.textContent = `Rendering frame ${Math.min(this.renderedFrames, this.totalFrameCount)}/${this.totalFrameCount}`;
			VideoRenderer.progressBar.value = (this.renderedLevels + 0.1 + 0.9 * Math.min(frame + 1, frameCount)/frameCount) / this.levelCount;
			VideoRenderer.progressBar.value *= 0.8;

			await this.waitBeforeRenderingNextFrame();

			if (mainRenderer.gl.isContextLost()) throw new Error("Context lost");
		}
	}

	composeFrame(time: number) {
		this.ctx.globalAlpha = 1;
		this.ctx.shadowColor = 'transparent';
		this.ctx.shadowBlur = 0;
		this.ctx.shadowOffsetX = 0;
		this.ctx.shadowOffsetY = 0;
		this.ctx.resetTransform();

		// Compose together the main game canvas and the HUD canvas
		this.ctx.drawImage(mainCanvas, 0, 0);
		this.ctx.drawImage(state.menu.hud.hudCanvas, 0, 0);

		this.maybeDrawRunInfo(time);
		this.drawSectionText(time);
	}

	maybeDrawRunInfo(time: number) {
		if (VideoRenderer.compilation.showInfo === false) return;

		let fadeDuration = 1000;
		this.ctx.globalAlpha = 1 - Util.clamp((time - (GO_TIME - fadeDuration)) / fadeDuration, 0, 1);

		if (this.ctx.globalAlpha === 0) return;

		let fontSizeScaling = this.width / 1920;

		let scaleCompletion = 1 - (1 - Util.clamp(time / 500, 0, 1))**2;
		let scale = Util.lerp(1.05, 1, scaleCompletion);
		this.ctx.translate(this.width/2, this.height);
		this.ctx.scale(scale, scale);
		this.ctx.translate(-this.width/2, -this.height);

		// Draw the level name and time
		this.ctx.fillStyle = 'white';
		this.ctx.font = `${64*fontSizeScaling}px Chakra Petch`;
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'top';
		this.ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
		this.ctx.shadowBlur = 4*fontSizeScaling;
		this.ctx.shadowOffsetX = 1*fontSizeScaling;
		this.ctx.shadowOffsetY = 2*fontSizeScaling;
		let text = this.level.mission.title;
		let { replay } = this.currentEntry;
		if (replay.finishTime) text += ' - ' + Util.secondsToTimeString(replay.finishTime.gameplayClock / 1000);
		this.ctx.fillText(text, this.width/2, this.height * 0.73);

		// Maybe draw the runner
		if (typeof this.currentEntry.runner === 'string') {
			let runnerName = VideoRenderer.compilation.runners.find(x => x.id === this.currentEntry.runner).name;
			this.ctx.font = `${48*fontSizeScaling}px Chakra Petch`;
			this.ctx.fillText(`Runner: ${runnerName}`, this.width/2, this.height * 0.8);
		}
	}

	/** Draws the text of all the sections that have ended with this level. */
	drawSectionText(time: number) {
		let replayDuration = 1000 * VideoRenderer.computeTickLengthForReplay(this.currentEntry.replay) / PHYSICS_TICK_RATE;
		let animationTime = time - (replayDuration - 3000);
		let animationCompletion = Util.clamp(animationTime / 500, 0, 1);
		if (animationCompletion === 0) return;

		let schedule = VideoRenderer.compilation.schedule;
		let index = schedule.findIndex(x => x === this.currentEntry) + 1;

		// Find all sections that end with this level
		type SectionEndEntry = CompilationManifest['schedule'][number] & { type: 'sectionEnd' };
		let currentEnds: SectionEndEntry[] = [];
		while (schedule[index] && schedule[index].type === 'sectionEnd') {
			currentEnds.push(schedule[index] as SectionEndEntry);
			index++;
		}

		for (let [i, end] of currentEnds.reverse().entries()) {
			let startIndex = Util.findLastIndex(schedule, x => x.type === 'sectionStart' && x.name === end.name, index - 1);
			if (startIndex === -1) continue;

			let totalTime = 0;
			for (let j = startIndex + 1; j < index; j++) {
				let entry = schedule[j];
				if (entry.type !== 'replay' || !entry.replay.finishTime) continue;
				totalTime += entry.replay.finishTime.gameplayClock;
			}

			let fontSizeScaling = this.width / 1920;
			this.ctx.globalAlpha = animationCompletion;
			this.ctx.fillStyle = 'white';
			this.ctx.font = `${64*fontSizeScaling}px Chakra Petch`;
			this.ctx.textAlign = 'center';
			this.ctx.textBaseline = 'top';
			this.ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
			this.ctx.shadowBlur = 4*fontSizeScaling;
			this.ctx.shadowOffsetX = 1*fontSizeScaling;
			this.ctx.shadowOffsetY = 2*fontSizeScaling;
			this.ctx.fillText(`${end.name}: ${Util.secondsToTimeString(totalTime / 1000)}`, this.width/2, this.height * 0.73 - this.height*0.07 * i);
		}
	}

	sendFrameToWorker() {
		if (this.bt709) {
			let imageBuffer = this.ctx.getImageData(0, 0, this.width, this.height).data.buffer;
			this.worker.postMessage({
				command: 'imageBuffer',
				imageBuffer: imageBuffer
			}, [imageBuffer]);
		} else {
			let frame = new VideoFrame(this.ctx.canvas, { timestamp: 1e6 * this.renderedFrames / this.frameRate });
			this.worker.postMessage({
				command: 'videoFrame',
				videoFrame: frame
			}, [frame as any]);
		}
	}

	appendToChaptersText() {
		let time = this.renderedFrames / this.frameRate;

		this.chaptersText += `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')} - ${this.level.mission.title}`;
		if (typeof this.currentEntry.runner === 'string')
			this.chaptersText += ` | ${VideoRenderer.compilation.runners.find(x => x.id === this.currentEntry.runner).name}`;

		this.chaptersText += '\n';
	}

	async waitBeforeRenderingNextFrame() {
		if (!this.fastMode) {
			// In slow mode, we wait for the frame to be encoded before we begin generating the next frame. This minimizes strain on the hardware and often prevents WebGL context loss.
			await new Promise<void>(resolve => this.worker.addEventListener('message', (ev) => {
				if (ev.data.command === 'videoChunkEncoded') resolve();
			}, { once: true }));
		} else {
			// In fast mode, we wait a fixed 16 milliseconds between rendering frames. Rendering any faster has little benefit as we're limited by video encoding speed. Also, we might lose the WebGL context.
			await new Promise<void>(resolve => workerSetTimeout(resolve, 16));
		}
	}

	async renderAudio() {
		if (this.includeAudio) {
			let audioContext = this.level.audio.context as OfflineAudioContext;
			let audioBuffer = await audioContext.startRendering();
			let audioData = this.createAudioData(audioBuffer, this.playbackSpeed);

			this.worker.postMessage({
				command: 'audioData',
				audioData
			}, [audioData as any]);
		}
	}

	/** Creates an AudioData object from a given AudioBuffer. Also linearly resamples the audio signals if the playback speed isn't 1. */
	createAudioData(audioBuffer: AudioBuffer, playbackSpeed: number) {
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

	initFinalization() {
		if (this.stopped) return;

		// Tell the worker that we're done sending frames
		this.worker.postMessage({
			command: 'finishUp'
		});
	}

	async awaitEncoding() {
		// This varibles lets us make it look like encoding started right when the last frame finished rendering, instead of earlier.
		let getMinChunkTimestamp = () => Math.min(this.lastVideoChunkTimestamp, this.lastAudioChunkTimestamp);
		let lastChunkTimestampAtRenderFinish = getMinChunkTimestamp();

		// This interval updates the progress bar based on the encoding completion
		this.intervalId = setInterval(() => {
			let completion = (getMinChunkTimestamp() - lastChunkTimestampAtRenderFinish) / (this.totalTimeUs - lastChunkTimestampAtRenderFinish);
			VideoRenderer.statusText.textContent = `Encoding (${(100 * completion).toFixed(1)}%)`;
			VideoRenderer.progressBar.value = 0.8 + 0.2 * completion; // Last 20% of the progress bar
		}, 16);

		await new Promise<void>(resolve => this.worker.addEventListener('message', e => e.data === 'closing' && resolve()));
		clearInterval(this.intervalId);
	}

	async finalize() {
		if (this.stopped) return;

		// https://twitter.com/sayhello/status/1256498167593361409
		VideoRenderer.statusText.textContent = 'Writing and checking file... (might take a while)';
		VideoRenderer.progressBar.value = 1;

		await new Promise<void>(resolve => this.worker.addEventListener('message', e => e.data === 'done' && resolve()));

		VideoRenderer.statusText.textContent = `Finalizing...`;
		VideoRenderer.progressBar.value = 1.0;

		if (VideoRenderer.chapterFileHandle) {
			let writable = await VideoRenderer.chapterFileHandle.createWritable();
			await writable.write(this.chaptersText);
			await writable.close();
		}

		await Util.wait(200); // Fake some work 😂😂😂😂

		state.menu.showAlertPopup("Rendering complete", "The replay has been successfully rendered to the specified destination video file.");
	}

	exitWithError() {
		let lostContext = mainRenderer.gl.isContextLost();
		let message: string;

		if (lostContext) {
			// Show a more insightful error message when WebGL context loss was the culprit
			message = `Your WebGL context has been lost during rendering, meaning that your browser thought the rendering task was too taxing on your hardware. Rendering using parallelized encoding might be the cause of this. Please reload the page to restore the context.`;
		} else {
			message = "There has been an error during video rendering.";
		}

		state.menu.showAlertPopup("Rendering failed", message);

		state.level = null;
		this.stopped = true;
	}

	stop() {
		this.stopped = true;
		clearInterval(this.intervalId);
	}

	async keepScreenAwake() {
		if (!('wakeLock' in navigator)) return;

		try {
			this.wakeLock = await navigator.wakeLock.request('screen');
		} catch (e) {}
	}

	releaseWakeLock() {
		this.wakeLock?.release();
	}
}

const workerBody = () => {
	let url: string;
	let muxer: WebMMuxer;
	let videoEncoder: VideoEncoder;
	let audioEncoder: AudioEncoder;
	let fileWritableStream: FileSystemWritableFileStream;
	let width: number;
	let height: number;
	let frameRate: number;
	let lastVideoKeyFrame = -Infinity;

	const onSetup = async (data: {
		fileHandle: FileSystemFileHandle,
		width: number,
		height: number,
		frameRate: number,
		kilobitRate: number,
		includeAudio: boolean
		audioKilobitRate: number
	}) => {
		// Set up the writable stream, the WebM writer and video encoder.

		fileWritableStream = await data.fileHandle.createWritable();
		width = data.width;
		height = data.height;
		frameRate = data.frameRate;

		const audioSampleRate = 48_000;

		muxer = new WebMMuxer({
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
				muxer.addVideoChunk(chunk, metadata);
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
					muxer.addAudioChunk(chunk, metadata);
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
	};

	let nextTimestamp = 0;
	const onImageBuffer = (data: {
		imageBuffer: ArrayBuffer
	}) => {
		// Convert RGBA to YUV manually to avoid unwanted color space conversions by the user agent
		let yuv = RGBAToYUV420({ width, height, data: new Uint8ClampedArray(data.imageBuffer) });
		let videoFrame = new VideoFrame(yuv, {
			format: 'I420',
			codedWidth: width,
			codedHeight: height,
			timestamp: nextTimestamp,
			colorSpace: {
				matrix: 'bt709',
				transfer: 'bt709',
				primaries: 'bt709',
				fullRange: false
			}
		});
		nextTimestamp += 1e6 / frameRate;

		encodeVideoFrame(videoFrame);
	};

	const encodeVideoFrame = (videoFrame: VideoFrame) => {
		// Force a video key frame every five seconds for better seeking
		let needsKeyFrame = videoFrame.timestamp - lastVideoKeyFrame >= 5_000_000;
		if (needsKeyFrame) lastVideoKeyFrame = videoFrame.timestamp;

		// Encode a new video frame
		videoEncoder.encode(videoFrame, { keyFrame: needsKeyFrame });
		videoFrame.close();
	};

	const onAudioData = (data: {
		audioData: AudioData
	}) => {
		audioEncoder.encode(data.audioData);
		data.audioData.close();
	};

	const finishUp = async () => {
		// Finishes the remaining work

		await Promise.all([videoEncoder.flush(), audioEncoder?.flush()]);
		videoEncoder.close();
		audioEncoder?.close();

		muxer.finalize();

		self.postMessage('closing');
		await fileWritableStream.close();

		self.postMessage('done');
	};

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
			if (data.command === 'setup') await onSetup(data);
			else if (data.command === 'imageBuffer') onImageBuffer(data);
			else if (data.command === 'videoFrame') encodeVideoFrame(data.videoFrame);
			else if (data.command === 'audioData') onAudioData(data);
			else if (data.command === 'finishUp') await finishUp();
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