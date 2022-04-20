import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate, entityUpdateFormat } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const TWICE_CLIENT_UPDATE_PERIOD = 4 * 2; // todo remove hardcode?
const UPDATE_BUFFER_SIZE = 1; // In frames

type EntityInfo = CommandToData<'clientStateBundle'>["periods"][number]["entityInfo"][number];

class Player {
	connection: GameServerConnection;
	id: number;
	marbleId: number;

	lastReceivedPeriodId = -1;
	lastEstimatedRtt = 0;
	lastReceivedServerUpdateId = -1;

	queuedEntityUpdates: EntityUpdate[] = [];
	highestSeenEntityFrame = new DefaultMap<Entity, number>(() => 0);

	constructor(connection: GameServerConnection, id: number, marbleId: number) {
		this.connection = connection;
		this.id = id;
		this.marbleId = marbleId;
	}
}

interface EntitySnapshot {
	frame: number,
	update: EntityUpdate,
	owner: number,
	outgoing: EntitySnapshot[],
	isInitial?: boolean
}

class Entity {
	id: number;
	game: Game2;

	lastSentSnapshot: EntitySnapshot = null;
	snapshots: EntitySnapshot[] = [];
	versions = new DefaultMap<Player, number>(() => 0);

	constructor(id: number, game: Game2) {
		this.id = id;
		this.game = game;
	}

	get currentSnapshot() {
		return Util.last(this.snapshots) ?? {
			frame: 0,
			update: {
				updateId: -1,
				entityId: this.id,
				frame: 0,
				owned: false,
				challengeable: false,
				originator: 0,
				version: 0,
				state: null
			},
			owner: null,
			outgoing: [],
			isInitial: true
		};
	}

	get currentOwnerSnapshot() {
		return Util.findLast(this.snapshots, x => x.update.owned) ?? null;
	}

	insertSnapshot(snapshot: EntitySnapshot) {
		if (this.currentSnapshot && this.currentSnapshot.frame > snapshot.frame) throw new Error("Ah ah ah! ☝");

		if (this.currentSnapshot) snapshot.owner = this.currentSnapshot.owner;
		if (snapshot.update.owned) snapshot.owner = snapshot.update.originator;

		this.snapshots.push(snapshot); // Constraint: Snapshots can only be inserted at the end of the thing

		if (snapshot.update.owned) {
			for (let player of this.game.players) {
				if (player.id === snapshot.update.originator) continue;
				this.versions.set(player, this.versions.get(player) + 1);
			}
		}
	}

	getBestSnapshot() {
		if (this.currentOwnerSnapshot && this.game.frame - this.currentOwnerSnapshot.frame < TWICE_CLIENT_UPDATE_PERIOD) return this.currentOwnerSnapshot;
		return this.currentSnapshot ?? null;
	}

	update() {
		let bestSnapshot = this.getBestSnapshot();

		if (bestSnapshot !== this.lastSentSnapshot && !!bestSnapshot.isInitial !== this.lastSentSnapshot?.isInitial) {
			if (bestSnapshot.owner !== (this.lastSentSnapshot?.owner ?? null)) console.log("Ownership changed! " + this.id, bestSnapshot.owner);

			if (this.id >= 0) console.log(bestSnapshot);

			for (let player of this.game.players) {
				if (player.id === bestSnapshot.owner || player.id === bestSnapshot.update.originator) continue;

				let mustAck = bestSnapshot.update.owned;
				//let ownerChanged = bestSnapshot.owner !== this.lastSentSnapshot?.owner;
				//if (ownerChanged) mustAck = true;

				this.game.sendEntityUpdateToPlayerOnce(player, bestSnapshot.update, mustAck);
			}

			this.lastSentSnapshot = bestSnapshot;
		}
	}

	canApplyUpdate(update: EntityUpdate, player: Player, frameLow: number, totalFrameLow: number) {
		if (update.version < this.versions.get(player)) return false;
		//if (this.game.awaitingAck.some(x => x.update.entityId === this.id && x.player === player)) return false;

		if (this.currentSnapshot) {
			if (update.owned) {
				if (update.frame < this.currentSnapshot.frame) {
					if (this.game.frame - update.frame >= TWICE_CLIENT_UPDATE_PERIOD) return false;
				}

				if (this.currentSnapshot.owner !== null) {
					if (player.id !== this.currentSnapshot.owner) {
						//if (totalFrameLow < this.currentOwnerSnapshot.frame) return false; // todo for tomorrow: idk if this is good!
						if (frameLow - this.currentOwnerSnapshot.frame < TWICE_CLIENT_UPDATE_PERIOD) return false;
					}
				}
			} else {
				if (update.frame < this.currentSnapshot.frame) return false; // Is it fine not to use frameLow here?
			}
		}

		return true;
	}

