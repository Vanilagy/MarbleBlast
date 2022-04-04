import { DefaultMap } from "../../../shared/default_map";
import { CommandToData, EntityUpdate } from "../../../shared/game_server_format";
import { Util } from "../util";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	reconciliationUpdates: EntityUpdate[] = [];

	lastReconciliationTickCount = 0;

	update() {
		let { game } = this;
		let { state } = game;

		if (this.reconciliationUpdates.length === 0) {
			// Acts like a singleplayer game
			super.update();
			return;
		}

		for (let entity of game.entities) entity.beforeReconciliation();


		//console.time("updat");

		//console.log(state.tick - this.reconciliationInfo.rewindTo);

		//let startTick = Math.min(...[...this.reconciliationUpdates].map(([, updates]) => updates.map(x => x.tick)).flat(), state.tick);
		let startFrame = Math.min(
			...this.reconciliationUpdates.map(x => x.frame)
		);
		startFrame = Math.max(startFrame, game.lastServerStateBundle.rewindToFrameCap);
		let endFrame = state.tick;

		state.rollBackToFrame(startFrame);
		this.applyReconciliationUpdates(true);

		//console.log(game.playerId, game.marble.id, startTick, endTick, [...this.reconciliationUpdates].map(x => x[1].map(x => x.gameObjectId + '-' + x.owner + '-' + x.tick)).flat());

		//console.log(`Tryna go from ${startFrame} to ${endFrame}`);

		while (state.tick < endFrame) {
			this.advance();
			this.applyReconciliationUpdates();
		}

		this.lastReconciliationTickCount = endFrame - startFrame;
		for (let entity of game.entities) entity.afterReconciliation();

		this.reconciliationUpdates.length = 0;

		this.advance();
	}

	applyReconciliationUpdates(applyOlder = false) {
		let state = this.game.state;
		let currentFrame = state.tick;

		for (let update of this.reconciliationUpdates) {
			if (applyOlder? update.frame > currentFrame : update.frame !== currentFrame) continue;
			this.game.applyRemoteEntityUpdate(update);
		}

		state.saveStates();
	}
}