import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate, entityUpdateFormat } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const TWICE_CLIENT_UPDATE_PERIOD = 4 * 2; // todo remove hardcode?
const UPDATE_BUFFER_SIZE = 1; // In ticks

type EntityInfo = CommandToData<'clientStateBundle'>["periods"][number]["entityInfo"][number];

class Entity {
	id: number;
	game: Game;

	updates: EntityUpdate[] = [];
	owner: number = null;
	versions = new DefaultMap<number, number>(() => 0);

	constructor(id: number, game: Game) {
		this.id = id;
		this.game = game;
	}

	getTrueUpdate() {
		if (this.owner) {
			// If there's an owner, search for the last update by the owner that isn't too far in the past.
			let ownerUpdate = Util.findLast(this.updates, update => {
				return update.originator === this.owner;
			});

			if (this.game.frame - ownerUpdate.frame <= TWICE_CLIENT_UPDATE_PERIOD)
				return ownerUpdate;
		}

		// Otherwise, just return the last update
		return this.updates[this.updates.length - 1] ?? null;
	}

	insertUpdate(update: EntityUpdate) {
		for (let i = this.updates.length-1; i >= 0; i--) {
			let otherUpdate = this.updates[i];

			if (otherUpdate.frame <= update.frame) {
				this.updates.splice(i + 1, 0, update);
				return;
			}
		}

		this.updates.push(update);
	}

	maybeUpdateOwnership() {
		if (this.owner === null) return;

		let lastOwnerUpdate = Util.findLast(this.updates, update => {
			return update.originator === this.owner;
		});

		if (this.game.frame - lastOwnerUpdate.frame <= TWICE_CLIENT_UPDATE_PERIOD) return; // The ownership is still valid

		// See if there's a newer update
		let newerOwnerUpdate = Util.findLast(this.updates, update => {
			return this.game.frame - update.frame <= TWICE_CLIENT_UPDATE_PERIOD
				&& update.owned
				&& update.originator !== this.owner;
		});

		if (!newerOwnerUpdate) return;

		// We won the challenge! Pass the ownership to the other player.
		this.versions.set(this.owner, lastOwnerUpdate.version + 1); // Invalidate it for the other player
		this.owner = newerOwnerUpdate.originator;

		this.game.queueEntityUpdate(newerOwnerUpdate);
	}
}

class Player {
	connection: GameServerConnection;
	id: number;
	marbleId: number;

	queuedEntityUpdates: EntityUpdate[] = [];
	lastReceivedPeriodId = -1;
	lastEstimatedRtt = 0;

	constructor(connection: GameServerConnection, id: number, marbleId: number) {
		this.connection = connection;
		this.id = id;
		this.marbleId = marbleId;
	}
}

interface UpdateGroup {
	player: Player,
	entityIds: number[],
	entityUpdates: EntityUpdate[],
	entityInfo: EntityInfo[],
	periodStart: number
}

export class Game {
	missionPath: string;
	players: Player[] = [];

	startTime: number;
	lastAdvanceTime: number;

	frame = -1;
	entities = new Map<number, Entity>();

	queuedEntityUpdates: EntityUpdate[] = [];
	incrementalUpdateId = 0;

	queuedUpdateGroups: UpdateGroup[] = [];

	pendingPings = new DefaultMap<Player, Map<number, number>>(() => new Map());

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

		//connection.addedOneWayLatency = 50;