	canDeleteUpdate(update: EntityUpdate, player: Player) {
		//if (this.game.awaitingAck.some(x => x.update.entityId === this.id && x.player === player)) return false;
		if (update.version < this.versions.get(player)) return false;
		if (update.owned && update.originator !== player.id) return false;

		return true;
	}
}

interface UpdateBundle {
	maxFrame: number,
	updates: EntityUpdate[],
	affectionGraph: { from: number, to: number }[],
	player: Player,
	entityInfo: EntityInfo[],
	start: number,
	end: number
}

export class Game2 {
	missionPath: string;
	players: Player[] = [];

	startTime: number;
	lastAdvanceTime: number;

	frame = -1;
	entities = new Map<number, Entity>();
	incrementalUpdateId = 0;

	pendingPings = new DefaultMap<Player, Map<number, number>>(() => new Map());
	queuedBundles: UpdateBundle[] = [];

	awaitingAck: {
		update: EntityUpdate,
		player: Player
	}[] = [];

	constructor(missionPath: string) {
		this.missionPath = missionPath;
		console.log(`GAME CREATED! ${missionPath}`);

		this.start();
	}

	start() {
		this.startTime = performance.now();
		this.lastAdvanceTime = this.startTime;
	}

	addPlayer(connection: GameServerConnection) {
		let playerId = -(1 + this.players.length * 2);
		let marbleId = -(1 + this.players.length * 2 + 1);

		let player = new Player(connection, playerId, marbleId);
		this.players.push(player);

		//connection.addedOneWayLatency = 20;

		connection.queueCommand({
			command: 'gameJoinInfo',
			serverFrame: this.frame,
			clientFrame: this.frame + UPDATE_BUFFER_SIZE, // No better guess yet
			players: this.players.map(x => ({
				id: x.id,
				marbleId: x.marbleId
			})),
			localPlayerId: player.id,
			entityStates: []/* ?? [...this.entities].map(([, entity]) => ({
				...entity.getTrueUpdate(),
				version: entity.versions.get(player.id)
			}))*/
		}, true);

		connection.on('clientStateBundle', data => {
			this.onClientStateReceived(player, data);
		});

		connection.on('ping', ({ timestamp }) => {
			let now = performance.now();
			this.pendingPings.get(player).set(timestamp, now);
		});

		for (let otherPlayer of this.players) {
			if (otherPlayer === player) continue;

			otherPlayer.connection.queueCommand({
				command: 'playerJoin',
				id: player.id,
				marbleId: player.marbleId
			}, true);
		}
	}

	getEntityById(id: number) {
		if (this.entities.has(id)) return this.entities.get(id);

		// Create a new entity entry
		let entity = new Entity(id, this);
		this.entities.set(id, entity);

		return entity;
	}

	tryAdvanceGame() {
		let now = performance.now();
		while (now - this.lastAdvanceTime >= 1000 / GAME_UPDATE_RATE) {
			this.update();
			this.lastAdvanceTime += 1000 / GAME_UPDATE_RATE;
		}
	}

	tick() {
		let now = performance.now();

		this.tryAdvanceGame();

		// Send packets to all players
		for (let player of this.players) {
			let rewindToFrameCap = this.frame - TWICE_CLIENT_UPDATE_PERIOD;

			//console.log(Util.last(player.queuedEntityUpdates)?.frame, this.getEntityById(-2)?.currentSnapshot.frame, this.frame);

			player.connection.queueCommand({
				command: 'serverStateBundle',
				serverFrame: this.frame,
				clientFrame: this.frame + player.lastEstimatedRtt + UPDATE_BUFFER_SIZE,
				entityUpdates: player.queuedEntityUpdates,
				lastReceivedPeriodId: player.lastReceivedPeriodId,
				rewindToFrameCap: rewindToFrameCap
			}, false);

			for (let [timestamp, receiveTime] of this.pendingPings.get(player)) {
				let elapsed = now - receiveTime;
				player.connection.queueCommand({
					command: 'pong',
					timestamp,
					subtract: elapsed
				}, false);
			}
			this.pendingPings.get(player).clear();

			player.connection.tick();
		}
	}

