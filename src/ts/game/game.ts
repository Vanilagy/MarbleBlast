import { AudioManager, AudioSource } from "../audio";
import { Entity } from "./entity";
import { Interior } from "../interior";
import { Marble } from "../marble";
import { Mission } from "../mission";
import { Shape } from "../shape";
import { Trigger } from "../triggers/trigger";
import { Util } from "../util";
import { GameInitter } from "./game_initter";
import { GameRenderer } from "./game_renderer";
import { GameSimulator, GAME_PLAYBACK_SPEED } from "./game_simulator";
import { GameState } from "./game_state";
import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { mainCanvas, resize } from "../ui/misc";
import { hideTouchControls, maybeShowTouchControls, releaseAllButtons } from "../input";
import { G } from "../global";
import { workerClearTimeoutOrInterval, workerSetInterval } from "../worker";
import { Player } from "./player";
import { Clock } from "./clock";
import { PowerUp } from "../shapes/power_up";
import { FormatToType } from "../../../shared/fixed_format_binary_serializer";
import { playerFormat } from "../../../shared/game_server_format";
import { FinishState } from "./finish_state";

export abstract class Game {
	abstract type: 'singleplayer' | 'multiplayer'; // For the record, I do know that it's spelled "single-player", but I also know that English can suck my

	state: GameState;
	initter: GameInitter;
	simulator: GameSimulator;
	renderer: GameRenderer;

	mission: Mission;
	seed = Math.floor(Math.random() * 2**32);

	entities: Entity[] = [];
	entityMap = new Map<number, Entity>();
	marbles: Marble[] = [];
	interiors: Interior[] = [];
	shapes: Shape[] = [];
	triggers: Trigger[] = [];

	players: Player[] = [];
	localPlayer: Player = null;

	clock: Clock;
	finishState: FinishState;
	randomPowerUpInstances: PowerUp[];

	totalGems = 0;

	music: AudioSource;
	originalMusicName: string;

	started = false;
	paused = false;
	/** If the game is stopped, it shouldn't be used anymore. */
	stopped = false;
	pausable = true;

	tickInterval: number;
	lastGameUpdateTime: number = null;

	tickDurations: { start: number, duration: number }[] = [];

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

	addEntity(entity: Entity) {
		if (entity.id === undefined) throw new Error("Entity has no ID.");

		Util.insertSorted(this.entities, entity, (a, b) => {
			if (a.updateOrder === b.updateOrder) return a.id - b.id;
			return a.updateOrder - b.updateOrder;
		});
		this.entityMap.set(entity.id, entity);
	}

	getEntityById(id: number) {
		return this.entityMap.get(id) ?? null;
	}

	async addPlayer(data: FormatToType<typeof playerFormat>) {
		let player = new Player(this, data.id);
		let marble = new Marble(this, data.marbleId, data.checkpointStateId);

		this.players.push(player);
		this.addEntity(player);

		await marble.init();
		this.marbles.push(marble);
		this.addEntity(marble);
		this.addEntity(marble.checkpointState);

		player.controlledMarble = marble;
		marble.controllingPlayer = player;
	}

	async init() {
		await this.initter.init();
	}

	async start() {
		if (this.stopped) return;

		this.started = true;

		for (let interior of this.interiors) await interior.onLevelStart();
		for (let shape of this.shapes) await shape.onLevelStart();

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
		if (this.paused && this.pausable) return;

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

		let start = performance.now();

		while (elapsed >= 1000 / gameUpdateRate) {
			elapsed -= 1000 / gameUpdateRate;
			this.lastGameUpdateTime += 1000 / gameUpdateRate;

			this.simulator.update();
		}

		let duration = performance.now() - start;
		this.tickDurations.push({ start, duration });

		AudioManager.updatePositionalAudio();
	}

	onButtonChange() {
		if (!this.started || !document.pointerLockElement || this.paused) return;

		this.localPlayer?.onButtonsChange();
	}

	onMouseMove(e: MouseEvent) {
		if (!this.started || !document.pointerLockElement || this.paused) return;

		this.localPlayer?.onMouseMove(e);
	}

	/** Pauses the game. */
	pause() {
		if (this.paused || (this.finishState.finished && this.finishState.isLegal)) return;

		document.exitPointerLock?.();
		releaseAllButtons(); // Safety measure to prevent keys from getting stuck
		G.menu.pauseScreen.show();
		hideTouchControls();

		this.paused = true;
	}

	/** Unpauses the game. */
	unpause() {
		this.paused = false;
		if (!Util.isTouchDevice) Util.requestPointerLock();
		G.menu.pauseScreen.hide();
		maybeShowTouchControls();

		this.lastGameUpdateTime = performance.now();
	}

	/** Ends the level irreversibly. */
	stop() {
		this.stopped = true;
		workerClearTimeoutOrInterval(this.tickInterval);
		this.dispose();

		this.music.stop();
		for (let entity of this.entities) entity.stop();

		AudioManager.stopAllAudio();
	}

	/** Stops and destroys the current level and returns back to the menu. */
	stopAndExit() {
		this.stop();
		G.game = null;
		mainCanvas.classList.add('hidden');

		G.menu.pauseScreen.hide();
		G.menu.levelSelect.show();
		G.menu.levelSelect.displayBestTimes(); // Potentially update best times having changed
		G.menu.finishScreen.hide();
		G.menu.hideGameUi();
		G.menu.show();

		document.exitPointerLock?.();
	}

	dispose() {
		this.renderer.dispose();
		for (let marble of this.marbles) marble.dispose();
	}
}