import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { AudioManager, AudioSource } from "../audio";
import { state } from "../state";
import { Entity } from "./entity";
import { Game } from "./game";
import { MAX_TIME } from "./game_simulator";

type ClockState = EntityState & { entityType: 'clock' };

interface InternalClockState {
	time: number,
	timeTravelBonus: number
}

export class Clock extends Entity {
	time = 0;
	timeTravelBonus = 0;
	updateOrder = -1;
	timeTravelSound: AudioSource = null;
	alarmSound: AudioSource = null;

	constructor(game: Game, id: number) {
		super(game);

		this.id = id;
	}

	update() {
		this.advanceTime();

		this.internalStateNeedsStore = true;

		if (this.game.simulator.isReconciling) return;

		if (this.timeTravelBonus > 0 && !this.timeTravelSound) {
			this.timeTravelSound = AudioManager.createAudioSource('timetravelactive.wav');
			this.timeTravelSound.setLoop(true);
			this.timeTravelSound.play();
		} else if (this.timeTravelBonus === 0) {
			this.timeTravelSound?.stop();
			this.timeTravelSound = null;
		}

		// Handle alarm warnings (that the user is about to exceed the par time)
		if (isFinite(this.game.mission.qualifyTime) && state.modification === 'platinum'/* todo && !this.finishTime*/) {
			let alarmStart = this.game.mission.computeAlarmStartTime();

			if (this.time > 0 && 1000 * this.time >= alarmStart) {
				if (1000 * this.time < this.game.mission.qualifyTime && !this.alarmSound) {
					// Start the alarm
					this.alarmSound = AudioManager.createAudioSource('alarm.wav');
					this.alarmSound.setLoop(true);
					this.alarmSound.play();
					state.menu.hud.displayHelp(() => `You have ${(this.game.mission.qualifyTime - alarmStart) / 1000} seconds remaining.`, this.game.state.frame, true);
				}

				if (1000 * this.time >= this.game.mission.qualifyTime && this.alarmSound) {
					// Stop the alarm
					this.alarmSound?.stop();
					this.alarmSound = null;
					state.menu.hud.displayHelp(() => "The clock has passed the Par Time.", this.game.state.frame, true);
					AudioManager.play('alarm_timeout.wav');
				}
			} else {
				this.alarmSound?.stop();
				this.alarmSound = null;
			}
		}
	}

	advanceTime() {
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
	}

	addTimeTravelBonus(bonus: number, timeToRevert: number) {
		if (this.timeTravelBonus === 0) {
			this.time -= timeToRevert;
			if (this.time < 0) this.time = 0;
			bonus -= timeToRevert;
		}

		this.timeTravelBonus += bonus;

		this.stateNeedsStore = true;
	}

	render() {
		let timeToDisplay = this.time; // fixme not visually smoothed
		timeToDisplay = Math.min(timeToDisplay, MAX_TIME);

		state.menu.hud.displayTime(timeToDisplay, this.determineClockColor(timeToDisplay));
	}

	determineClockColor(timeToDisplay: number): 'red' | 'green' {
		let { game } = this;

		if (state.modification === 'gold') return;

		// todo if (simulator.finishTime) return 'green'; // Even if not qualified
		if (this.time === 0 || game.clock.timeTravelBonus > 0) return 'green';
		if (1000 * timeToDisplay >= game.mission.qualifyTime) return 'red';

		if (isFinite(game.mission.qualifyTime) && state.modification === 'platinum') {
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
			timeTravelBonus: this.timeTravelBonus
		};
	}

	getInitialState(): ClockState {
		return {
			entityType: 'clock',
			time: 0,
			timeTravelBonus: 0
		};
	}

	loadState(state: ClockState, meta: { frame: number, remote: boolean }) {
		this.time = state.time;
		this.timeTravelBonus = state.timeTravelBonus;

		// Catch up to the now
		for (let i = 0; i < (this.game.state.frame - meta.frame); i++) {
			this.advanceTime();
		}
	}

	getInternalState(): InternalClockState {
		return {
			time: this.time,
			timeTravelBonus: this.timeTravelBonus
		};
	}

	loadInternalState(state: InternalClockState) {
		this.time = state.time;
		this.timeTravelBonus = state.timeTravelBonus;
	}

	reset() {}
	stop() {}
}