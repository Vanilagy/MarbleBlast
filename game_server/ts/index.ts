import NodeWebSocket, { WebSocketServer } from 'ws';
import { setDriftlessInterval } from "driftless";
import { Socket } from '../../shared/socket';
import { RTCPeerConnection as WRTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'wrtc';
import { RTCConnection } from '../../shared/rtc_connection';
import { performance} from 'perf_hooks';
import { GameObjectStateUpdate } from '../../shared/game_object_state_update';
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { DefaultMap } from '../../shared/default_map';
import { CommandToData, GameServerConnection, GameServerSocket } from '../../shared/game_server_connection';

const wss = new WebSocketServer({
	port: 6969
});

const ID = 'EU-1';
const KEY = 'I love cocks';
const URL = `ws://localhost:8080/register-gameserver?id=${encodeURIComponent(ID)}&key=${encodeURIComponent(KEY)}&ws=${encodeURIComponent('ws://192.168.1.105:' + wss.options.port)}`;
const TICK_FREQUENCY = 30;
const UPDATE_BUFFER_SIZE = 3; // In ticks

console.log("Game server started with id: " + ID);

class WebSocketGameServerSocket implements GameServerSocket {
	ws: NodeWebSocket;
	receive: (data: ArrayBuffer) => void = null;

	constructor(ws: NodeWebSocket) {
		this.ws = ws;
		ws.on('message', data => this.receive(data as ArrayBuffer));
	}

	send(data: ArrayBuffer) {
		this.ws.send(data);
	}

	canSend() {
		return this.ws.readyState === this.ws.OPEN;
	}
}

wss.on('connection', ws => {
	ws.binaryType = 'arraybuffer';

	let socket = new WebSocketGameServerSocket(ws);
	let connection = new GameServerConnection(socket);

	connection.on('joinMission', data => {
		let game = games.find(x => x.missionPath === data.missionPath);

		if (!game) {
			game = new Game(data.missionPath);
			games.push(game);
		}

		game.addConnection(connection);
	});

	console.log("New WS connection!");
});

let rtcSockets: GameClientRTCConnection[] = [];

const createRTCSocket = (sessionId: string) => {
	let rtcSocket = new GameClientRTCConnection(sessionId);
	let connection = new GameServerConnection(rtcSocket);

	connection.on('joinMission', data => {
		let game = games.find(x => x.missionPath === data.missionPath);

		if (!game) {
			game = new Game(data.missionPath);
			games.push(game);
		}

		game.addConnection(connection);
	});

	rtcSockets.push(rtcSocket);

	console.log("New RTC connection!");

	return rtcSocket;
};

Socket.init(URL, NodeWebSocket as any);

Socket.on('rtcIceGameServer', data => {
	let rtcSocket = rtcSockets.find(x => x.sessionId === data.sessionId);
	if (!rtcSocket) rtcSocket = createRTCSocket(data.sessionId);

	rtcSocket.gotIceFromServer(new RTCIceCandidate(data.ice));
});

Socket.on('rtcSdpGameServer', data => {
	let rtcSocket = rtcSockets.find(x => x.sessionId === data.sessionId);
	if (!rtcSocket) rtcSocket = createRTCSocket(data.sessionId);

	rtcSocket.gotSdpFromServer(new RTCSessionDescription(data.sdp));
});

class GameClientRTCConnection extends RTCConnection {
	sessionId: string;

	constructor(sessionId: string) {
		super(WRTCPeerConnection);

		this.sessionId = sessionId;
	}

	gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIceGameServer', {
			ice: candidate,
			sessionId: this.sessionId
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await super.createdDescription(description);

		Socket.send('rtcSdpGameServer', {
			sdp: this.rtc.localDescription,
			sessionId: this.sessionId
		});
	}
}

let games: Game[] = [];

setDriftlessInterval(() => {
	for (let game of games) game.tick();
}, 1000 / TICK_FREQUENCY);

