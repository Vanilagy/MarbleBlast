import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate, entityUpdateFormat } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const TWICE_CLIENT_UPDATE_PERIOD = 4 * 2; // todo remove hardcode?
const UPDATE_BUFFER_SIZE = 1; // In frames

class Player {
	connection: GameServerConnection;
	id: number;
	marbleId: number;

	maxAffectionEdgeFrame = -1;
	lastEstimatedRtt = 0;
	lastReceivedServerUpdateId = -1;

	queuedEntityUpdates: EntityUpdate[] = [];

	constructor(connection: GameServerConnection, id: number, marbleId: number) {
		this.connection = connection;
		this.id = id;
		this.marbleId = marbleId;
	}
}

class Entity {
	id: number;
	game: Game3;

	constructor(id: number, game: Game3) {
		this.id = id;
		this.game = game;
	}
}

export class Game3 {
	missionPath: string;
	players: Player[] = [];

	startTime: number;
	lastAdvanceTime: number;

	frame = -1;
	entities = new Map<number, Entity>();
	incrementalUpdateId = 0;

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
				lastReceivedAffectionGraphFrame: player.maxAffectionEdgeFrame,
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

		player.maxAffectionEdgeFrame = Util.last(msg.affectionGraph)?.frame ?? player.maxAffectionEdgeFrame;
	}

	update() {
		this.frame++;
	}
}