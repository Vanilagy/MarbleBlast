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
		}, true);

		let response = await new Promise<CommandToData<'gameJoinInfo'>>(resolve => {
			const callback = (data: CommandToData<'gameJoinInfo'>) => {
				this.connection.off('gameJoinInfo', callback);
				resolve(data);
			};
			this.connection.on('gameJoinInfo', callback);
		});

		this.state.supplyServerTimeState(response.serverFrame, response.clientFrame);

		for (let playerData of response.players) {
			await this.addPlayer(playerData.id, playerData.marbleId);
		}

		this.localPlayer = this.players.find(x => x.id === response.localPlayerId);
		this.localPlayer.controlledMarble.addToGame();

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

		/*
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
		*/
	}

	tickConnection() {
		if (!this.started) return;

		let timestamp = performance.now();
		this.connection.queueCommand({ command: 'ping', timestamp }, false);

		let periodStart = this.lastPeriodEnd + 1;
		let periodEnd = this.state.frame;

		let entityUpdates: EntityUpdate[] = [];
		let entityInfo: Period["entityInfo"] = [];
		let includedEntityIds = new Set<number>();
		let affectionGraph: Period["affectionGraph"] = [];

		for (let [, history] of this.state.stateHistory) {
			for (let i = history.length - 1; i >= 0; i--) {
				let update = history[i];
				if (update.originator !== this.localPlayer.id) continue;
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
		this.lastPeriodEnd = newPeriod.end;

		if (sendTimeout-- > 0) return;

		let bundle: CommandToData<'clientStateBundle'> = {
			command: 'clientStateBundle',
			serverFrame: this.state.serverFrame,
			clientFrame: this.state.targetClientFrame,
			periods: this.periods,
			lastReceivedServerUpdateId: this.lastReceivedServerUpdateId
		};
		this.connection.queueCommand(bundle, false);
	}

	applyRemoteEntityUpdate(update: EntityUpdate) {
		let entity = this.getEntityById(update.entityId);
		if (!entity) return;

		let us = this.localPlayer.id;
		let shouldApplyUpdate = (update.originator !== us && !update.owned) || update.version > entity.version;
		if (shouldApplyUpdate && entity === this.localPlayer.controlledMarble) console.log("hi my name is ARH");
		if (!shouldApplyUpdate) return;

		let history = this.state.stateHistory.get(entity.id);
		while (history.length > 0 && Util.last(history).frame >= update.frame) {
			history.pop();
		}

		entity.loadState(update.state, { frame: update.frame, remote: true });
		entity.version = update.version;

		update.updateId = -1; // We set the update ID to something negative so that the update NEVER gets sent back to the server
		history.push(update);
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
			Server frame: ${this.state.serverFrame}
			Client frame: ${this.state.frame}
			Target frame: ${this.state.targetClientFrame}
			Frames ahead server: ${this.state.frame - this.state.serverFrame}
			Frames ahead target: ${this.state.frame - this.state.targetClientFrame}
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