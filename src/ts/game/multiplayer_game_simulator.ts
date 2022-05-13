import { DefaultMap } from "../../../shared/default_map";
import { CommandToData, EntityUpdate } from "../../../shared/game_server_format";
import { Util } from "../util";
import { Entity } from "./entity";
import { GameSimulator } from "./game_simulator";
import { MultiplayerGame } from "./multiplayer_game";
import { Player } from "./player";

export class MultiplayerGameSimulator extends GameSimulator {
	game: MultiplayerGame;

	queuedServerBundles: CommandToData<'serverStateBundle'>[] = [];
	reconciliationDurations: { start: number, duration: number }[] = [];
	lastPlayerUpdates = new DefaultMap<Player, number>(() => -1);
	lastReconciliationFrames = 0;
	lastServerFrame = -1;

	update() {
		let { game } = this;
		let { state } = game;

		let bundles = this.queuedServerBundles;

		if (bundles.length === 0) {
			// Acts like a singleplayer game
			super.update();
			return;
		}

		let start = performance.now();

		for (let entity of game.entities) entity.beforeReconciliation();

		this.isReconciling = true;

		// Join up all the updates and base states
		let reconciliationUpdates = bundles.map(x => x.entityUpdates).flat();
		let baseState = bundles.map(x => x.baseState).flat();
		let entitiesAffectedByBaseState = new Set<Entity>();

		if (baseState.length > 0) {
			// Add the base states updates to the other reconciliation updates
			reconciliationUpdates.push(...baseState.map(x => x.update));

			// Now, loop over all the entities affected by the base states and process them a bit
			for (let { update } of baseState) {
				let entity = game.getEntityById(update.entityId);

				const prepareForBaseState = (e: Entity) => {
					let next = new Set<Entity>();
					for (let edge of state.affectionGraph) if (edge.from === e) next.add(edge.to);

					e.clearInteractions(); // Because it's a base state
					entitiesAffectedByBaseState.add(e);

					for (let e2 of next) prepareForBaseState(e2);
				};

				prepareForBaseState(entity);
			}
		}

		for (let entity of game.entities) {
			if (entity.affectedBy.size === 1 && entity.affectedBy.has(game.localPlayer))
				entity.clearInteractions();
		}

		if (reconciliationUpdates.length > 0) {
			reconciliationUpdates.sort((a, b) => a.frame - b.frame);

			// Determine the start and end frames of the reconciliation process
			let startFrame = reconciliationUpdates[0].frame;
			let endFrame = state.frame;

			if (baseState.length > 0) {
				let rewindCap = Math.min(...baseState.map(x => x.responseFrame));
				startFrame = Math.max(startFrame, rewindCap);
			} else {
				let rewindCap = bundles[0].serverFrame - 16; // 16 should give us plenty of room for outsiders
				startFrame = Math.max(startFrame, rewindCap);
			}

			// Some updates need to be applied one frame before their actual frame (so that they're applied by the beginning of the next frame), so check that here
			if (reconciliationUpdates.some(x => x.frame === reconciliationUpdates[0].frame && game.getEntityById(x.entityId).applyUpdatesBeforeAdvance)) {
				startFrame--;
			}

			// Roll back the entire game start to the start of the reconciliation window
			state.rollBackToFrame(startFrame);

			this.clearLocallyPredictedUpdates(reconciliationUpdates, entitiesAffectedByBaseState);

			// Execute any restarts we missed
			if (state.lastRestartFrame > this.maxExecutedRestartFrame) {
				state.restart(state.lastRestartFrame);
				this.maxExecutedRestartFrame = state.lastRestartFrame;
			}

			// Apply the oldest updates first
			this.applyReconciliationUpdates(reconciliationUpdates, true);

			// Finally, the core reconciliation loop: As quickly as possible, advance back to the frame we started at, applying any server changes along the way.
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

	/** Undoes all locally predicted state updates performed by players other than the local one. We do this because unless they are conflicts, we have no real say about what the other players update. */
	clearLocallyPredictedUpdates(reconciliationUpdates: EntityUpdate[], entititesAffectedByBaseState: Set<Entity>) {
		let { game } = this;
		let { state } = game;

		// First, do some base state clean-up stuff
		for (let entity of entititesAffectedByBaseState) {
			// Remove all of the new local changes to the entity
			let history = state.stateHistory.get(entity.id);
			let can = history && !history.some(x => x.frame >= this.lastServerFrame && game.remoteUpdates.has(x));
			if (can) state.rollBackEntityToFrame(entity, this.lastServerFrame);
		}

		// Figure out from which players we've gotten updates (we use the Player entity state as am indicator for that)
		let playerUpdates = [...new Set(reconciliationUpdates.filter(x => x.state?.entityType === 'player').map(x => x.entityId))];
		let newLastPlayerUpdates = new DefaultMap<Player, number>(() => -1);

		for (let update of reconciliationUpdates) {
			if (update.state?.entityType !== 'player') continue;
			let player = game.players.find(x => x.id === update.entityId);
			newLastPlayerUpdates.set(player, Math.max(update.frame, newLastPlayerUpdates.get(player)));
		}

		for (let entity of game.entities) {
			if (entity.affectedBy.size !== 1) continue;

			for (let playerId of playerUpdates) {
				let player = game.getEntityById(playerId) as Player;
				if (!entity.affectedBy.has(player)) continue;

				entity.clearInteractions();

				let rangeMin = this.lastPlayerUpdates.get(player) + 1;
				let rangeMax = newLastPlayerUpdates.get(player);

				let history = state.stateHistory.get(entity.id);
				let can = !history.some(x => x.frame >= rangeMin && x.frame <= rangeMax && game.remoteUpdates.has(x));
				if (can) state.rollBackEntityToFrame(entity, rangeMax);

				break;
			}
		}

		for (let [key, value] of newLastPlayerUpdates) {
			this.lastPlayerUpdates.set(key, value);
		}
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