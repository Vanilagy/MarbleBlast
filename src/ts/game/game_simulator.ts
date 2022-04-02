import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { World } from "../physics/world";
import { Game } from "./game";

export const GAME_PLAYBACK_SPEED = 1; // Major attack surface for cheaters here 😟
export const MAX_TIME = 999 * 60 * 1000 + 59 * 1000 + 999; // 999:59.99, should be large enough

export class GameSimulator {
	game: Game;

	world: World;

	constructor(game: Game) {
		this.game = game;

		this.world = new World();
	}

	update() {
		this.advance();
	}

	advance() {
		let { game } = this;

		game.state.advanceTime();

		//if (this.mission.hasBlast && this.blastAmount < 1) this.blastAmount = Util.clamp(this.blastAmount + 1000 / BLAST_CHARGE_TIME / PHYSICS_TICK_RATE, 0, 1);

		for (let entity of game.entities) {
			entity.owned = false;
			entity.update();
		}

		let playReplay = false;
		if (!playReplay) {
			let gravityBefore = this.world.gravity.clone();
			//if (this.finishTime) this.world.gravity.setScalar(0);
			this.world.step(1 / GAME_UPDATE_RATE);
			this.world.gravity.copy(gravityBefore);
		}

		for (let marble of game.marbles) marble.calculatePredictiveTransforms();

		/*
		let yawChange = 0.0;
		let pitchChange = 0.0;
		let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');
		let amount = Util.lerp(1, 6, StorageManager.data.settings.keyboardSensitivity);
		if (isPressed('cameraLeft')) yawChange += amount;
		if (isPressed('cameraRight')) yawChange -= amount;
		if (isPressed('cameraUp')) pitchChange -= amount;
		if (isPressed('cameraDown')) pitchChange += amount;

		yawChange -= gamepadAxes.cameraX * Util.lerp(0.5, 10, StorageManager.data.settings.mouseSensitivity);
		if (freeLook) pitchChange += gamepadAxes.cameraY * Util.lerp(0.5, 10, StorageManager.data.settings.mouseSensitivity);

		this.yaw += yawChange / PHYSICS_TICK_RATE;
		this.pitch += pitchChange / PHYSICS_TICK_RATE;
		*/

		// Handle alarm warnings (that the user is about to exceed the par time)
		/*
		if (this.timeState.currentAttemptTime >= GO_TIME && isFinite(this.mission.qualifyTime) && state.modification === 'platinum' && !this.finishTime) {
			let alarmStart = this.mission.computeAlarmStartTime();

			if (prevGameplayClock <= alarmStart && this.timeState.gameplayClock >= alarmStart && !this.alarmSound) {
				// Start the alarm
				this.alarmSound = AudioManager.createAudioSource('alarm.wav');
				this.alarmSound.setLoop(true);
				this.alarmSound.play();
				state.menu.hud.displayHelp(`You have ${(this.mission.qualifyTime - alarmStart) / 1000} seconds remaining.`, true);
			}
			if (prevGameplayClock < this.mission.qualifyTime && this.timeState.gameplayClock >= this.mission.qualifyTime) {
				// Stop the alarm
				this.alarmSound?.stop();
				this.alarmSound = null;
				state.menu.hud.displayHelp("The clock has passed the Par Time.", true);
				AudioManager.play('alarm_timeout.wav');
			}
		}
		*/

		// Record or playback the replay
		/*
		if (!playReplay) {
			this.replay.record();
		} else {
			this.replay.playBack();
			if (this.replay.isPlaybackComplete()) {
				this.stopAndExit();
				return;
			}
		}
		*/

		game.state.saveStates();
	}
}