import { AudioManager, AudioSource } from "../audio";
import { GameObject } from "./game_object";
import { Interior } from "../interior";
import { Marble } from "../marble";
import { Euler } from "../math/euler";
import { Vector3 } from "../math/vector3";
import { Mission } from "../mission";
import { MissionElementSimGroup, MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import { Shape } from "../shape";
import { StartPad } from "../shapes/start_pad";
import { Trigger } from "../triggers/trigger";
import { Util } from "../util";
import { GameInitter } from "./game_initter";
import { GameRenderer } from "./game_renderer";
import { GameSimulator, GAME_PLAYBACK_SPEED } from "./game_simulator";
import { GameState } from "./game_state";
import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { mainCanvas, resize } from "../ui/misc";
import { hideTouchControls, maybeShowTouchControls, releaseAllButtons } from "../input";
import { state } from "../state";
import { workerClearTimeoutOrInterval, workerSetInterval } from "../worker";

export class Game {
	state: GameState;
	initter: GameInitter;
	simulator: GameSimulator;
	renderer: GameRenderer;

	mission: Mission;

	objects: GameObject[] = [];
	marbles: Marble[] = [];
	interiors: Interior[] = [];
	shapes: Shape[] = [];
	triggers: Trigger[] = [];

	marble: Marble = null;

	totalGems = 0;

	music: AudioSource;
	originalMusicName: string;
	timeTravelSound: AudioSource;
	alarmSound: AudioSource;

	started = false;
	paused = false;
	/** If the game is stopped, it shouldn't be used anymore. */
	stopped = false;

	tickInterval: number;
	lastGameUpdateTime: number = null;

	playerId = 0;

	constructor(mission: Mission) {
		this.mission = mission;

		this.createState();
		this.createInitter();
		this.createSimulator();
		this.createRenderer();
	}

	createState() { this.state = new GameState(this); }
	createInitter() { this.initter = new GameInitter(this); }
	createSimulator() { this.simulator = new GameSimulator(this); }
	createRenderer() { this.renderer = new GameRenderer(this); }

	async init() {
		await this.initter.init();
	}

	async start() {
		if (this.stopped) return;

		this.started = true;

		for (let interior of this.interiors) await interior.onLevelStart();
		for (let shape of this.shapes) await shape.onLevelStart();

		this.state.restart();

		resize(false); // To update renderer
		mainCanvas.classList.remove('hidden');
		maybeShowTouchControls();

		this.onFrame();
		this.tickInterval = workerSetInterval(this.tick.bind(this));
	}

	onFrame() {
		if (this.stopped) return false;
		requestAnimationFrame(this.onFrame.bind(this));

		this.tick();
		this.renderer.render();
	}

	tick(time?: number, gameUpdateRate = GAME_UPDATE_RATE) {
		if (this.stopped) return;
		//if (this.paused) return; // fixme

		if (time === undefined) time = performance.now();

		if (this.lastGameUpdateTime === null) {
			// If there hasn't been a physics tick yet, ensure there is one now
			this.lastGameUpdateTime = time - 1000 / gameUpdateRate * 1.1 / GAME_PLAYBACK_SPEED;
		}

		/** Time in milliseconds since the last physics tick */
		let elapsed = time - this.lastGameUpdateTime;
		elapsed *= GAME_PLAYBACK_SPEED;
		if (elapsed >= 1000) {
			// Cap it
			elapsed = 1000;
			this.lastGameUpdateTime = time - 1000;
		}

		while (elapsed >= 1000 / gameUpdateRate) {
			elapsed -= 1000 / gameUpdateRate;
			this.lastGameUpdateTime += 1000 / gameUpdateRate;

			this.simulator.update();
		}
	}

	onButtonChange() {
		if (!this.started || !document.pointerLockElement || this.paused) return;

		this.marble.controller.onButtonsChange();
	}

	onMouseMove(e: MouseEvent) {
		if (!this.started || !document.pointerLockElement || this.paused) return;

		this.marble.controller.onMouseMove(e);
	}

	/** Pauses the game. */
	pause() {
		if (this.paused/* || (state.level.finishTime && state.level.replay.mode === 'record')*/) return; // fixme

		document.exitPointerLock?.();
		releaseAllButtons(); // Safety measure to prevent keys from getting stuck
		state.menu.pauseScreen.show();
		hideTouchControls();

		this.paused = true;
	}

	/** Unpauses the game. */
	unpause() {
		this.paused = false;
		if (!Util.isTouchDevice) Util.requestPointerLock();
		state.menu.pauseScreen.hide();
		maybeShowTouchControls();

		this.lastGameUpdateTime = performance.now();
	}

	/** Ends the level irreversibly. */
	stop() {
		this.stopped = true;
		workerClearTimeoutOrInterval(this.tickInterval);
		this.dispose();

		this.music.stop();
		for (let object of this.objects) object.stop();

		AudioManager.stopAllAudio();
	}

	/** Stops and destroys the current level and returns back to the menu. */
	stopAndExit() {
		this.stop();
		state.game = null;
		mainCanvas.classList.add('hidden');

		state.menu.pauseScreen.hide();
		state.menu.levelSelect.show();
		state.menu.levelSelect.displayBestTimes(); // Potentially update best times having changed
		state.menu.finishScreen.hide();
		state.menu.hideGameUi();
		state.menu.show();

		document.exitPointerLock?.();
	}

	dispose() {
		this.renderer.dispose();
		for (let marble of this.marbles) marble.dispose();
	}
}