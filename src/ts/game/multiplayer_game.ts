import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { GameServerConnection } from "../../../shared/game_server_connection";
import { Marble } from "../marble";
import { Mission } from "../mission";
import { GameServer } from "../net/game_server";
import { Util } from "../util";
import { Game } from "./game";
import { MultiplayerGameSimulator } from "./multiplayer_game_simulator";
import { MultiplayerGameState } from "./multiplayer_game_state";
import { RemoteMarbleController } from "./remote_marble_controller";

const networkStatsElement = document.querySelector('#network-stats') as HTMLDivElement;

const RTT_WINDOW = 2000;

let initting = new Set<number>(); // fixme remove it

let sendTimeout = 0;

// todo make sure to remove this eventually
window.addEventListener('keydown', e => {
	if (e.code === 'KeyG') {
		sendTimeout = 300;
		console.log("activated timeout");
	}
});

export class MultiplayerGame extends Game {
	state: MultiplayerGameState;
	simulator: MultiplayerGameSimulator;

	gameServer: GameServer;
	connection: GameServerConnection;
	lastServerTickUpdate: number = null;

	lastUpdateRate: number;

	recentRtts: {
		value: number,
		timestamp: number
	}[] = [];

	incomingTimes: [number, number][] = [];
	outgoingTimes: [number, number][] = [];

	lastSentTick = -1;

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

		this.connection.on('gameInfo', data => {
			this.playerId = data.playerId;
			this.state.supplyServerTimeState(data);

			super.start();
		});

		this.connection.on('timeState', data => {
			this.state.supplyServerTimeState(data);
		});

		this.connection.on('reconciliationInfo', data => {
			this.simulator.reconciliationInfo = data;
		});

		this.connection.on('gameObjectUpdate', async data => {
			if (sendTimeout > 0) return;

			this.simulator.reconciliationUpdates.get(data.gameObjectId).push(data);

			let marble = this.marbles.find(x => x.id === data.gameObjectId);
			if (!marble) {
				if (initting.has(data.gameObjectId)) return;

				initting.add(data.gameObjectId);
				marble = new Marble(this);
				marble.id = data.gameObjectId;

				await marble.init();

				this.renderer.scene.add(marble.group);
				this.simulator.world.add(marble.body);
				this.marbles.push(marble);
				this.objects.push(marble);

				marble.loadState(data.state as any); // temp
				marble.controller = new RemoteMarbleController(marble);
			}
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
		});
	}

	tick() {
		if (this.stopped) return;

		//console.log(this.state.serverTick, this.state.targetClientTick);

		let time = performance.now();

		if (this.lastServerTickUpdate === null) {
			this.lastServerTickUpdate = time;
		}

		let serverElapsed = time - this.lastServerTickUpdate;
		while (serverElapsed >= 1000 / GAME_UPDATE_RATE) {
			serverElapsed -= 1000 / GAME_UPDATE_RATE;
			this.lastServerTickUpdate += 1000 / GAME_UPDATE_RATE;

			this.state.serverTick++;
			this.state.targetClientTick++;
		}

		let updateRateDelta = Util.signedSquare((this.state.targetClientTick - this.state.tick) / 2) * 2;
		updateRateDelta = Util.clamp(updateRateDelta, -60, 60);
		let gameUpdateRate = GAME_UPDATE_RATE + updateRateDelta;
		this.lastUpdateRate = gameUpdateRate;

		super.tick(time, gameUpdateRate);
	}

	tickConnection() {
		if (!this.started) return;

		let timestamp = performance.now();
		this.connection.queueCommand({ command: 'ping', timestamp }, false);

		this.connection.queueCommand({
			command: 'timeState',
			serverTick: this.state.serverTick,
			clientTick: this.state.targetClientTick,
			//actualThing: this.state.tick
		});

		for (let [, history] of this.state.stateHistory) {
			let update = Util.last(history);
			if (!update) continue;
			if (update.tick <= this.lastSentTick) continue;

			//console.log(update.owner, update.version);

			if (sendTimeout-- <= 0) this.connection.queueCommand({
				command: 'gameObjectUpdate',
				...update
			});

			if (sendTimeout === 0) console.log("timeout over");
		}

		this.lastSentTick = this.state.tick;
	}

	displayNetworkStats() {
		if (!this.started) return;

		let now = performance.now();
		while (this.recentRtts.length > 1 && now - this.recentRtts[0].timestamp > RTT_WINDOW) this.recentRtts.shift();
		while (this.incomingTimes.length > 0 && now - this.incomingTimes[0][0] > 1000) this.incomingTimes.shift();
		while (this.outgoingTimes.length > 0 && now - this.outgoingTimes[0][0] > 1000) this.outgoingTimes.shift();

		//let medianRtt = Util.computeMedian(this.recentRtts.map(x => x.value));
		let averageRtt = this.recentRtts.map(x => x.value).reduce((a, b) => a + b, 0) / this.recentRtts.length;
		let jitter = this.recentRtts.map(x => Math.abs(x.value - averageRtt)).reduce((a, b) => a + b, 0) / this.recentRtts.length;

		networkStatsElement.textContent = `
			Ping: ${isNaN(averageRtt)? 'N/A' : averageRtt.toFixed(1) + ' ms'}
			Jitter: ${isNaN(jitter)? 'N/A' : jitter.toFixed(1) + ' ms'}
			Incoming pps: ${this.incomingTimes.length}
			Outgoing pps: ${this.outgoingTimes.length}
			Downstream: ${(this.incomingTimes.map(x => x[1]).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} kB/s
			Upstream: ${(this.outgoingTimes.map(x => x[1]).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} kB/s
			Server tick: ${this.state.serverTick}
			Client tick: ${this.state.tick}
			Target tick: ${this.state.targetClientTick}
			Ticks ahead server: ${this.state.tick - this.state.serverTick}
			Ticks ahead target: ${this.state.tick - this.state.targetClientTick}
			Server update rate: ${GAME_UPDATE_RATE} Hz
			Client update rate: ${this.lastUpdateRate | 0} Hz
		`;
	}

	stop() {
		super.stop();

		this.connection.beforeTick = null;
		this.connection.onIncomingPacket = null;
		this.connection.onOutgoingPacket = null;
		this.connection.clearAllHandlers();
	}
}