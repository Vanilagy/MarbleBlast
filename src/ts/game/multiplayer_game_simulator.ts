import { DefaultMap } from "../../../shared/default_map";
import { CommandToData, GameObjectUpdate } from "../../../shared/game_server_format";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	reconciliationInfo: CommandToData<'reconciliationInfo'> = null;
	reconciliationUpdates = new DefaultMap<number, GameObjectUpdate[]>(() => []);

	lastReconciliationTickCount = 0;

	update() {
		let { game } = this;
		let { state } = game;

		super.update();

		if (!this.reconciliationInfo) return; // Acts like a singleplayer game

		for (let object of game.objects) object.beforeReconciliation();


		//console.time("updat");

		//console.log(state.tick - this.reconciliationInfo.rewindTo);

		//let startTick = Math.min(...[...this.reconciliationUpdates].map(([, updates]) => updates.map(x => x.tick)).flat(), state.tick);
		let startTick = this.reconciliationInfo.rewindTo;
		let endTick = state.tick;

		state.rollBackToTick(startTick);

		//console.log(game.playerId, game.marble.id, startTick, endTick, [...this.reconciliationUpdates].map(x => x[1].map(x => x.gameObjectId + '-' + x.owner + '-' + x.tick)).flat());

		//console.log(`Tryna go from ${startTick} to ${endTick}`);

		while (state.tick < endTick) {
			let anyStatesChanged = false;

			for (let [, updates] of this.reconciliationUpdates) {
				let updateForThisTick = updates.find(x => x.tick === state.tick);
				if (!updateForThisTick) continue;

				let appliedUpdate = state.applyGameObjectUpdate(updateForThisTick);
				anyStatesChanged ||= appliedUpdate;
			}

			if (anyStatesChanged) {
				this.world.updateCollisions();
				state.saveStates();
			}

			this.advance();
		}

		this.lastReconciliationTickCount = endTick - startTick;
		for (let object of game.objects) object.afterReconciliation();

		this.reconciliationUpdates.clear();
		this.reconciliationInfo = null;
	}
}