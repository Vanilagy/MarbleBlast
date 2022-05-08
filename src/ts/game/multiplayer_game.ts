import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { DefaultMap } from "../../../shared/default_map";
import { FixedFormatBinarySerializer, FormatToType } from "../../../shared/fixed_format_binary_serializer";
import { GameServerConnection, Reliability } from "../../../shared/game_server_connection";
import { CommandToData, entityStateFormat, EntityUpdate, playerFormat } from "../../../shared/game_server_format";
import { Socket } from "../../../shared/socket";
import { G } from "../global";
import { Marble } from "../marble";
import { Mission } from "../mission";
import { Connectivity } from "../net/connectivity";
import { GameServer } from "../net/game_server";
import { Util } from "../util";
import { Entity } from "./entity";
import { Game } from "./game";
import { MultiplayerGameRenderer } from "./multiplayer_game_renderer";
import { MultiplayerGameSimulator } from "./multiplayer_game_simulator";
import { MultiplayerGameState } from "./multiplayer_game_state";
import { Player } from "./player";

let sendTimeout = 0;

// todo make sure to remove this eventually
window.addEventListener('keydown', e => {
	return;
	if (e.code === 'KeyG') {
		sendTimeout = 200;
		console.log("activated timeout");
	}
});

export class MultiplayerGame extends Game {
	type = 'multiplayer' as const;

	pausable = false;
	state: MultiplayerGameState;
	simulator: MultiplayerGameSimulator;
	renderer: MultiplayerGameRenderer;

	gameServer: GameServer;
	connection: GameServerConnection;
	lastServerTickTime: number = null;
	lastServerStateBundle: CommandToData<"serverStateBundle"> = null;

	lastUpdateRate: number;

	recentRtts: {
		value: number,
		timestamp: number
	}[] = [];

	incomingTimes: [number, number][] = [];
	outgoingTimes: [number, number][] = [];

	queuedEntityUpdates: EntityUpdate[] = [];
	lastQueuedFrame = -1;
	lastSentServerFrame = -1;
	maxReceivedBaseStateId = -1;
	maxReceivedServerUpdateId = -1;
	loneEntityTimeout = new DefaultMap<Entity, number>(() => -Infinity);
	remoteUpdates = new WeakSet<EntityUpdate>();

	constructor(mission: Mission, gameServer: GameServer) {
		super(mission);

		this.gameServer = gameServer;
		this.connection = gameServer.connection;

		this.connection.beforeTick = this.tickConnection.bind(this);
		this.connection.onIncomingPacket = (len) => this.incomingTimes.push([performance.now(), len]);
		this.connection.onOutgoingPacket = (len) => this.outgoingTimes.push([performance.now(), len]);
	}

	createState() { this.state = new MultiplayerGameState(this); }
	createSimulator() { this.simulator = new MultiplayerGameSimulator(this); }
	createRenderer() { this.renderer = new MultiplayerGameRenderer(this); }

	async start() {
		this.connection.queueCommand({
			command: 'join',
			gameId: this.id
		}, Reliability.Urgent);
	}

	async onGameJoinInfo(data: CommandToData<'gameJoinInfo'>) {
		console.log(data);

		this.state.supplyServerTimeState(data.serverFrame, data.clientFrame);

		for (let playerData of data.players) {
			await this.addPlayer(playerData);
		}

		this.localPlayer = this.players.find(x => x.id === data.localPlayerId);
		//this.localPlayer.controlledMarble.addToGame();

		for (let entity of this.entities) {
			// temp this is probably temp
			entity.loadState(entity.getInitialState(), { frame: 0, remote: false });
		}

		for (let update of data.entityStates) {
			this.applyRemoteEntityUpdate(update);
		}

		await super.start();

		Socket.send('loadingCompletion', 1);
		this.connection.queueCommand({ command: 'running' }, Reliability.Urgent);
	}

	tick() {
		if (this.stopped) return;

		let time = performance.now();

		if (this.lastServerTickTime === null) {
			this.lastServerTickTime = time;
		}

		let serverElapsed = time - this.lastServerTickTime;
		while (serverElapsed >= 1000 / GAME_UPDATE_RATE) {
			serverElapsed -= 1000 / GAME_UPDATE_RATE;
			this.lastServerTickTime += 1000 / GAME_UPDATE_RATE;

			this.state.serverFrame++;
			this.state.targetFrame++;
		}

		let updateRateDelta = Util.signedSquare((this.state.targetFrame - this.state.frame) / 2) * 2;
		updateRateDelta = Util.clamp(updateRateDelta, -60, 60);
		let gameUpdateRate = GAME_UPDATE_RATE + updateRateDelta;
		this.lastUpdateRate = gameUpdateRate;

		super.tick(time, gameUpdateRate);
	}

	async onServerStateBundle(data: CommandToData<'serverStateBundle'>) {
		if (sendTimeout > 0) return;

		this.lastServerStateBundle = data;
		this.simulator.queuedServerBundles.push(data); // Queue it up for a later simulation step

		// Mark the incoming updates as being remote
		for (let update of data.entityUpdates) this.remoteUpdates.add(update);
		for (let { update } of data.baseState) this.remoteUpdates.add(update);

		// Remove the updates already received by the server
		Util.filterInPlace(this.queuedEntityUpdates, x => x.frame > data.maxReceivedClientUpdateFrame);

		// Remove the updates we already received
		Util.filterInPlace(data.entityUpdates, x => x.updateId > this.maxReceivedServerUpdateId);
		if (data.entityUpdates.length > 0) this.maxReceivedServerUpdateId = Math.max(...data.entityUpdates.map(x => x.updateId));

		// Remove the base states we already received
		Util.filterInPlace(data.baseState, x => x.id > this.maxReceivedBaseStateId);
		if (data.baseState.length > 0) this.maxReceivedBaseStateId = Math.max(...data.baseState.map(x => x.id));
	}

