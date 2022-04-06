import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { state } from "../state";
import { Entity } from "./entity";
import { Game } from "./game";
import { MAX_TIME } from "./game_simulator";

type ClockState = EntityState & { entityType: 'clock' };

export class Clock extends Entity {
	time = 0;
	timeTravelBonus = 0;

	constructor(game: Game, id: number) {
		super(game);

		this.id = id;
	}

	update() {
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

		//if (simulator.finishTime) return 'green'; // Even if not qualified
		if (/*game.state.time < GO_TIME || */game.clock.timeTravelBonus > 0) return 'green';
		if (timeToDisplay >= game.mission.qualifyTime) return 'red';

		/*
		if (simulator.timeState.currentAttemptTime >= GO_TIME && isFinite(game.mission.qualifyTime) && state.modification === 'platinum') {
			// Create the flashing effect
			let alarmStart = game.mission.computeAlarmStartTime();
			let elapsed = timeToDisplay - alarmStart;
			if (elapsed < 0) return;
			if (Math.floor(elapsed / 1000) % 2 === 0) return 'red';
		}*/

		return; // Default yellow
	}

	getCurrentState(): ClockState {
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
			this.update();
		}

		console.log(this.game.state.frame - meta.frame);
	}

	reset() {}
	stop() {}
}