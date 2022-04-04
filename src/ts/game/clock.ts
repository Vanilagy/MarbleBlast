import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { state } from "../state";
import { Entity } from "./entity";
import { Game } from "./game";
import { MAX_TIME } from "./game_simulator";

type ClockState = EntityState & { entityType: 'clock' };

export class Clock extends Entity<ClockState> {
	time = 0;

	constructor(game: Game, id: number) {
		super(game);

		this.id = id;
	}

	update() {
		this.time += 1 / GAME_UPDATE_RATE;
	}

	render() {
		let timeToDisplay = this.time; // fixme not visually smoothed
		timeToDisplay = Math.min(timeToDisplay, MAX_TIME);

		state.menu.hud.displayTime(timeToDisplay);
	}

	determineClockColor(timeToDisplay: number): 'red' | 'green' {
		let { game } = this;
		let { simulator } = game;

		return; // fixme
		/*
		if (state.modification === 'gold') return;

		if (simulator.finishTime) return 'green'; // Even if not qualified
		if (simulator.timeState.currentAttemptTime < GO_TIME || simulator.currentTimeTravelBonus > 0) return 'green';
		if (timeToDisplay >= game.mission.qualifyTime) return 'red';

		if (simulator.timeState.currentAttemptTime >= GO_TIME && isFinite(game.mission.qualifyTime) && state.modification === 'platinum') {
			// Create the flashing effect
			let alarmStart = game.mission.computeAlarmStartTime();
			let elapsed = timeToDisplay - alarmStart;
			if (elapsed < 0) return;
			if (Math.floor(elapsed / 1000) % 2 === 0) return 'red';
		}

		return; // Default yellow
		*/
	}

	getCurrentState(): ClockState {
		return {
			entityType: 'clock',
			time: this.time
		};
	}

	getInitialState(): ClockState {
		return {
			entityType: 'clock',
			time: 0
		};
	}

	loadState(state: ClockState, meta: { frame: number, remote: boolean }) {
		this.time = state.time;
		this.time += 1 / GAME_UPDATE_RATE * (this.game.state.frame - meta.frame);
	}

	reset() {}
	stop() {}
}