	onClientStateReceived(player: Player, msg: CommandToData<'clientStateBundle'>) {
		this.tryAdvanceGame(); // First, advance the game as much as we can

		player.lastEstimatedRtt = Math.max(this.frame - msg.serverFrame, 0);

		// Filter out updates received by the server
		let periods = msg.periods.filter(period => {
			return period.id > player.lastReceivedPeriodId;
		});

		if (this.frame - Util.last(periods).end >= TWICE_CLIENT_UPDATE_PERIOD) return; // Pretend like it was never sent

		player.lastReceivedPeriodId = Util.last(periods).id;

		// Filter out updates received by the client
		Util.filterInPlace(player.queuedEntityUpdates, x => x.updateId > msg.lastReceivedServerUpdateId);
		Util.filterInPlace(this.awaitingAck, x => x.player !== player || x.update.updateId > msg.lastReceivedServerUpdateId);
		player.lastReceivedServerUpdateId = msg.lastReceivedServerUpdateId;

		let entityUpdates: EntityUpdate[] = periods.map(x => x.entityUpdates).flat();
		let entityIds = new Set(entityUpdates.map(x => x.entityId));
		let affectionGraph = periods.map(x => x.affectionGraph).flat();
		let entityInfo = periods.map(x => x.entityInfo).flat().reduce((curr, next) => {
			let index = curr.findIndex(y => y.entityId === next.entityId);

			if (index === -1) {
				curr.push(next);
			} else {
				curr[index].earliestUpdateFrame = Math.min(curr[index].earliestUpdateFrame, next.earliestUpdateFrame);
				curr[index].ownedAtSomePoint ||= next.ownedAtSomePoint;
			}

			return curr;
		}, [] as EntityInfo[]);

		// todo: enforce this client side?
		Util.filterInPlace(affectionGraph, x => entityIds.has(x.from) && entityIds.has(x.to));

		let bundle: UpdateBundle = {
			maxFrame: Math.max(...entityUpdates.map(x => x.frame)),
			updates: entityUpdates,
			affectionGraph: affectionGraph,
			entityInfo: entityInfo,
			player,
			start: periods[0].start,
			end: Util.last(periods).end
		};
		this.queuedBundles.push(bundle);

		//bundle.theLong = Util.last(periods).end - periods[0].start > 120 && periods[0].start > 0;
	}

	update() {
		this.frame++;

		for (let i = 0; i < this.queuedBundles.length; i++) {
			let bundle = this.queuedBundles[i];
			if (bundle.maxFrame > this.frame) continue; // Lata bitch

			this.processUpdateBundle(bundle);
			this.queuedBundles.splice(i--, 1);
		}

		for (let [, entity] of this.entities) {
			entity.update();
		}
	}

	processUpdateBundle(bundle: UpdateBundle) {
		//if (bundle.theLong) debugger;

		let processed = new Set<EntityUpdate>();
		const propagateOwnership = (update: EntityUpdate) => {
			if (processed.has(update)) return;
			processed.add(update);

			for (let edge of bundle.affectionGraph) {
				if (edge.from === update.entityId) {
					let otherUpdate = bundle.updates.find(x => x.entityId === edge.to);

					otherUpdate.owned = true;
					propagateOwnership(otherUpdate);
				}
			}
		};

		for (let update of bundle.updates) {
			if (update.owned) propagateOwnership(update);
		}

		let excludedUpdates: EntityUpdate[] = [];

		const propagateDeletion = (update: EntityUpdate) => {
			if (excludedUpdates.includes(update)) return;
			excludedUpdates.push(update);

			/*if (!update.challengeable) */for (let edge of bundle.affectionGraph) {
				if (edge.from === update.entityId) propagateDeletion(bundle.updates.find(x => x.entityId === edge.to));
			}

			Util.filterInPlace(bundle.affectionGraph, x => x.from !== update.entityId && x.to !== update.entityId);
		};

		let toDelete: EntitySnapshot[] = [];
		for (let update of bundle.updates) {
			let entity = this.getEntityById(update.entityId);
			let frameLow = Math.max(
				bundle.entityInfo.find(x => x.entityId === entity.id).earliestUpdateFrame,
				bundle.player.highestSeenEntityFrame.get(entity)
			);
			let canApplyUpdate = entity.canApplyUpdate(update, bundle.player, frameLow, bundle.start);

			if (!canApplyUpdate) {
				propagateDeletion(update);
			} else {
				if (update.owned) {
					let snapshot: EntitySnapshot = null;

					for (let i = entity.snapshots.length-1; i >= 0; i--) {
						if (entity.snapshots[i].frame > update.frame) snapshot = entity.snapshots[i];
						else break;
					}

					if (snapshot) toDelete.push(snapshot);
				}
			}

			bundle.player.highestSeenEntityFrame.set(entity, update.frame);
		}

		let deleted = this.deleteEntitySnapshotsIfLegal(toDelete, bundle.player);
		for (let snapshot of toDelete) {
			if (!deleted.includes(snapshot)) {
				excludedUpdates.push(bundle.updates.find(x => x.entityId === snapshot.update.entityId));
			}
		}

		let yaNoMeEnojoContigo: EntitySnapshot[] = [];
		for (let [, entity] of this.entities) {
			if (entity.currentSnapshot.owner === bundle.player.id) {
				let soloObservoYPienso = entity.snapshots.find(x => x.frame >= bundle.start);
				if (soloObservoYPienso) yaNoMeEnojoContigo.push(soloObservoYPienso);
			}
		}

		let baraBaraBara = excludedUpdates.some(x => this.getEntityById(x.entityId).currentSnapshot.owner === bundle.player.id);
		let deletedSnapshots = baraBaraBara ? [] : this.deleteEntitySnapshotsIfLegal(yaNoMeEnojoContigo, bundle.player);
		for (let snapshot of yaNoMeEnojoContigo) {
			let entity = this.getEntityById(snapshot.update.entityId);
			let bestSnapshot = entity.getBestSnapshot();

			for (let player of this.players) {
				if ((player !== bundle.player) === deletedSnapshots.includes(snapshot)) {
					console.log("kicked");
					entity.versions.set(player, entity.versions.get(player) + 1);
					this.sendEntityUpdateToPlayerOnce(player, bestSnapshot.update, true);
				}
			}
		}

		let snapshots: EntitySnapshot[] = [];
		for (let update of bundle.updates) {
			if (excludedUpdates.includes(update)) {
				let entity = this.getEntityById(update.entityId);
				let bestSnapshot = entity.getBestSnapshot();

				entity.versions.set(bundle.player, Math.max(update.version + 1, entity.versions.get(bundle.player)));
				this.sendEntityUpdateToPlayerOnce(bundle.player, bestSnapshot.update, true);

				continue;
			}

			snapshots.push({
				frame: update.frame,
				update: update,
				owner: null,
				outgoing: null
			});
		}

		for (let snapshot of snapshots) {
			snapshot.outgoing = snapshots.filter(x => bundle.affectionGraph.some(y => y.from === snapshot.update.entityId && y.to === x.update.entityId));
			this.getEntityById(snapshot.update.entityId).insertSnapshot(snapshot);
		}

		for (let edge of bundle.affectionGraph) {
			let s1 = snapshots.find(x => x.update.entityId === edge.from);
			let s2 = snapshots.find(x => x.update.entityId === edge.to);

			s2.owner = s1.owner;
		}

		//console.log(snapshots.map(x => x.owner));
	}

