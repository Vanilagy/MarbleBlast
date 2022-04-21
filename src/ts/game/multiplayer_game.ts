import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { GameServerConnection } from "../../../shared/game_server_connection";
import { CommandToData, EntityUpdate } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { Mission } from "../mission";
import { GameServer } from "../net/game_server";
import { Util } from "../util";
import { Game } from "./game";
import { MultiplayerGameSimulator } from "./multiplayer_game_simulator";
import { MultiplayerGameState } from "./multiplayer_game_state";
import { Player } from "./player";

const networkStatsElement = document.querySelector('#network-stats') as HTMLDivElement;

const RTT_WINDOW = 2000;

let sendTimeout = 0;

// todo make sure to remove this eventually
window.addEventListener('keydown', e => {
	if (e.code === 'KeyG') {
		sendTimeout = 200;
		console.log("activated timeout");
	}
});

interface Period {
	id: number,
	start: number,
	end: number,
	entityUpdates: EntityUpdate[],
	affectionGraph: { from: number, to: number }[],
	entityInfo: {
		entityId: number,
		earliestUpdateFrame: number,
		ownedAtSomePoint: boolean
	}[],
	size: number
}

export class MultiplayerGame extends Game {
	state: MultiplayerGameState;
	simulator: MultiplayerGameSimulator;

	gameServer: GameServer;
	connection: GameServerConnection;
	lastServerTickTime: number = null;
	lastServerStateBundle: CommandToData<"serverStateBundle"> = null;
	lastReceivedServerUpdateId = -1;

	lastUpdateRate: number;

	recentRtts: {
		value: number,
		timestamp: number
	}[] = [];

	incomingTimes: [number, number][] = [];
	outgoingTimes: [number, number][] = [];

	periods: Period[] = [];
	nextPeriodId = 0;
	lastPeriodUpdateId = 0;
	lastPeriodAffectionEdgeId = 0;
	lastPeriodEnd = -1;

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

		this.connection.on('playerJoin', data => {
			this.addPlayer(data.id, data.marbleId);
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

		this.state.supplyServerTimeState(response.serverFrame, response.clientFrame);

		for (let playerData of response.players) {
			await this.addPlayer(playerData.id, playerData.marbleId);
		}

		this.localPlayer = this.players.find(x => x.id === response.localPlayerId);
		this.localPlayer.controlledMarble.addToGame();

		for (let entity of this.entities) {
			// this is probably temp
			entity.loadState(entity.getInitialState(), { frame: 0, remote: false });
		}

		for (let update of response.entityStates) {
			this.applyRemoteEntityUpdate(update);
		}

		super.start();
	}

	async addPlayer(playerId: number, marbleId: number) {
		let player = new Player(this, playerId);
		let marble = new Marble(this, marbleId);

		this.players.push(player);
		this.addEntity(player);

		await marble.init();
		this.marbles.push(marble);
		this.addEntity(marble);

		player.controlledMarble = marble;
		marble.controllingPlayer = player;
	}

	tick() {
		if (this.stopped) return;

		//console.log(this.state.serverTick, this.state.targetClientTick);

		let time = performance.now();

		if (this.lastServerTickTime === null) {
			this.lastServerTickTime = time;
		}

		let serverElapsed = time - this.lastServerTickTime;
		while (serverElapsed >= 1000 / GAME_UPDATE_RATE) {
			serverElapsed -= 1000 / GAME_UPDATE_RATE;
			this.lastServerTickTime += 1000 / GAME_UPDATE_RATE;

			this.state.serverFrame++;
			this.state.targetClientFrame++;
		}

		let updateRateDelta = Util.signedSquare((this.state.targetClientFrame - this.state.frame) / 2) * 2;
		updateRateDelta = Util.clamp(updateRateDelta, -60, 60);
		let gameUpdateRate = GAME_UPDATE_RATE + updateRateDelta;
		this.lastUpdateRate = gameUpdateRate;

		super.tick(time, gameUpdateRate);
	}

	async onServerStateBundle(data: CommandToData<'serverStateBundle'>) {
		if (sendTimeout > 0) return;

		this.lastServerStateBundle = data;

		this.state.supplyServerTimeState(data.serverFrame, data.clientFrame);

		data.entityUpdates = data.entityUpdates.filter(x => x.updateId > this.lastReceivedServerUpdateId);

		//console.log(data.entityUpdates.find(x => x.entityId === -2)?.frame);

		//console.log(data.entityUpdates);

		this.lastReceivedServerUpdateId = Math.max(
			this.lastReceivedServerUpdateId,
			...data.entityUpdates.map(x => x.updateId)
		);

		// Add them to a queue
		this.simulator.reconciliationUpdates.push(...data.entityUpdates);

		// Remove arrived affection edges
		while (this.state.affectionGraph.length > 0 && this.state.affectionGraph[0].frame <= data.lastReceivedAffectionGraphFrame) {
			this.state.affectionGraph.pop();
		}

		/*
		// Remove arrived periods
		while (this.periods.length > 0 && this.periods[0].id <= data.lastReceivedPeriodId) {
			this.periods.shift();
		}
		*/
	}

	tickConnection() {
		if (!this.started) return;

		let timestamp = performance.now();
		this.connection.queueCommand({ command: 'ping', timestamp }, false);

		let worldState: EntityUpdate[] = [];

		for (let [, history] of this.state.stateHistory) {
			Util.assert(history.length > 0); // Idk this is just here for now 😂😂😂😂😂
			worldState.push(Util.last(history));
		}

		if (sendTimeout-- > 0) return;

		let bundle: CommandToData<'clientStateBundle'> = {
			command: 'clientStateBundle',
			serverFrame: this.state.serverFrame,
			clientFrame: this.state.targetClientFrame,
			worldState: worldState,
			affectionGraph: this.state.affectionGraph.map(x => ({ from: x.id, to: x.id, frame: x.frame })),
			lastReceivedServerUpdateId: this.lastReceivedServerUpdateId
		};
		this.connection.queueCommand(bundle, false);
	}

	applyRemoteEntityUpdate(update: EntityUpdate) {
		let entity = this.getEntityById(update.entityId);
		if (!entity) return;

		let history = this.state.stateHistory.get(entity.id);
		while (history.length > 0 && Util.last(history).frame >= update.frame) {
			history.pop();
		}

		entity.loadState(update.state ?? entity.getInitialState(), { frame: update.frame, remote: true });
		entity.version = update.version;

		update.updateId = -1; // We set the update ID to something negative so that the update NEVER gets sent back to the server
		history.push(update);
	}

	displayNetworkStats() {
		if (!this.started) return;

		let now = performance.now();
		while (this.recentRtts.length > 0 && now - this.recentRtts[0].timestamp > RTT_WINDOW) this.recentRtts.shift();
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
			Target frame: ${this.state.targetClientFrame}
			Frames ahead server: ${this.state.frame - this.state.serverFrame}
			Frames ahead target: ${this.state.frame - this.state.targetClientFrame}
			Server update rate: ${GAME_UPDATE_RATE} Hz
			Client update rate: ${this.lastUpdateRate | 0} Hz
			Advancements/s: ${this.simulator.advanceTimes.length}
			Tick duration: ${averageTickDuration.toFixed(2)} ms
			Reconciliation duration: ${isNaN(averageReconciliationDuration)? 'N/A' : averageReconciliationDuration.toFixed(2) + ' ms'}
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