		connection.queueCommand({
			command: 'gameJoinInfo',
			serverTick: this.frame,
			clientTick: this.frame + UPDATE_BUFFER_SIZE, // No better guess yet
			players: this.players.map(x => ({
				id: x.id,
				marbleId: x.marbleId
			})),
			localPlayerId: player.id,
			entityStates: [...this.entities].map(([, entity]) => entity.getTrueUpdate())
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

	queueEntityUpdate(update: EntityUpdate) {
		if (!update) return;

		for (let i = 0; i < this.queuedEntityUpdates.length; i++) {
			if (this.queuedEntityUpdates[i].entityId === update.entityId)
				this.queuedEntityUpdates.splice(i--, 1);
		}

		update.updateId = this.incrementalUpdateId++;
		this.queuedEntityUpdates.push(update);
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

		// Loop over all queued updates and players
		for (let update of this.queuedEntityUpdates) {
			for (let player of this.players) {
				// Because of the version numbers assigned to each update, we need to send slightly different updates to each player. Here, we generate these.

				// First, filter out the updates for the entity so we start fresh
				player.queuedEntityUpdates = player.queuedEntityUpdates.filter(x => {
					return x.entityId !== update.entityId;
				});

				let copiedUpdate = { ...update }; // Create a shallow copy
				let entity = this.getEntityById(update.entityId);

				// Set the version
				copiedUpdate.version = entity.versions.get(player.id);

				copiedUpdate.owned = player.id === entity.owner;

				// And add it into the personal queue for this player
				player.queuedEntityUpdates.push(copiedUpdate);
			}
		}

		this.queuedEntityUpdates.length = 0;

		// Send packets to all players
		for (let player of this.players) {
			let rewindToFrameCap = this.frame - TWICE_CLIENT_UPDATE_PERIOD;

			player.connection.queueCommand({
				command: 'serverStateBundle',
				serverTick: this.frame,
				clientTick: this.frame + player.lastEstimatedRtt + UPDATE_BUFFER_SIZE,
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

		player.lastEstimatedRtt = Math.max(this.frame - msg.serverTick, 0);

		// Filter out updates received by the server
		let periods = msg.periods.filter(period => {
			return period.id > player.lastReceivedPeriodId;
		});
		player.lastReceivedPeriodId = msg.periods[msg.periods.length - 1].id;

		if (periods.length > 1) console.log(periods.length);

		// Filter out updates received by the client
		player.queuedEntityUpdates = player.queuedEntityUpdates.filter(update => {
			return update.updateId > msg.lastReceivedServerUpdateId;
		});

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

		let map = new Map<number, EntityUpdate>();
		for (let update of entityUpdates) map.set(update.entityId, update);

		propagateOwnership(entityInfo, affectionGraph);
		for (let info of entityInfo) if (info.ownedAtSomePoint) map.get(info.entityId).owned = true;

		for (let entityId of entityIds) {
			let affecting = getAffectingSubgraph(entityId, affectionGraph);
			let updates = entityUpdates.filter(x => affecting.includes(x.entityId));
			let infos = entityInfo.filter(x => affecting.includes(x.entityId));
			let entityIds = updates.map(x => x.entityId); // The subgraph might contain entities for which no update was sent

			let newGroup: UpdateGroup = {
				player,
				entityIds: entityIds,
				entityUpdates: updates,
				entityInfo: infos,
				periodStart: periods[0].start
			};

			let i: number;
			for (i = 0; i < this.queuedUpdateGroups.length; i++) {
				let oldGroup = this.queuedUpdateGroups[i];

				if (newGroup.entityIds.length === oldGroup.entityIds.length
					&& newGroup.entityUpdates.every(x => oldGroup.entityUpdates.includes(x))) {
					this.queuedUpdateGroups.splice(i, 1, newGroup);
					break;
				}
			}

			if (i === this.queuedUpdateGroups.length)
				this.queuedUpdateGroups.push(newGroup);
		}
	}

	update() {
		this.frame++;

		for (let [, entity] of this.entities) {
			// Ownership might have expired and needs to be passed onto another player.
			entity.maybeUpdateOwnership();
		}

		for (let i = 0; i < this.queuedUpdateGroups.length; i++) {
			let group = this.queuedUpdateGroups[i];

			if (getMaxFrame(group) > this.frame) continue; // Lata bitch

			// Let's check if applying this group update is legal
			if (this.isApplicationLegal(group)) {
				// If it is, apply it!
				this.applyUpdateGroup(group);
			} else {
				// If it isn't, reject it.
				this.rejectUpdateGroup(group);
			}

			// Can remove it, we've processed it now
			this.queuedUpdateGroups.splice(i--, 1);
		}
	}

	isApplicationLegal(group: UpdateGroup) {
		for (let id of group.entityIds) {
			let entity = this.getEntityById(id);
			let lastStoredUpdate = entity.updates[entity.updates.length - 1];

			if (!lastStoredUpdate) continue;

			let updateCandidate = group.entityUpdates.find(x => x.entityId === id);

			// If the new update has a lower version, we definitely don't want to merge
			if (entity.versions.get(updateCandidate.originator) > updateCandidate.version) {
				//console.log(entity.versions.get(updateCandidate.originator), updateCandidate.version, "this");
				return false;
			}

			if (!updateCandidate.owned) continue;

			let entityInfo = group.entityInfo.find(x => x.entityId === id);
			let earliestUpdateFrame = Math.max(entityInfo.earliestUpdateFrame, group.periodStart);

			// Check if the new update is too far in the past
			if (lastStoredUpdate.frame >= earliestUpdateFrame && entity.owner !== updateCandidate.originator) {
				if (this.frame - earliestUpdateFrame > TWICE_CLIENT_UPDATE_PERIOD) {
					console.log("THESE");
					console.log(entity.id, entity.owner, updateCandidate.originator, lastStoredUpdate.frame, entityInfo.earliestUpdateFrame, updateCandidate.frame, this.frame, group.periodStart);
					return false;
				}
			}

			// Check if there are any ownership conficts
			if (entity.owner !== null && updateCandidate.originator !== entity.owner) {
				let trueUpdate = entity.getTrueUpdate();
				if (trueUpdate.originator !== entity.owner) continue; // The ownership has "expired" in the sense that it lost its power to prevent other updates.

				let entityIsChallengeable = lastStoredUpdate.challengeable;
				if (!entityIsChallengeable) {
					console.log(updateCandidate.originator, updateCandidate.entityId, "that");
					return false;
				}
			}
		}

		return true;
	}

	applyUpdateGroup(group: UpdateGroup) {
		for (let update of group.entityUpdates) {
			let entity = this.getEntityById(update.entityId);
			entity.insertUpdate(update);

			if (update.originator === entity.owner) {
				// The owner has all say
				if (!update.owned) entity.owner = null;
			} else if (update.owned) {
				// If we're here, the update is asking to give ownership to its player.
				if (entity.owner === null) {
					// Easy, there was no ownership before
					entity.owner = update.originator;

					for (let player of this.players) {
						if (player.id !== update.originator) {
							entity.versions.set(player.id, entity.versions.get(player.id) + 1);
						}
					}
				} else {
					// This is the "challenge" case
					entity.maybeUpdateOwnership();
				}
			}

			// Queue the update to be sent if it now is the authoritative entity update
			if (entity.getTrueUpdate() === update)
				this.queueEntityUpdate(update);
		}
	}

	rejectUpdateGroup(group: UpdateGroup) {
		for (let update of group.entityUpdates) {
			if (!update.state) continue;

			let entity = this.getEntityById(update.entityId);

			entity.versions.set(update.originator, update.version + 1);

			// Check if we own the entity. If so, revoke the ownership.
			if (entity.owner === update.originator) {
				entity.owner = null;
			}

			this.queueEntityUpdate(entity.getTrueUpdate());
		}
	}
}

const getMaxFrame = (group: UpdateGroup) => {
	return Math.max(...group.entityUpdates.map(x => x.frame));
};

const getAffectingSubgraph = (start: number, graph: { from: number, to: number }[]) => {
	let nodes = [start];

	while (true) {
		let added = false;

		for (let edge of graph) {
			if (nodes.includes(edge.to) && !nodes.includes(edge.from)) {
				nodes.push(edge.from);
				added = true;
			}
		}

		if (!added) break;
	}

	return nodes;
};

const propagateOwnership = (entityInfo: EntityInfo[], affectionGraph: { from: number, to: number }[]) => {
	let owned = new Set<number>();

	for (let info of entityInfo) {
		if (info.ownedAtSomePoint) owned.add(info.entityId);
	}

	while (true) {
		let changeMade = false;

		for (let edge of affectionGraph) {
			if (owned.has(edge.from) && !owned.has(edge.to)) {
				owned.add(edge.to);
				changeMade = true;
			}
		}

		if (!changeMade) break;
	}

	for (let info of entityInfo) {
		info.ownedAtSomePoint = owned.has(info.entityId);
	}
};