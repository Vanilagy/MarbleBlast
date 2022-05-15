import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { AudioManager, AudioSource } from "../audio";
import { G } from "../global";
import { Util } from "../util";
import { Entity } from "./entity";
import { Game } from "./game";
import { GameMode } from "./game_mode";
import { GO_TIME, READY_TIME, SET_TIME } from "./game_state";

type ClockState = EntityState & { entityType: 'clock' };

interface InternalClockState {
	time: number,
	elapsedTime: number,
	timeTravelBonus: number
}

export const MAX_TIME = 999 * 60 + 59 + 0.999; // 999:59.99, should be large enough

export class Clock extends Entity {
	restartable = true;
	time = 0;
	elapsedTime = 0;
	timeTravelBonus = 0;
	updateOrder = -1;
	timeTravelSound: AudioSource = null;
	alarmSound: AudioSource = null;

	constructor(game: Game, id: number) {
		super(game);

		this.id = id;
	}

	update() {
		this.advanceTime(this.game.state.frame);

		this.internalStateNeedsStore = true;

		if (this.game.simulator.isReconciling) return;

		let timeSinceRestart = (this.game.state.frame - this.game.state.lastRestartFrame) / GAME_UPDATE_RATE;
		if (timeSinceRestart === READY_TIME) AudioManager.play('ready.wav');
		if (timeSinceRestart === SET_TIME) AudioManager.play('set.wav');
		if (timeSinceRestart === GO_TIME) AudioManager.play('go.wav');

		if (this.timeTravelBonus > 0 && !this.timeTravelSound && !this.game.finishState.finished) {
			this.timeTravelSound = AudioManager.createAudioSource('timetravelactive.wav');
			this.timeTravelSound.setLoop(true);
			this.timeTravelSound.play();
		} else if (this.timeTravelBonus === 0 || this.game.finishState.finished) {
			this.timeTravelSound?.stop();
			this.timeTravelSound = null;
		}

		// Handle alarm warnings (that the user is about to exceed the par time)
		if (isFinite(this.game.mission.qualifyTime) && G.modification === 'platinum') {
			let alarmStart = this.game.mission.computeAlarmStartTime();

			if (this.time > 0 && 1000 * this.time >= alarmStart && !this.game.finishState.finished) {
				if (1000 * this.time < this.game.mission.qualifyTime && !this.alarmSound) {
					// Start the alarm
					this.alarmSound = AudioManager.createAudioSource('alarm.wav');
					this.alarmSound.setLoop(true);
					this.alarmSound.play();
					G.menu.hud.displayHelp(() => `You have ${(this.game.mission.qualifyTime - alarmStart) / 1000} seconds remaining.`, this.game.state.frame, true);
				}

				if (1000 * this.time >= this.game.mission.qualifyTime && this.alarmSound) {
					// Stop the alarm
					this.alarmSound?.stop();
					this.alarmSound = null;
					G.menu.hud.displayHelp(() => "The clock has passed the Par Time.", this.game.state.frame, true);
					AudioManager.play('alarm_timeout.wav');
				}
			} else {
				this.alarmSound?.stop();
				this.alarmSound = null;
			}
		}
	}

	advanceTime(currentFrame: number) {
		if (this.game.state.lastRestartFrame === -Infinity || currentFrame - this.game.state.lastRestartFrame < GO_TIME * GAME_UPDATE_RATE)
			return;

		if (this.timeTravelBonus > 0) {
			// Subtract remaining time travel time
			this.timeTravelBonus -= 1 / GAME_UPDATE_RATE;
		} else {
			// Increase the gameplay time
			this.time += 1 / GAME_UPDATE_RATE;
		}

		if (this.timeTravelBonus < 0) {
			// If we slightly undershot the zero mark of the remaining time travel bonus, add the "lost time" back onto the gameplay clock:
			this.time += -this.timeTravelBonus;
			this.timeTravelBonus = 0;
		}

		this.elapsedTime += 1 / GAME_UPDATE_RATE; // Siempre
	}

	addTimeTravelBonus(bonus: number, timeToRevert: number) {
		if (this.game.finishState.finished) return;

		if (this.timeTravelBonus === 0) {
			this.time -= timeToRevert;
			if (this.time < 0) this.time = 0;
			bonus -= timeToRevert;
		}

		this.timeTravelBonus += bonus;

		if (this.timeTravelBonus < 0) {
			this.time -= this.timeTravelBonus;
			this.timeTravelBonus = 0;
		}

		this.stateNeedsStore = true;
	}

	render() {
		let timeToDisplay = this.game.finishState.time ?? this.time; // fixme not visually smoothed

		let clockColorTime = timeToDisplay;
		if (this.game.mode === GameMode.Hunt) timeToDisplay = this.game.mission.qualifyTime/1000 - timeToDisplay;

		timeToDisplay = Util.clamp(timeToDisplay, 0, MAX_TIME);

		G.menu.hud.displayTime(timeToDisplay, this.determineClockColor(clockColorTime));
	}

	determineClockColor(timeToDisplay: number): 'red' | 'green' {
		let { game } = this;

		if (G.modification === 'gold') return;

		if (this.game.finishState.finished) return 'green'; // Even if not qualified
		if (this.time === 0 || game.clock.timeTravelBonus > 0) return 'green';
		if (1000 * timeToDisplay >= game.mission.qualifyTime) return 'red';

		if (isFinite(game.mission.qualifyTime) && G.modification === 'platinum') {
			// Create the flashing effect
			let alarmStart = game.mission.computeAlarmStartTime();
			let elapsed = 1000 * timeToDisplay - alarmStart;
			if (elapsed < 0) return;
			if (Math.floor(elapsed / 1000) % 2 === 0) return 'red';
		}

		return; // Default yellow
	}

	getState(): ClockState {
		return {
			entityType: 'clock',
			time: this.time,
			elapsedTime: this.elapsedTime,
			timeTravelBonus: this.timeTravelBonus
		};
	}

	getInitialState(): ClockState {
		return {
			entityType: 'clock',
			time: 0,
			elapsedTime: 0,
			timeTravelBonus: 0
		};
	}

	loadState(state: ClockState, meta: { frame: number, remote: boolean }) {
		this.time = state.time;
		this.elapsedTime = state.elapsedTime;
		this.timeTravelBonus = state.timeTravelBonus;

		// Catch up to the now
		for (let frame = meta.frame + 1; frame <= this.game.state.frame; frame++) {
			this.advanceTime(frame);
		}
	}

	getInternalState(): InternalClockState {
		return {
			time: this.time,
			elapsedTime: this.elapsedTime,
			timeTravelBonus: this.timeTravelBonus
		};
	}

	loadInternalState(state: InternalClockState) {
		this.time = state.time;
		this.elapsedTime = state.elapsedTime;
		this.timeTravelBonus = state.timeTravelBonus;
	}

	reset() {}
	stop() {}
}