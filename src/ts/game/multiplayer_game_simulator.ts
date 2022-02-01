import { DefaultMap } from "../../../shared/default_map";
import { CommandToData, GameObjectStateUpdate } from "../../../shared/game_server_format";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	reconciliationInfo: CommandToData<'reconciliationInfo'> = null;
	reconciliationUpdates = new DefaultMap<number, GameObjectStateUpdate[]>(() => []);

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

		//console.log(`Tryna go from ${startTick} to ${endTick}`);

		while (state.tick < endTick) {
			let anyStatesChanged = false;

			for (let [objectId, updates] of this.reconciliationUpdates) {
				let updateForThisTick = updates.find(x => x.tick === state.tick);
				if (!updateForThisTick) continue;

				let object = game.objects.find(x => x.id === objectId); // todo optimize
				if (!object) return; // todo should this stay? temp rn cuz marble init wack

				if (updateForThisTick.originator !== game.playerId) {
					object.loadState(updateForThisTick.state);
					object.hasChangedState = true;
					anyStatesChanged = true;
				}

				object.certainty = 1;
			}

			if (anyStatesChanged) {
				this.world.updateCollisions();
				state.saveStates();
			}

			this.advance();
		}

		this.lastReconciliationTickCount = endTick - startTick;
		for (let object of game.objects) object.afterReconciliation(this.lastReconciliationTickCount);

		this.reconciliationUpdates.clear();
		this.reconciliationInfo = null;
	}
}