class Game {
	missionPath: string;
	connections: GameServerConnection[] = [];
	stateHistory = new DefaultMap<number, GameObjectStateUpdate[]>(() => []);
	stateUpdateQueue = new DefaultMap<number, DefaultMap<number, GameObjectStateUpdate[]>>(() => new DefaultMap(() => [])); // Maps tick to map that maps object ID to update candidates
	tickIndex: number;
	startTime: number;
	lastAdvanceTime: number;
	lastSentTick = -1;
	pendingPings = new DefaultMap<GameServerConnection, Map<number, number>>(() => new Map());

	constructor(missionPath: string) {
		this.missionPath = missionPath;

		console.log(`GAME CREATED! ${missionPath}`);

		this.start();
	}

	start() {
		this.tickIndex = 0;
		this.startTime = performance.now();
		this.lastAdvanceTime = this.startTime;
	}

	tryAdvanceGame() {
		let now = performance.now();

		while (now - this.lastAdvanceTime >= 1000 / GAME_UPDATE_RATE) {
			this.advanceGame();
		}
	}

	advanceGame() {
		this.tickIndex++;
		this.lastAdvanceTime += 1000 / GAME_UPDATE_RATE;

		let updateCandidates = this.stateUpdateQueue.get(this.tickIndex);
		if (!updateCandidates) return;

		for (let [objectId, updates] of updateCandidates) {
			let arr = this.stateHistory.get(objectId);

			let bestUpdate = updates.slice().sort((a, b) => b.precedence - a.precedence)[0];
			if (bestUpdate.precedence === 1) arr.push(bestUpdate);
		}

		this.stateUpdateQueue.delete(this.tickIndex);
	}

	onStateUpdate(update: CommandToData<'stateUpdate'>) {
		let updatesForTick = this.stateUpdateQueue.get(update.tick);
		let updatesForObject = updatesForTick.get(update.gameObjectId);

		updatesForObject.push(update);
	}

	tick() {
		this.tryAdvanceGame();

		let now = performance.now();

		for (let connection of this.connections) {
			for (let [timestamp, receiveTime] of this.pendingPings.get(connection)) {
				let elapsed = now - receiveTime;
				connection.queueCommand({
					command: 'pong',
					timestamp,
					subtract: elapsed
				}, false);
			}
			this.pendingPings.get(connection).clear();

			connection.queueCommand({
				command: 'reconciliationInfo',
				rewindTo: this.lastSentTick + 1
			}, false);

			for (let [objectId, stateUpdates] of this.stateHistory) {
				for (let i = stateUpdates.length-1; i >= 0; i--) {
					let update = stateUpdates[i];
					if (update.tick <= this.lastSentTick) break;

					connection.queueCommand({
						command: 'stateUpdate',
						...update as any
					});

					break;
				}
			}

			connection.tick();
		}

		this.lastSentTick = this.tickIndex;
	}

	addConnection(connection: GameServerConnection) {
		this.connections.push(connection);

		//connection.addedOneWayLatency = 50;

		connection.queueCommand({
			command: 'timeState',
			serverTick: this.tickIndex,
			clientTick: this.tickIndex + UPDATE_BUFFER_SIZE // No better guess yet
		});

		connection.on('stateUpdate', data => {
			this.onStateUpdate(data);
		});

		connection.on('timeState', data => {
			this.tryAdvanceGame();

			let rtt = Math.max(this.tickIndex - data.serverTick, 0);
			//let oneWayThing = Math.max(this.tickIndex - data.serverTick, 0);

			//console.log(data, rtt);
			//console.log(connection.sessionId, data.actualThing - this.tickIndex);

			connection.queueCommand({
				command: 'timeState',
				serverTick: this.tickIndex,
				clientTick: this.tickIndex + rtt + UPDATE_BUFFER_SIZE
			});
		});

		connection.on('ping', ({ timestamp }) => {
			let now = performance.now();
			this.pendingPings.get(connection).set(timestamp, now);
		});
	}
}