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

	currentUpdate: EntityUpdate = null;
	owner: number = null;
	versions = new DefaultMap<Player, number>(() => 0); // Still don't know if this is the best solution

	constructor(id: number, game: Game3) {
		this.id = id;
		this.game = game;
	}

	getInitialUpdate(): EntityUpdate {
		return {
			updateId: -1,
			entityId: this.id,
			frame: 0,
			owned: false,
			challengeable: false,
			originator: 0,
			version: 0,
			state: null
		};
	}

	canApplyUpdate(update: EntityUpdate, player: Player) {
		if (!this.currentUpdate) return true;

		if (update.version < this.versions.get(player)) return false;

		if (this.owner !== null && update.originator !== this.owner) {
			if (update.frame - this.currentUpdate.frame < TWICE_CLIENT_UPDATE_PERIOD) return false;
		}

		return true;
	}

	applyUpdate(update: EntityUpdate) {
		this.currentUpdate = update;

		if (update.owned) {
			if (update.originator !== this.owner) {
				for (let player of this.game.players) {
					if (player.id === update.originator) continue;

					this.versions.set(player, this.versions.get(player) + 1);
				}
			}

			this.owner = update.originator;
		}
	}

	queueSend() {
		if (!this.currentUpdate) return;

		for (let player of this.game.players) {
			if (player.id === this.owner) continue;

			Util.filterInPlace(player.queuedEntityUpdates, x => x.entityId !== this.id);

			let leUpdate = { ...this.currentUpdate, version: this.versions.get(player) };
			leUpdate.updateId = this.game.incrementalUpdateId++;
			player.queuedEntityUpdates.push(leUpdate);
		}
	}
}

interface UpdateBundle {
	start: number,
	end: number,
	player: Player,
	worldState: EntityUpdate[],
	affectionGraph: { from: number, to: number, frame: number }[]
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
	queuedUpdateBundles: UpdateBundle[] = [];
	affectionGraph: { from: number, to: number, frame: number }[] = [];

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

		if (this.frame - msg.clientFrame >= TWICE_CLIENT_UPDATE_PERIOD) return; // Sorry you're too old 😩

		// Filter out updates received by the client
		Util.filterInPlace(player.queuedEntityUpdates, update => {
			return update.updateId > msg.lastReceivedServerUpdateId;
		});

		// Filter out already-seen edges
		Util.filterInPlace(msg.affectionGraph, x => x.frame > player.maxAffectionEdgeFrame);

		let updateBundle: UpdateBundle = {
			start: player.maxAffectionEdgeFrame,
			end: msg.clientFrame,
			player: player,
			worldState: msg.worldState,
			affectionGraph: msg.affectionGraph
		};
		this.queuedUpdateBundles.push(updateBundle);

		player.maxAffectionEdgeFrame = Util.last(msg.affectionGraph)?.frame ?? player.maxAffectionEdgeFrame;
	}

	update() {
		this.frame++;

		for (let i = 0; i < this.queuedUpdateBundles.length; i++) {
			let bundle = this.queuedUpdateBundles[i];
			if (bundle.end > this.frame) continue;

			this.processUpdateBundle(bundle);

			this.queuedUpdateBundles.splice(i--, 1);
		}
	}

	processUpdateBundle(bundle: UpdateBundle) {
		for (let [, entity] of this.entities) {
			if (!bundle.worldState.some(x => x.entityId === entity.id)) {
				bundle.worldState.push(entity.getInitialUpdate());
			}
		}

		let disallowed = new Set<number>();

		for (let update of bundle.worldState) {
			let entity = this.getEntityById(update.entityId);
			if (!entity.canApplyUpdate(update, bundle.player)) disallowed.add(entity.id);
		}

		let old = this.affectionGraph.slice(); // todo optimize
		this.affectionGraph.push(...bundle.affectionGraph);
		let relevantEdges = this.affectionGraph.filter(x => x.frame >= bundle.start && x.frame <= bundle.end);
		this.affectionGraph = old; // WACK

		while (true) {
			let madeChange = false;

			for (let edge of relevantEdges) {
				if (disallowed.has(edge.from) && !disallowed.has(edge.to)) {
					disallowed.add(edge.to);
					madeChange = true;
				}
			}

			if (!madeChange) break;
		}

		for (let update of bundle.worldState) {
			if (disallowed.has(update.entityId)) continue;

			let entity = this.getEntityById(update.entityId);
			entity.applyUpdate(update);
		}

		let urgh: { from: number, to: number, frame: number }[] = [];
		for (let edge of bundle.affectionGraph) {
			if (!disallowed.has(edge.from) && !disallowed.has(edge.to)) {
				this.affectionGraph.push(edge);
				urgh.push(edge);
			}
		}

		let changed = new Set<Entity>();
		while (true) {
			let changeMade = false;

			for (let edge of urgh) {
				let e1 = this.getEntityById(edge.from);
				let e2 = this.getEntityById(edge.to);

				if (changed.has(e2)) continue;

				if (e2.owner !== e1.owner) {
					e2.owner = e1.owner;
					changeMade = true;

					changed.add(e2);
				}
			}

			if (!changeMade) break;
		}

		for (let [, entity] of [...this.entities].filter(x => !disallowed.has(x[1].id))) {
			entity.queueSend();
		}
	}
}