	tickConnection() {
		if (!this.started) return;

		let timestamp = performance.now();
		this.connection.queueCommand({ command: 'ping', timestamp }, Reliability.Unreliable);

		// Will contain the entities we suspect are conflicting with other players' states.
		let conflictingEntities: Entity[] = [];

		for (let [entityId, history] of this.state.stateHistory) {
			let entity = this.getEntityById(entityId);
			if (entity.affectedBy.size > 1) {
				// The entity was affected by more than one player.
				conflictingEntities.push(entity);
				continue;
			}

			let last = Util.last(history);
			if (!last || last.frame <= this.lastQueuedFrame) continue;

			// We call an entity \textit{expired} if it has been recently changing state but we haven't received a message from its last affecting player in a while.
			let isExpiredEntity = false;
			if (entity.affectedBy.size === 1 && this.lastServerStateBundle && this.state.frame - this.lastServerStateBundle.serverFrame < GAME_UPDATE_RATE) {
				let affector = entity.affectedBy.keys().next().value as Player;
				if (affector !== this.localPlayer && last.frame - affector.lastRemoteStateFrame >= GAME_UPDATE_RATE) {
					isExpiredEntity = true;
				}
			}

			// We periodically mark lone entities (not affected by any player but still changing) and expired entities so that we get base states for them and keep them updates and synchronized.
			if (entity.affectedBy.size === 0 || isExpiredEntity) {
				if (this.state.frame - this.loneEntityTimeout.get(entity) < GAME_UPDATE_RATE) continue;

				conflictingEntities.push(entity);
				this.loneEntityTimeout.set(entity, this.state.frame);

				continue;
			}

			if (!entity.affectedBy.has(this.localPlayer)) continue; // We only wanna send entities the local player affected

			// Remove previously queued updates for this entity
			Util.filterInPlace(this.queuedEntityUpdates, x => x.entityId !== entityId);

			if (entity.sendAllUpdates) {
				this.queuedEntityUpdates.push(...history.filter(x => x.frame > this.lastQueuedFrame));
			} else {
				this.queuedEntityUpdates.push(last);
			}
		}

		Util.filterInPlace(this.queuedEntityUpdates, x => !this.remoteUpdates.has(x)); // Just to be sure

		this.lastQueuedFrame = this.state.frame;

		// Prepare the affection graph
		let affectionGraph = this.state.affectionGraph.filter(x =>
			this.lastServerStateBundle &&
			x.frame > this.lastServerStateBundle.maxReceivedClientUpdateFrame &&
			this.queuedEntityUpdates.some(y => x.from.id === y.entityId || x.to.id === y.entityId)
		);

		// Remove any duplicate edges (same source and target node) and keep only the last one
		let processedAffectionGraph = affectionGraph.filter((x, i1) =>
			!affectionGraph.some((y, i2) => i2 > i1 && x.from === y.from && x.to === y.to)
		).map(x => ({ from: x.from.id, to: x.to.id }));

		let bundle: CommandToData<'clientStateBundle'> = {
			command: 'clientStateBundle',
			serverFrame: this.state.serverFrame,
			clientFrame: this.state.frame,
			entityUpdates: this.queuedEntityUpdates,
			affectionGraph: processedAffectionGraph,
			possibleConflictingEntities: conflictingEntities.map(x => x.id),
			baseState: null,
			maxReceivedServerUpdateId: this.maxReceivedServerUpdateId,
			maxReceivedBaseStateId: this.maxReceivedBaseStateId
		};

		if (this.lastServerStateBundle && this.lastServerStateBundle.baseStateRequests.length > 0 && this.simulator.queuedServerBundles.length === 0) {
			// Compile a base state to send over to the server
			let baseState = {
				frame: this.lastServerStateBundle.serverFrame,
				updates: [] as EntityUpdate[]
			};

			// It is fine to only look at the last server bundle
			for (let id of this.lastServerStateBundle.baseStateRequests) {
				// Get the update closest to the last-received server frame
				let history = this.state.stateHistory.get(id);
				let update = Util.findLast(history, x => x.frame <= baseState.frame);
				if (!update) update = this.state.createInitialUpdate(this.getEntityById(id));

				baseState.updates.push(update);
			}

			bundle.baseState = baseState;
		}

		if (sendTimeout-- > 0) return;
		this.connection.queueCommand(bundle, Reliability.Unreliable);
	}

	applyRemoteEntityUpdate(update: EntityUpdate) {
		let entity = this.getEntityById(update.entityId);
		if (!entity) return;

		if (entity.affectedBy.size > 1) return;

		let history = this.state.stateHistory.get(entity.id);
		while (history.length > 0 && Util.last(history).frame >= update.frame) {
			history.pop();
		}

		entity.loadState(update.state ?? entity.getInitialState(), { frame: update.frame, remote: true });

		history.push(update);
	}

	signalRestartIntent() {
		this.connection.queueCommand({ command: 'restartIntent' }, Reliability.Urgent);
		this.localPlayer.hasRestartIntent = true;
	}

	stop() {
		super.stop();

		this.connection.beforeTick = null;
		this.connection.onIncomingPacket = null;
		this.connection.onOutgoingPacket = null;

		this.connection.queueCommand({ command: 'leave' }, Reliability.Urgent);
	}
}