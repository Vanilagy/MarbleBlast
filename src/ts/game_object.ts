import { GameObjectState } from "../../shared/game_object_state";
import { Level, TimeState } from "./level";
import { Util } from "./util";

export abstract class GameObject<T extends GameObjectState> {
	abstract id: number;

	level: Level;
	stateHistory: {
		tick: number,
		state: T
	}[] = [];
	hasNewState = false;

	constructor(level: Level) {
		this.level = level;
	}

	abstract update(): void;
	abstract render(tempTimeState: TimeState): void;

	abstract getCurrentState(): T;
	abstract getInitialState(): T;
	abstract loadState(state: T): void;

	storeState() {
		let currentState = this.getCurrentState();

		if (Util.last(this.stateHistory)?.tick === this.level.timeState.tickIndex) this.stateHistory.pop();
		this.stateHistory.push({
			tick: this.level.timeState.tickIndex,
			state: currentState
		});

		this.hasNewState = true;
	}
}