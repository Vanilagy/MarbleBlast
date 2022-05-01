import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate, entityUpdateFormat } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const UPDATE_BUFFER_SIZE = 4 + 1 + 10; // In frames

class Player {
	connection: GameServerConnection;
	game: Game4;
	id: number;
	marbleId: number;

	lastEstimatedRtt = 0;
	lastReceivedClientUpdateFrame = -1;
	queuedEntityUpdates: EntityUpdate[] = [];
	serverBundleBudget = 0;

	constructor(connection: GameServerConnection, game: Game4, id: number, marbleId: number) {
		this.connection = connection;
		this.game = game;
		this.id = id;
		this.marbleId = marbleId;
	}

	cleanUpQueuedUpdates() {
		let count = new DefaultMap<number, number>(() => 0);

		for (let i = this.queuedEntityUpdates.length-1; i >= 0; i--) {
			let update = this.queuedEntityUpdates[i];
			count.set(update.entityId, count.get(update.entityId) + 1);
			let newCount = count.get(update.entityId);
			let maxCount = update.state?.entityType === 'player' ? 8 : 1; // Dirty hardcode 😬

			if (newCount > maxCount) this.queuedEntityUpdates.splice(i, 1);
		}

		if (false) Util.filterInPlace(this.queuedEntityUpdates, x =>
			!this.game.baseStateRequests.some(y =>
				y.entityId === x.entityId && y.sendTo.has(this)
			)
		);
	}
}

interface BaseStateRequest {
	entityId: number,
	responseFrame: number,
	sendTo: Set<Player>,
	sentFrom: Set<Player>,
	update: EntityUpdate,
	id: number
}

export class Game4 {
	missionPath: string;
	players: Player[] = [];

	startTime: number;
	lastAdvanceTime: number;

	frame = -1;

	pendingPings = new DefaultMap<Player, Map<number, number>>(() => new Map());
	queuedEntityUpdates: EntityUpdate[] = [];
	allEntityUpdates: EntityUpdate[] = [];
	affectionGraph: { id: number, from: number, to: number }[] = [];
	incrementalUpdateId = 0;
	baseStateRequestId = 0;

	baseStateRequests: BaseStateRequest[] = [];
	maxReceivedBaseStateFrame = -1;

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

		let player = new Player(connection, this, playerId, marbleId);
		this.players.push(player);

		//connection.addedOneWayLatency = 25;

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

	tryAdvanceGame() {
		let now = performance.now();
		while (now - this.lastAdvanceTime >= 1000 / GAME_UPDATE_RATE) {
			this.update();
			this.lastAdvanceTime += 1000 / GAME_UPDATE_RATE;
		}
	}

	update() {
		this.frame++;
	}

