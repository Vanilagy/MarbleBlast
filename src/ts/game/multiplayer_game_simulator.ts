import { DefaultMap } from "../../../shared/default_map";
import { GameObjectStateUpdate } from "../../../shared/game_object_state_update";
import { GameServerCommands } from "../../../shared/rtc";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	needsReconciliation = false;
	reconciliationInfo: GameServerCommands['reconciliationInfo'] = null;
	reconciliationUpdates = new DefaultMap<number, GameObjectStateUpdate[]>(() => []);

	update() {
		let { game } = this;
		let { state } = game;

		if (!this.needsReconciliation) {
			super.update(); // Acts like a singleplayer game
			return;
		}

		this.needsReconciliation = false;

		let endTick = state.tick + 1;
		state.rollBackToTick(this.reconciliationInfo.rewindTo);

		//console.log(`Tryna go from ${state.tick} to ${endTick}`);

		while (state.tick < endTick) {
			let anyStatesChanged = false;

			for (let [objectId, updates] of this.reconciliationUpdates) {
				let updateForThisTick = updates.find(x => x.tick === state.tick);
				if (!updateForThisTick) continue;

				let object = game.objects.find(x => x.id === objectId); // todo optimize
				if (!object) return; // todo should this stay? temp rn cuz marble init wack

				object.loadState(updateForThisTick.state);
				object.hasChangedState = true;

				anyStatesChanged = true;
			}

			if (anyStatesChanged) {
				this.world.updateCollisions();
				state.saveStates();
			}

			this.advance();
		}
	}
}