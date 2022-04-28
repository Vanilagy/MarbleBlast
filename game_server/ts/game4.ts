import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate, entityUpdateFormat } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const UPDATE_BUFFER_SIZE = 4 + 1 + 10; // In frames

class Player {
	connection: GameServerConnection;
	id: number;
	marbleId: number;

	lastEstimatedRtt = 0;
	lastReceivedClientUpdateFrame = -1;
	queuedEntityUpdates: EntityUpdate[] = [];

	constructor(connection: GameServerConnection, id: number, marbleId: number) {
		this.connection = connection;
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
	}
}

interface BaseState {
	frame: number,
	updates: EntityUpdate[]
}

interface BaseStateRequest {
	entityId: number,
	requestFrame: number,
	sendTo: Set<Player>,
	update: EntityUpdate
}

export class Game4 {
	missionPath: string;
	players: Player[] = [];

	startTime: number;
	lastAdvanceTime: number;

	frame = -1;

	pendingPings = new DefaultMap<Player, Map<number, number>>(() => new Map());
	queuedEntityUpdates: EntityUpdate[] = [];
	incrementalUpdateId = 0;

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

		// Send packets to all players
		for (let player of this.players) {
			player.queuedEntityUpdates.push(...newUpdates.filter(x => x.originator !== player.id));
			player.cleanUpQueuedUpdates();

			player.connection.queueCommand({
				command: 'serverStateBundle',
				serverFrame: this.frame,
				clientFrame: this.frame + player.lastEstimatedRtt + UPDATE_BUFFER_SIZE,
				entityUpdates: player.queuedEntityUpdates,
				baseStateRequest: {
					entities: this.baseStateRequests.map(x => x.entityId)
				},
				baseState: this.baseStateRequests.filter(x => x.update && x.sendTo.has(player)),
				lastReceivedClientUpdateFrame: player.lastReceivedClientUpdateFrame
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
		Util.filterInPlace(player.queuedEntityUpdates, x => x.frame > msg.lastReceivedServerUpdateFrame);

		for (let request of this.baseStateRequests) {
			if (request.sendTo.has(player) && request.requestFrame <= msg.lastReceivedServerFrame)
				request.sendTo.delete(player);
		}
		Util.filterInPlace(this.baseStateRequests, x => x.sendTo.size > 0);

		if (msg.baseState) this.processBaseState(msg);

		for (let id of msg.possibleConflictingEntities) {
			let request = this.baseStateRequests.find(x => x.entityId === id);
			if (!request) {
				request = {
					entityId: id,
					requestFrame: this.frame,
					sendTo: new Set(),
					update: null
				};
				this.baseStateRequests.push(request);
			}

			for (let player of this.players) request.sendTo.add(player);
			request.requestFrame = this.frame;
		}

		if (msg.clientFrame < this.frame) return; // You better be on time

		Util.filterInPlace(msg.entityUpdates, x => x.frame > player.lastReceivedClientUpdateFrame);
		if (msg.entityUpdates.length === 0) return;

		msg.entityUpdates.sort((a, b) => a.frame - b.frame);
		player.lastReceivedClientUpdateFrame = Util.last(msg.entityUpdates).frame;

		Util.filterInPlace(msg.entityUpdates, x => !this.baseStateRequests.some(y => y.entityId === x.entityId && y.sendTo.has(player)));

		this.queuedEntityUpdates.push(...msg.entityUpdates);
		this.queuedEntityUpdates.sort((a, b) => a.frame - b.frame); // Guarantee order
	}

	processBaseState(msg: CommandToData<'clientStateBundle'>) {
		if (this.maxReceivedBaseStateFrame >= msg.baseState.frame) return;

		for (let update of msg.baseState.updates) {
			let request = this.baseStateRequests.find(x => x.entityId === update.entityId);
			if (!request) continue;

			request.update = update;
		}
	}
}