	tickConnections() {
		let now = performance.now();

		this.tryAdvanceGame();

		// Todo for today: Packet loss for server-sent stuff ✅, packet loss for base state-related stuff ✅, and all the cases with long-disconnected playerz 🤔. You can do this! ♥

		let newUpdates = this.queuedEntityUpdates.filter(x => x.frame <= this.frame);
		Util.filterInPlace(this.queuedEntityUpdates, x => x.frame > this.frame);

		newUpdates.forEach(x => x.updateId = this.incrementalUpdateId++);
		this.allEntityUpdates.push(...newUpdates);

		//newUpdates.filter(x => x.entityId === -2).length && console.log(newUpdates.filter(x => x.entityId === -2)[0].frame, newUpdates.filter(x => x.entityId === -2)[0].state.position);

		// Send packets to all players
		for (let player of this.players) {
			player.queuedEntityUpdates.push(...newUpdates.filter(x => x.originator !== player.id));
			player.cleanUpQueuedUpdates();

			if (player.serverBundleBudget === 0) continue;
			player.serverBundleBudget--;

			let curatedBaseStateRequests: BaseStateRequest[] = [];
			for (let i = this.baseStateRequests.length-1; i >= 0; i--) {
				let request = this.baseStateRequests[i];
				if (!request.update || !request.sendTo.has(player)) continue;
				if (curatedBaseStateRequests.some(x => x.entityId === request.entityId)) continue;

				curatedBaseStateRequests.push(request);
			}

			player.connection.queueCommand({
				command: 'serverStateBundle',
				serverFrame: this.frame,
				clientFrame: this.frame + player.lastEstimatedRtt + UPDATE_BUFFER_SIZE,
				entityUpdates: player.queuedEntityUpdates,
				baseStateRequests: [...new Set(this.baseStateRequests.map(x => x.entityId))],
				baseState: curatedBaseStateRequests,
				lastReceivedClientUpdateFrame: player.lastReceivedClientUpdateFrame
			}, false);
		}

		for (let player of this.players) {
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

		player.serverBundleBudget = 2;

		player.lastEstimatedRtt = Math.max(this.frame - msg.serverFrame, 0);
		Util.filterInPlace(player.queuedEntityUpdates, x => x.updateId > msg.maxReceivedServerUpdateId);

		for (let request of this.baseStateRequests) {
			if (request.update && request.sendTo.has(player) && request.id <= msg.maxReceivedBaseStateId)
				request.sendTo.delete(player);
		}
		Util.filterInPlace(this.baseStateRequests, x => x.sendTo.size > 0);

		if (msg.baseState) this.processBaseState(msg, player);

		if (msg.clientFrame < this.frame) return; // You better be on time

		this.affectionGraph.push(...msg.affectionGraph.map(x => ({ from: x.from, to: x.to, id: this.incrementalUpdateId })));

		Util.filterInPlace(msg.entityUpdates, x => x.frame > player.lastReceivedClientUpdateFrame);

		let conflicts = new Set(this.allEntityUpdates.filter(x => x.updateId > msg.maxReceivedServerUpdateId && x.originator !== player.id && msg.entityUpdates.some(y => y.entityId === x.entityId)).map(x => x.entityId));
		for (let id of msg.possibleConflictingEntities) conflicts.add(id);
		let relevantEdges = this.affectionGraph.filter(edge => edge.id > msg.maxReceivedServerUpdateId);

		//if (conflicts.size) console.log("a", conflicts, this.allEntityUpdates.filter(x => x.updateId > msg.maxReceivedServerUpdateId && x.originator !== player.id && msg.entityUpdates.some(y => y.entityId === x.entityId)).map(x => x.entityId), msg.possibleConflictingEntities);

		while (true) {
			let newConflicts: number[] = [];

			for (let id of conflicts) {
				for (let edge of relevantEdges) {
					if (edge.from === id) newConflicts.push(edge.to);
				}
			}

			let changeMade = false;
			for (let id of newConflicts) if (!conflicts.has(id)) {
				conflicts.add(id);
				changeMade = true;
			}

			if (!changeMade) break;
		}

		//if (conflicts.size) console.log("b", conflicts);

		for (let id of conflicts) {
			let request: BaseStateRequest = {
				entityId: id,
				responseFrame: null,
				sendTo: new Set(this.players),
				sentFrom: new Set(),
				update: null,
				id: null
			};
			this.baseStateRequests.push(request);
		}

		//if (player.id === -1 && big > 1000) console.log(msg.entityUpdates, new Set(this.baseStateRequests.filter(x => x.sendTo.has(player)).map(x => x.entityId)));

		if (false && player.id === -1) console.log(this.frame, msg.entityUpdates.length, new Set(this.baseStateRequests.filter(x => x.sendTo.has(player)).map(x => x.entityId)), msg.entityUpdates.filter(x =>
			!this.baseStateRequests.some(y =>
				y.entityId === x.entityId && y.sendTo.has(player)
			)
		).length, conflicts, msg.appliesBaseUpdatesBy, msg.entityUpdates.find(x => x.entityId === -2)?.state?.position);

		if (msg.entityUpdates.length === 0) return;

		msg.entityUpdates.sort((a, b) => a.frame - b.frame);
		player.lastReceivedClientUpdateFrame = Util.last(msg.entityUpdates).frame;

		let disallowedEntities = new Set<number>();
		for (let update of msg.entityUpdates) {
			if (!this.baseStateRequests.some(x => x.entityId === update.entityId && x.sendTo.has(player))) continue;

			const propagate = (e: number) => {
				if (disallowedEntities.has(e)) return;
				disallowedEntities.add(e);
				for (let edge of relevantEdges) if (edge.from === e) propagate(edge.to);
			};
			propagate(update.entityId);
		}

		Util.filterInPlace(msg.entityUpdates, x => !disallowedEntities.has(x.entityId));

		this.queuedEntityUpdates.push(...msg.entityUpdates);
		this.queuedEntityUpdates.sort((a, b) => a.frame - b.frame); // Guarantee order
	}

	processBaseState(msg: CommandToData<'clientStateBundle'>, player: Player) {
		if (this.maxReceivedBaseStateFrame >= msg.baseState.frame) return;
		if (this.baseStateRequests.some(x => x.update && x.sendTo.has(player) && !x.sentFrom.has(player))) return;

		for (let update of msg.baseState.updates) {
			for (let request of this.baseStateRequests) {
				if (request.entityId !== update.entityId) continue;

				if (request.id === null) request.id = this.baseStateRequestId++;

				request.update = update;
				request.sentFrom.add(player);
				request.responseFrame = msg.baseState.frame;
			}
		}
	}
}