	deleteEntitySnapshotsIfLegal(snapshots: EntitySnapshot[], player: Player) {
		let legality = new Map<EntitySnapshot, boolean>();
		let visited = new Set<EntitySnapshot>();

		const deleteIfLegal = (snapshot: EntitySnapshot) => {
			if (legality.has(snapshot)) return legality.get(snapshot);
			visited.add(snapshot);

			let entity = this.getEntityById(snapshot.update.entityId);
			let snapshotIndex = Util.findLastIndex(entity.snapshots, x => x === snapshot);
			if (snapshotIndex === -1) throw new Error("Yo sussy boi this shouldn't happen 😳😳");

			let result = true;

			for (let i = snapshotIndex; i < entity.snapshots.length; i++) {
				let snapshot = entity.snapshots[i];
				if (legality.has(snapshot)) {
					result = legality.get(snapshot);
					break;
				}

				if (entity.canDeleteUpdate(snapshot.update, player)) {
					for (let otherSnapshot of snapshot.outgoing) {
						if (!visited.has(otherSnapshot) && !deleteIfLegal(otherSnapshot)) {
							result = false;
							break;
						}
					}
				} else {
					result = false;
					break;
				}
			}

			if (result === false) {
				this.sendEntityUpdateToPlayerOnce(player, entity.getBestSnapshot().update, true);
			} else {
				while (entity.snapshots.length >= snapshotIndex + 1) {
					let removedSnapshot = entity.snapshots.pop();
					visited.add(removedSnapshot);
				}
			}

			legality.set(snapshot, result);
			return result;
		};

		let ableToDelete: EntitySnapshot[] = [];
		for (let snapshot of snapshots) {
			if (deleteIfLegal(snapshot)) ableToDelete.push(snapshot);
		}

		return ableToDelete;
	}

	sendEntityUpdateToPlayerOnce(player: Player, update: EntityUpdate, mustAck: boolean) {
		Util.filterInPlace(player.queuedEntityUpdates, x => x.entityId !== update.entityId);

		let entity = this.getEntityById(update.entityId);

		update = { ...update };
		update.updateId = this.incrementalUpdateId++;
		update.version = entity.versions.get(player);

		player.queuedEntityUpdates.push(update);
		if (mustAck && !this.awaitingAck.some(x => x.player === player && x.update.entityId === update.entityId)) this.awaitingAck.push({
			update,
			player
		});
	}
}