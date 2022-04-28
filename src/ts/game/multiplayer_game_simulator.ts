import { DefaultMap } from "../../../shared/default_map";
import { EntityUpdate } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { Util } from "../util";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";
import { Player } from "./player";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	reconciliationUpdates: EntityUpdate[] = [];
	lastReconciliationFrameCount = 0;
	reconciliationDurations: { start: number, duration: number }[] = [];
	computedBaseState: { frame: number, updates: EntityUpdate[] } = null;
	maxThingies = new DefaultMap<Player, number>(() => -1);

	update() {
		let { game } = this;
		let { state } = game;

		if (this.reconciliationUpdates.length === 0) {
			// Acts like a singleplayer game
			super.update();
			return;
		}

		let start = performance.now();

		for (let entity of game.entities) {
			entity.beforeReconciliation();
			if (entity.affectedBy.size === 1 && entity.affectedBy.has(game.localPlayer))
				entity.affectedBy.clear();

			//entity.affectedBy.clear(); // todo dont forget to remove this line again ^^
		}

		this.isReconciling = true;

		if (game.lastServerStateBundle.baseState.length > 0) {
			for (let {update} of game.lastServerStateBundle.baseState) {
				let comparable = state.stateHistory.get(update.entityId).find(x => x.frame === update.frame);
				if (!comparable) continue;

				if (!Util.areEqualDeep(comparable.state, update.state)) console.log("sadge", comparable.state, update.state, update.frame);
				//else console.log("happyge");
			}
		}

		if (game.lastServerStateBundle.baseState.length > 0) {
			console.log("cursed");
			/*
			let comparable = state.stateHistory.get(-4).find(x => x.frame === game.lastServerStateBundle.baseState[0].update.frame);

			if (!Util.areEqualDeep(comparable.state, game.lastServerStateBundle.baseState[0].update.state)) console.log("sadge", comparable.state, game.lastServerStateBundle.baseState[0].update.state);
			//else console.log("happyge");

			*/

			//console.log("never", game.lastServerStateBundle.baseState[0].update.frame, game.lastServerStateBundle.serverFrame);
			this.reconciliationUpdates.push(...game.lastServerStateBundle.baseState.map(x => x.update));
			//console.log(game.lastServerStateBundle.baseState.updates.map(x => x.frame), game.lastServerStateBundle.baseState.frame, game.lastServerStateBundle.serverFrame);

			for (let { update } of game.lastServerStateBundle.baseState) {
				let entity = game.getEntityById(update.entityId);
				entity.affectedBy.clear(); // Because it's a base state
			}
		}

		//console.log([...new Set(this.reconciliationUpdates.map(x => x.frame))], game.lastServerStateBundle.serverFrame, state.frame);

		this.reconciliationUpdates.sort((a, b) => a.frame - b.frame);

		//console.time("updat");

		//console.log(state.tick - this.reconciliationInfo.rewindTo);

		//let startTick = Math.min(...[...this.reconciliationUpdates].map(([, updates]) => updates.map(x => x.tick)).flat(), state.tick);
		let startFrame = this.reconciliationUpdates[0].frame;
		if (this.reconciliationUpdates.some(x => x.frame === startFrame && game.getEntityById(x.entityId).applyUpdatesBeforeAdvance)) {
			startFrame--;
		}

		if (false) if (game.lastServerStateBundle.baseState.length === 0) {
			let rewindCap = game.lastServerStateBundle.serverFrame - 8;
			//if (startFrame < rewindCap - 1) console.log("yo que", rewindCap - 1 - startFrame);
			startFrame = Math.max(startFrame, rewindCap);
		}
		let endFrame = state.frame;

		state.rollBackToFrame(startFrame);

		let playerUpdates = [...new Set(this.reconciliationUpdates.filter(x => x.state?.entityType === 'player').map(x => x.entityId))];
		for (let entity of game.entities) {
			//entity.affectedBy.clear();
			continue;
			if (entity.affectedBy.size !== 1) continue;

			for (let playerId of playerUpdates) {
				let player = game.getEntityById(playerId) as Player;
				if (!entity.affectedBy.has(player)) continue;

				let affectedFrame = entity.affectedBy.get(player);

				if (this.maxThingies.get(player) >= affectedFrame) continue;

				let history = state.stateHistory.get(entity.id);
				let popped = false;

				while (history.length > 0 && Util.last(history).frame >= affectedFrame) {
					history.pop();
					popped = true;
				}

				if (!popped) break;

				let update = Util.last(history);
				entity.loadState(update?.state ?? entity.getInitialState(), { frame: update?.frame ?? 0, remote: false });

				break;
			}
		}

		for (let update of this.reconciliationUpdates) {
			let player = game.players.find(x => x.id === update.originator);
			this.maxThingies.set(player, Math.max(update.frame, this.maxThingies.get(player)));
		}

		this.applyReconciliationUpdates(true);

		//console.log(game.playerId, game.marble.id, startTick, endTick, [...this.reconciliationUpdates].map(x => x[1].map(x => x.gameObjectId + '-' + x.owner + '-' + x.tick)).flat());

		//console.log(`Tryna go from ${startFrame} to ${endFrame}`);

		while (state.frame < endFrame) {
			this.applyEarlyReconciliationUpdates();
			this.advance();
			this.applyReconciliationUpdates();
		}

		this.lastReconciliationFrameCount = endFrame - startFrame;
		this.isReconciling = false;

		for (let entity of game.entities) entity.afterReconciliation();

		this.reconciliationUpdates.length = 0;

		this.advance();

		let duration = performance.now() - start;
		this.reconciliationDurations.push({ start, duration });

		if (game.lastServerStateBundle.baseStateRequest.entities.length > 0) {
			let baseState = {
				frame: game.lastServerStateBundle.serverFrame,
				updates: [] as EntityUpdate[]
			};

			for (let id of game.lastServerStateBundle.baseStateRequest.entities) {
				let history = state.stateHistory.get(id);
				let update = Util.findLast(history, x => x.frame <= game.lastServerStateBundle.serverFrame);
				if (!update) {
					console.log("TODO THIS CASE INITIAL STATE N SHIT");
					continue;
				}

				//console.log(update.frame, this.game.state.frame);
				baseState.updates.push(update);
			}

			this.computedBaseState = baseState;
		}
	}

	applyReconciliationUpdates(applyOlder = false) {
		let state = this.game.state;
		let currentFrame = state.frame;

		for (let update of this.reconciliationUpdates) {
			if (applyOlder? update.frame > currentFrame : update.frame !== currentFrame) continue;

			let entity = this.game.getEntityById(update.entityId);
			if (entity.applyUpdatesBeforeAdvance && !applyOlder) continue;

			this.game.applyRemoteEntityUpdate(update);
		}
	}

	applyEarlyReconciliationUpdates() {
		let state = this.game.state;
		let currentFrame = state.frame;

		for (let update of this.reconciliationUpdates) {
			if (update.frame !== currentFrame + 1) continue;

			let entity = this.game.getEntityById(update.entityId);
			if (!entity.applyUpdatesBeforeAdvance) continue;

			this.game.applyRemoteEntityUpdate(update);
		}
	}
}