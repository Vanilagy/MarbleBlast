import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const TWICE_CLIENT_UPDATE_PERIOD = 4 * 2; // todo remove hardcode?
const UPDATE_BUFFER_SIZE = 1; // In ticks

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
		this.increaseVersion(lastOwnerUpdate); // Invalidate it for the other player
		this.owner = newerOwnerUpdate.originator;

		this.game.queueEntityUpdate(newerOwnerUpdate);
	}

	increaseVersion(update: EntityUpdate) {
		this.versions.set(update.originator, update.version + 1);
	}
}

class Player {
	connection: GameServerConnection;
	id: number;

	queuedEntityUpdates: EntityUpdate[] = [];
	lastReceivedClientUpdateId = -1;
	lastReceivedClientFrame = -1;

	maxEntityFrames = new DefaultMap<number, number>(() => -1);

	constructor(connection: GameServerConnection, id: number) {
		this.connection = connection;
		this.id = id;
	}
}

interface UpdateGroup {
	player: Player,
	entityIds: number[],
	entityUpdates: EntityUpdate[]
}

const getMaxFrame = (group: UpdateGroup) => {
	return Math.max(...group.entityUpdates.map(x => x.frame));
};

const getEarliestUpdateForEntityId = (group: UpdateGroup, entityId: number) => {
	return group.entityUpdates.filter(x => x.entityId === entityId)
		.sort((a, b) => a.frame - b.frame)[0];
};

const getLatestUpdateForEntityId = (group: UpdateGroup, entityId: number) => {
	return group.entityUpdates.filter(x => x.entityId === entityId)
		.sort((a, b) => b.frame - a.frame)[0];
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

	pendingPings = new DefaultMap<GameServerConnection, Map<number, number>>(() => new Map());

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
		let player = new Player(connection, this.players.length);

		this.players.push(player);

		//connection.addedOneWayLatency = 50;

		connection.queueCommand({
			command: 'gameInfo',
			playerId: player.id,
			serverTick: this.frame,
			clientTick: this.frame + UPDATE_BUFFER_SIZE // No better guess yet
		});

		connection.on('clientStateBundle', data => {
			this.onClientStateReceived(player, data);
		});

		connection.on('timeState', data => {
			this.tryAdvanceGame();

			let rtt = Math.max(this.frame - data.serverTick, 0);
			//let oneWayThing = Math.max(this.tickIndex - data.serverTick, 0);

			//console.log(data, rtt);
			//console.log(connection.sessionId, data.actualThing - this.tickIndex);

			connection.queueCommand({
				command: 'timeState',
				serverTick: this.frame,
				clientTick: this.frame + rtt + UPDATE_BUFFER_SIZE
			});

			/*
			let timeouts = this.updateTimeouts.get(connection);
			for (let [objectId, expiration] of timeouts) {
				if (data.serverTick >= expiration) timeouts.delete(objectId);
			}
			*/
		});

		connection.on('ping', ({ timestamp }) => {
			let now = performance.now();
			this.pendingPings.get(connection).set(timestamp, now);
		});
	}

	getEntityById(id: number) {
		if (this.entities.has(id)) return this.entities.get(id);

		// Create a new entity entry
		let entity = new Entity(id, this);
		this.entities.set(id, entity);

		return entity;
	}

	queueEntityUpdate(update: EntityUpdate) {
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
		this.tryAdvanceGame();

		// Loop over all queued updates and players
		for (let update of this.queuedEntityUpdates) {
			for (let player of this.players) {
				// Because of the version numbers assigned to each update, we need to send slightly different updates to each player. Here, we generates these.

				// First, filter out the updates for the entity so we start fresh
				player.queuedEntityUpdates = player.queuedEntityUpdates.filter(x => {
					return x.entityId !== update.entityId;
				});

				let copiedUpdate = { ...update }; // Create a shallow copy
				let entity = this.getEntityById(update.entityId);

				// Set the version
				copiedUpdate.version = entity.versions.get(player.id);

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
				entityUpdates: player.queuedEntityUpdates,
				lastReceivedClientUpdateId: player.lastReceivedClientUpdateId,
				lastReceivedClientFrame: player.lastReceivedClientFrame,
				rewindToFrameCap: rewindToFrameCap
			}, false);

			player.connection.tick();
		}
	}

	onClientStateReceived(player: Player, msg: CommandToData<'clientStateBundle'>) {
		// Filter out updates received by the server
		msg.entityUpdates = msg.entityUpdates.filter(update => {
			return update.updateId > player.lastReceivedClientUpdateId
				&& update.frame > player.maxEntityFrames.get(update.entityId);
		});

		// Filter out updates received by the client
		player.queuedEntityUpdates = player.queuedEntityUpdates.filter(update => {
			return update.updateId > msg.lastReceivedServerUpdateId;
		});

		// Update this
		player.lastReceivedClientUpdateId = Math.max(
			player.lastReceivedClientUpdateId,
			...msg.entityUpdates.map(update => update.updateId)
		);

		player.lastReceivedClientFrame = msg.currentClientFrame;

		let entityIds = new Set(msg.entityUpdates.map(x => x.entityId));

		for (let entityId of entityIds) {
			let affecting = getAffectingSubgraph(entityId, msg.affectionGraph);
			let updates = msg.entityUpdates.filter(x => affecting.includes(x.entityId));

			let newGroup: UpdateGroup = {
				player,
				entityIds: affecting,
				entityUpdates: updates
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

			player.maxEntityFrames.set(
				entityId,
				Math.max(...msg.entityUpdates.filter(x => x.entityId === entityId).map(x => x.frame))
			);
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

			let earliestCandidateUpdate = getEarliestUpdateForEntityId(group, id);
			let lastCandidateUpdate = getLatestUpdateForEntityId(group, id);

			// If the new update has a lower version, we definitely don't want to merge
			if (entity.versions.get(lastCandidateUpdate.originator) > lastCandidateUpdate.version) {
				return false;
			}

			let anyOwned = group.entityUpdates.some(x => x.entityId === id && x.owned);
			if (!anyOwned) continue;

			// Check if the new update is too far in the past
			if (entity.owner !== group.player.id && lastStoredUpdate.frame >= earliestCandidateUpdate.frame) {
				if (this.frame - earliestCandidateUpdate.frame > TWICE_CLIENT_UPDATE_PERIOD) {
					console.log("THESE");
					return false;
				}
			}

			// Check if there are any ownership conficts
			outer:
			if (entity.owner !== null) {
				let trueUpdate = entity.getTrueUpdate();
				if (trueUpdate.originator !== entity.owner) break outer; // The ownership has "expired" in the sense that it lost its power to prevent other updates.

				let entityIsChallengeable = lastStoredUpdate.challengeable;
				if (!entityIsChallengeable && lastCandidateUpdate.originator !== entity.owner) {
					return false;
				}
			}
		}

		return true;
	}

	applyUpdateGroup(group: UpdateGroup) {
		for (let update of group.entityUpdates) {
			if (!update.state) continue; // It's one of the empty state updates

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

			entity.increaseVersion(update);

			// Check if we own the entity. If so, revoke the ownership.
			if (update.owned && entity.owner === update.originator) {
				entity.owner = null;
			}

			this.queueEntityUpdate(entity.getTrueUpdate());
		}
	}
}