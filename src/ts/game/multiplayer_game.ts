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
	lastServerTickUpdate: number = null;
	lastServerStateBundle: CommandToData<"serverStateBundle"> = null;
	lastReceivedServerUpdateId = -1;

	lastUpdateRate: number;

	recentRtts: {
		value: number,
		timestamp: number
	}[] = [];

	incomingTimes: [number, number][] = [];
	outgoingTimes: [number, number][] = [];

	lastSentTick = -1;
	periods: Period[] = [];
	nextPeriodId = 0;
	lastPeriodUpdateId = 0;
	lastPeriodAffectionEdgeId = 0;

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

		this.connection.on('serverStateBundle', data => {
			this.onServerStateBundle(data);
		});

		/*
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
		});*/

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

	async onServerStateBundle(data: CommandToData<'serverStateBundle'>) {
		if (sendTimeout > 0) return;

		this.lastServerStateBundle = data;

		data.entityUpdates = data.entityUpdates.filter(x => x.updateId > this.lastReceivedServerUpdateId);

		this.lastReceivedServerUpdateId = Math.max(
			this.lastReceivedServerUpdateId,
			...data.entityUpdates.map(x => x.updateId)
		);

		// Add them to a queue
		this.simulator.reconciliationUpdates.push(...data.entityUpdates);

		// Remove arrived periods
		while (this.periods.length > 0 && this.periods[0].id <= data.lastReceivedPeriodId) {
			this.periods.shift();
		}

		// Temp stuff: create a new marble if it isn't here yet
		for (let update of data.entityUpdates) {
			let entityExists = this.entities.some(x => x.id === update.entityId);
			if (entityExists) continue;

			if (initting.has(update.entityId)) return;

			initting.add(update.entityId);
			let marble = new Marble(this);
			marble.id = update.entityId;

			await marble.init();

			this.renderer.scene.add(marble.group);
			this.simulator.world.add(marble.body);
			this.marbles.push(marble);
			this.entities.push(marble);

			marble.loadState(update.state as any); // temp
			marble.controller = new RemoteMarbleController(marble);
		}
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

		let lastPeriod = Util.last(this.periods);

		let periodStart = lastPeriod? lastPeriod.end + 1 : 0;
		let periodEnd = this.state.tick;

		let entityUpdates: EntityUpdate[] = [];
		let entityInfo: Period["entityInfo"] = [];
		let includedEntityIds = new Set<number>();
		let affectionGraph: Period["affectionGraph"] = [];

		for (let [, history] of this.state.stateHistory) {
			for (let i = history.length - 1; i >= 0; i--) {
				let update = history[i];
				if (update.updateId < this.lastPeriodUpdateId) break;

				let info = entityInfo.find(x => x.entityId === update.entityId);
				if (!info) {
					info = {
						entityId: update.entityId,
						earliestUpdateFrame: update.frame,
						ownedAtSomePoint: update.owned
					};

					entityInfo.push(info);
					entityUpdates.push(update);
					includedEntityIds.add(update.entityId);
				} else {
					info.earliestUpdateFrame = update.frame;
					info.ownedAtSomePoint ||= update.owned;
				}
			}
		}

		outer:
		for (let i = this.state.affectionGraph.length - 1; i >= 0; i--) {
			let edge = this.state.affectionGraph[i];
			if (edge.id < this.lastPeriodAffectionEdgeId) break;

			for (let includedEdge of affectionGraph) {
				if (edge.from.id === includedEdge.from && edge.to.id === includedEdge.to)
					continue outer;
			}

			affectionGraph.push({ from: edge.from.id, to: edge.to.id });
		}

		for (let period of this.periods) {
			Util.filterInPlace(period.entityUpdates, x => !includedEntityIds.has(x.entityId));
			Util.filterInPlace(period.affectionGraph, x => {
				return !affectionGraph.some(y => x.from === y.from && x.to === y.to);
			});
		}

		let newPeriod: Period = {
			id: this.nextPeriodId++,
			start: periodStart,
			end: periodEnd,
			entityUpdates,
			entityInfo,
			affectionGraph,
			size: 0
		};

		this.periods.push(newPeriod);

		// Merge old periods together into larger and larger combined periods to cause logarithmic increase of periods instead of linear with respect to time
		let count = 0;
		for (let i = this.periods.length - 1; i >= 0; i--) {
			if (this.periods[i].size !== this.periods[i+1]?.size) {
				count = 0;
			}
			count++;

			// If we encounter 4 periods in a row of same size (size = how many times this period has been merged before), we merge the last two neighboring periods.
			if (count === 4) {
				let a = this.periods[i];
				let b = this.periods[i+1];

				b.size++;
				b.start = a.start;

				// For both of these, we need not worry about duplicates (they can't happen):
				b.entityUpdates.push(...a.entityUpdates);
				b.affectionGraph.push(...a.affectionGraph);

				// Merge the entity info
				for (let info of b.entityInfo) {
					let prevInfo = a.entityInfo.find(x => x.entityId === info.entityId);
					if (!prevInfo) continue;

					info.earliestUpdateFrame = Math.min(info.earliestUpdateFrame, prevInfo.earliestUpdateFrame);
					info.ownedAtSomePoint ||= prevInfo.ownedAtSomePoint;
				}
				b.entityInfo.push(...a.entityInfo.filter(x => !b.entityInfo.some(y => x.entityId === y.entityId)));

				this.periods.splice(i++, 1);
			}
		}

		this.lastPeriodUpdateId = this.state.nextUpdateId;
		this.lastPeriodAffectionEdgeId = this.state.nextAffectionEdgeId;

		if (sendTimeout-- > 0) return;

		let bundle: CommandToData<'clientStateBundle'> = {
			command: 'clientStateBundle',
			periods: this.periods,
			lastReceivedServerUpdateId: this.lastReceivedServerUpdateId
		};
		this.connection.queueCommand(bundle, false);
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