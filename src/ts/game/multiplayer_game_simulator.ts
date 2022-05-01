import { DefaultMap } from "../../../shared/default_map";
import { CommandToData, EntityUpdate } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { Util } from "../util";
import { Entity } from "./entity";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";
import { Player } from "./player";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	queuedServerBundles: CommandToData<'serverStateBundle'>[] = [];
	reconciliationDurations: { start: number, duration: number }[] = [];
	computedBaseState: { frame: number, updates: EntityUpdate[] } = null;
	maxThingies = new DefaultMap<Player, number>(() => -1);
	lastReconciliationFrames = 0;
	lastServerFrame = -1;

	update() {
		let { game } = this;
		let { state } = game;

		let bundles = this.queuedServerBundles;

		// todo clean this up
		if (bundles.length === 0) {
			// Acts like a singleplayer game
			super.update();
			return;
		}

		let start = performance.now();

		for (let entity of game.entities) {
			entity.beforeReconciliation();
		}

		this.isReconciling = true;

		let reconciliationUpdates = bundles.map(x => x.entityUpdates).flat();
		let baseState = bundles.map(x => x.baseState).flat();

		//if (reconciliationUpdates.some(x => x.entityId === 9)) console.log("sus", reconciliationUpdates.filter(x => x.entityId === 9));
		//if (baseState.some(x => x.update.entityId === 9)) console.log("sus", baseState.filter(x => x.update.entityId === 9));

		if (baseState.length > 0) {
			//console.log("cursed");
			/*
			let comparable = state.stateHistory.get(-4).find(x => x.frame === game.lastServerStateBundle.baseState[0].update.frame);

			if (!Util.areEqualDeep(comparable.state, game.lastServerStateBundle.baseState[0].update.state)) console.log("sadge", comparable.state, game.lastServerStateBundle.baseState[0].update.state);
			//else console.log("happyge");

			*/

			//console.log("never", game.lastServerStateBundle.baseState[0].update.frame, game.lastServerStateBundle.serverFrame);

			//console.log("b4", Math.min(...reconciliationUpdates.map(x => x.frame)));
			reconciliationUpdates.push(...baseState.map(x => x.update));
			//console.log("l8er", Math.min(...reconciliationUpdates.map(x => x.frame)));

			//console.log(game.lastServerStateBundle.baseState.updates.map(x => x.frame), game.lastServerStateBundle.baseState.frame, game.lastServerStateBundle.serverFrame);

			for (let { update } of baseState) {
				let entity = game.getEntityById(update.entityId);

				const doTheTwist = (e: Entity) => {
					let history = state.stateHistory.get(e.id);
					let can = history && !history.some(x => x.frame >= this.lastServerFrame && x.originator !== game.localPlayer.id);
					if (can) {
						let popped = false;
						while (history.length > 0 && Util.last(history).frame >= this.lastServerFrame) {
							history.pop();
							popped = true;
						}
						if (popped) {
							let update = Util.last(history);
							e.loadState(update?.state ?? e.getInitialState(), { frame: update?.frame ?? 0, remote: false });
						}
					}

					let next = new Set<Entity>();
					for (let edge of state.affectionGraph) if (edge.from === e) next.add(edge.to);

					e.clearInteractions(); // Because it's a base state
					for (let e2 of next) doTheTwist(e2);
				};

				doTheTwist(entity);
			}

			//game.maxReceivedBaseStateId = Math.max(...baseState.map(x => x.requestFrame));
		}

		//console.log([...new Set(this.reconciliationUpdates.map(x => x.frame))], game.lastServerStateBundle.serverFrame, state.frame);

		for (let entity of game.entities) {
			if (entity.affectedBy.size === 1 && entity.affectedBy.has(game.localPlayer))
				entity.clearInteractions();
		}

		if (reconciliationUpdates.length > 0) {
			reconciliationUpdates.sort((a, b) => a.frame - b.frame);

			//console.time("updat");

			//console.log(state.tick - this.reconciliationInfo.rewindTo);

			//let startTick = Math.min(...[...this.reconciliationUpdates].map(([, updates]) => updates.map(x => x.tick)).flat(), state.tick);
			let startFrame = reconciliationUpdates[0].frame;
			let endFrame = state.frame;

			if (baseState.length > 0) {
				let rewindCap = Math.min(...baseState.map(x => x.responseFrame));
				startFrame = Math.max(startFrame, rewindCap);
			} else {
				let rewindCap = bundles[0].serverFrame - 16;
				startFrame = Math.max(startFrame, rewindCap);
			}

			if (reconciliationUpdates.some(x => x.frame === reconciliationUpdates[0].frame && game.getEntityById(x.entityId).applyUpdatesBeforeAdvance)) {
				startFrame--;
			}

			state.rollBackToFrame(startFrame);

			let playerUpdates = [...new Set(reconciliationUpdates.filter(x => x.state?.entityType === 'player').map(x => x.entityId))];
			let newMaxThingies = new DefaultMap<Player, number>(() => -1);

			for (let update of reconciliationUpdates) {
				let player = game.players.find(x => x.id === update.originator);
				newMaxThingies.set(player, Math.max(update.frame, newMaxThingies.get(player)));
			}

			for (let entity of game.entities) {
				if (entity.affectedBy.size !== 1) continue;

				for (let playerId of playerUpdates) {
					let player = game.getEntityById(playerId) as Player;
					if (!entity.affectedBy.has(player)) continue;

					entity.clearInteractions();

					let rangeMin = this.maxThingies.get(player) + 1;
					let rangeMax = newMaxThingies.get(player);

					let history = state.stateHistory.get(entity.id);
					let can = !history.some(x => x.frame >= rangeMin && x.frame <= rangeMax && x.originator !== game.localPlayer.id);

					if (!can) break;

					let popped = false;

					while (history.length > 0 && Util.last(history).frame >= rangeMin) {
						history.pop();
						popped = true;
					}

					if (!popped) break;

					let update = Util.last(history);
					entity.loadState(update?.state ?? entity.getInitialState(), { frame: update?.frame ?? 0, remote: false });

					break;
				}
			}

			for (let [key, value] of newMaxThingies) {
				this.maxThingies.set(key, value);
			}

			this.applyReconciliationUpdates(reconciliationUpdates, true);

			//console.log(game.playerId, game.marble.id, startTick, endTick, [...this.reconciliationUpdates].map(x => x[1].map(x => x.gameObjectId + '-' + x.owner + '-' + x.tick)).flat());

			//if (endFrame- startFrame > 30) console.log(`Tryna go from ${startFrame} to ${endFrame}`);

			while (state.frame < endFrame) {
				this.applyEarlyReconciliationUpdates(reconciliationUpdates);
				this.advance();
				this.applyReconciliationUpdates(reconciliationUpdates);
			}

			this.lastReconciliationFrames = endFrame - startFrame;
		} else {
			this.lastReconciliationFrames = 0;
		}

		this.isReconciling = false;
		for (let entity of game.entities) entity.afterReconciliation();

		this.lastServerFrame = Util.last(bundles).serverFrame;
		this.queuedServerBundles.length = 0;

		this.advance();

		let duration = performance.now() - start;
		this.reconciliationDurations.push({ start, duration });
	}

	applyReconciliationUpdates(updates: EntityUpdate[], applyOlder = false) {
		let state = this.game.state;
		let currentFrame = state.frame;

		for (let update of updates) {
			if (applyOlder? update.frame > currentFrame : update.frame !== currentFrame) continue;

			let entity = this.game.getEntityById(update.entityId);
			if (entity.applyUpdatesBeforeAdvance && !applyOlder) continue;

			this.game.applyRemoteEntityUpdate(update);
		}
	}

	applyEarlyReconciliationUpdates(updates: EntityUpdate[]) {
		let state = this.game.state;
		let currentFrame = state.frame;

		for (let update of updates) {
			if (update.frame !== currentFrame + 1) continue;

			let entity = this.game.getEntityById(update.entityId);
			if (!entity.applyUpdatesBeforeAdvance) continue;

			this.game.applyRemoteEntityUpdate(update);
		}
	}
}