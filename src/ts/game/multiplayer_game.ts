import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { DefaultMap } from "../../../shared/default_map";
import { FixedFormatBinarySerializer, FormatToType } from "../../../shared/fixed_format_binary_serializer";
import { GameServerConnection } from "../../../shared/game_server_connection";
import { CommandToData, entityStateFormat, EntityUpdate, playerFormat } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { Mission } from "../mission";
import { GameServer } from "../net/game_server";
import { Util } from "../util";
import { Entity } from "./entity";
import { Game } from "./game";
import { MultiplayerGameSimulator } from "./multiplayer_game_simulator";
import { MultiplayerGameState } from "./multiplayer_game_state";
import { Player } from "./player";

const networkStatsElement = document.querySelector('#network-stats') as HTMLDivElement;

let sendTimeout = 0;

// todo make sure to remove this eventually
window.addEventListener('keydown', e => {
	if (e.code === 'KeyG') {
		sendTimeout = 200;
		console.log("activated timeout");
	}
});

export class MultiplayerGame extends Game {
	state: MultiplayerGameState;
	simulator: MultiplayerGameSimulator;

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

		this.connection.on('pong', ({ timestamp, subtract }) => {
			let now = performance.now();
			let rtt = now - timestamp - subtract;

			this.recentRtts.push({
				value: rtt,
				timestamp: now
			});
		});

		this.connection.on('serverStateBundle', data => {
			this.onServerStateBundle(data);
		});

		this.connection.on('timeState', data => {
			this.state.supplyServerTimeState(data.serverFrame, data.targetFrame);
		});

		this.connection.on('playerJoin', data => {
			this.addPlayer(data);
		});

		setInterval(() => {
			this.displayNetworkStats();
		}, 1000 / 20);
	}

	createState() { this.state = new MultiplayerGameState(this); }
	createSimulator() { this.simulator = new MultiplayerGameSimulator(this); }

	async start() {
		this.connection.queueCommand({
			command: 'joinMission',
			missionPath: this.mission.path
		}, true);

		let response = await new Promise<CommandToData<'gameJoinInfo'>>(resolve => {
			const callback = (data: CommandToData<'gameJoinInfo'>) => {
				this.connection.off('gameJoinInfo', callback);
				resolve(data);
			};
			this.connection.on('gameJoinInfo', callback);
		});

		console.log(response);

		this.seed = response.seed; // Todo: Sync this even before initting

		this.state.supplyServerTimeState(response.serverFrame, response.clientFrame);

		for (let playerData of response.players) {
			await this.addPlayer(playerData);
		}

		this.localPlayer = this.players.find(x => x.id === response.localPlayerId);
		this.localPlayer.controlledMarble.addToGame();

		for (let entity of this.entities) {
			// temp this is probably temp
			entity.loadState(entity.getInitialState(), { frame: 0, remote: false });
		}

		for (let update of response.entityStates) {
			this.applyRemoteEntityUpdate(update);
		}

		super.start();
	}

	async addPlayer(data: FormatToType<typeof playerFormat>) {
		let player = new Player(this, data.id);
		let marble = new Marble(this, data.marbleId, data.checkpointStateId);

		this.players.push(player);
		this.addEntity(player);

		await marble.init();
		this.marbles.push(marble);
		this.addEntity(marble);
		this.addEntity(marble.checkpointState);

		player.controlledMarble = marble;
		marble.controllingPlayer = player;
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
		this.connection.queueCommand({ command: 'ping', timestamp }, false);

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
		this.connection.queueCommand(bundle, false);
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

	displayNetworkStats() {
		if (!this.started) return;

		let now = performance.now();
		while (this.recentRtts.length > 0 && now - this.recentRtts[0].timestamp > 2000) this.recentRtts.shift();
		while (this.incomingTimes.length > 0 && now - this.incomingTimes[0][0] > 1000) this.incomingTimes.shift();
		while (this.outgoingTimes.length > 0 && now - this.outgoingTimes[0][0] > 1000) this.outgoingTimes.shift();

		while (this.tickDurations.length > 0 && now - this.tickDurations[0].start > 1000) this.tickDurations.shift();
		while (this.simulator.advanceTimes.length > 0 && now - this.simulator.advanceTimes[0] > 1000) this.simulator.advanceTimes.shift();
		while (this.simulator.reconciliationDurations.length > 0 && now - this.simulator.reconciliationDurations[0].start > 1000) this.simulator.reconciliationDurations.shift();

		//let medianRtt = Util.computeMedian(this.recentRtts.map(x => x.value));
		let averageRtt = this.recentRtts.map(x => x.value).reduce((a, b) => a + b, 0) / this.recentRtts.length;
		let jitter = this.recentRtts.map(x => Math.abs(x.value - averageRtt)).reduce((a, b) => a + b, 0) / this.recentRtts.length;
		let averageTickDuration = this.tickDurations.map(x => x.duration).reduce((a, b) => a + b, 0) / this.tickDurations.length;
		let averageReconciliationDuration = this.simulator.reconciliationDurations.map(x => x.duration).reduce((a, b) => a + b, 0) / this.simulator.reconciliationDurations.length;

		networkStatsElement.textContent = `
			Ping: ${isNaN(averageRtt)? 'N/A' : averageRtt.toFixed(1) + ' ms'}
			Jitter: ${isNaN(jitter)? 'N/A' : jitter.toFixed(1) + ' ms'}
			Incoming packets/s: ${this.incomingTimes.length}
			Outgoing packets/s: ${this.outgoingTimes.length}
			Downstream: ${(this.incomingTimes.map(x => x[1]).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} kB/s
			Upstream: ${(this.outgoingTimes.map(x => x[1]).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} kB/s
			Server frame: ${this.state.serverFrame}
			Client frame: ${this.state.frame}
			Target frame: ${this.state.targetFrame}
			Frames ahead server: ${this.state.frame - this.state.serverFrame}
			Frames ahead target: ${this.state.frame - this.state.targetFrame}
			Server update rate: ${GAME_UPDATE_RATE} Hz
			Client update rate: ${this.lastUpdateRate | 0} Hz
			Advancements/s: ${this.simulator.advanceTimes.length}
			Tick duration: ${averageTickDuration.toFixed(2)} ms
			Reconciliation duration: ${isNaN(averageReconciliationDuration)? 'N/A' : averageReconciliationDuration.toFixed(2) + ' ms'}
			Reconciliation frames: ${this.simulator.lastReconciliationFrames}
			Send timeout: ${Math.max(0, sendTimeout)}
		`;

		document.body.style.filter = sendTimeout <= 0 ? '' : 'saturate(0.25)';
	}

	stop() {
		super.stop();

		this.connection.beforeTick = null;
		this.connection.onIncomingPacket = null;
		this.connection.onOutgoingPacket = null;
		this.connection.clearAllHandlers();
	}
}