import fs from 'fs-extra';
import path from 'path';
import NodeWebSocket, { WebSocketServer } from 'ws';
import { setDriftlessInterval } from "driftless";
import { Socket } from '../../shared/socket';
import { RTCPeerConnection as WRTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'wrtc';
import { RTCConnection } from '../../shared/rtc_connection';
import { performance} from 'perf_hooks';
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { DefaultMap } from '../../shared/default_map';
import { GameServerConnection, GameServerSocket } from '../../shared/game_server_connection';
import { CommandToData, GameObjectStateUpdate } from '../../shared/game_server_format';

const wss = new WebSocketServer({
	port: 6969
});

let localIp = '192.168.43.51' ?? '192.168.1.105'; // TEMP SHIT

const ID = 'EU-1';
const KEY = 'I love cocks';
const URL = `ws://localhost:8080/register-gameserver?id=${encodeURIComponent(ID)}&key=${encodeURIComponent(KEY)}&ws=${encodeURIComponent(`ws://${localIp}:` + wss.options.port)}`;
const TICK_FREQUENCY = 30;
const UPDATE_BUFFER_SIZE = 1; // In ticks

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

let logfileName = 'omfg.tsv';

fs.writeFileSync(path.join(__dirname, 'logs', logfileName), 'Tick\tBruh\n');

class Game {
	missionPath: string;
	connections: GameServerConnection[] = [];
	stateHistory = new DefaultMap<number, GameObjectStateUpdate[]>(() => []);
	//updateToConnection = new WeakMap<GameObjectStateUpdate, GameServerConnection>();
	//updateTimeouts = new DefaultMap<GameServerConnection, Map<number, number>>(() => new Map());
	//stateUpdateQueue = new DefaultMap<number, DefaultMap<number, GameObjectStateUpdate[]>>(() => new DefaultMap(() => [])); // Maps tick to map that maps object ID to update candidates
	tickIndex: number;
	startTime: number;
	lastAdvanceTime: number;
	lastSentTick = -1;
	pendingPings = new DefaultMap<GameServerConnection, Map<number, number>>(() => new Map());

	logRow: any[] = [0];
	objectIds: number[] = [];

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
		this.logRow = this.logRow.map(x => ('' + x).padEnd(22));

		//fs.appendFileSync(path.join(__dirname, 'logs', logfileName), this.logRow.join('\t') + '\n');

		this.tickIndex++;
		this.lastAdvanceTime += 1000 / GAME_UPDATE_RATE;

		this.logRow = ['', '', '', '', ''];

		this.logRow[0] = this.tickIndex;
	}

	onStateUpdate(update: CommandToData<'stateUpdate'>) {
		if (update.tick <= this.lastSentTick) {
			return;
		}

		//console.log(this.connections.indexOf(connection), update.gameObjectId, update.certainty);

		let history = this.stateHistory.get(update.gameObjectId);
		if (!this.objectIds.includes(update.gameObjectId)) this.objectIds.push(update.gameObjectId);



		//this.logRow[1 + playerIndex] += `${this.objectIds.indexOf(update.gameObjectId)}:${update.tick}:${update.certainty.toFixed(3)} `;

		//update.whoSent = playerIndex;

		let updateBefore = findLast(history, x => x.tick <= update.tick);
		if (!updateBefore) {
			history.push(update);
		} else {
			let tickDiff = update.tick - updateBefore.tick;
			//tickDiff = Math.max(0, tickDiff - 5);
			//tickDiff = tickDiff - 10;
			let otherCertainty = updateBefore.certainty * updateBefore.certaintyRetention**tickDiff;
			if (otherCertainty >= update.certainty) {
				//console.log("what WHY", updateBefore.certainty, update.certainty);
				return;
			}

			let index = history.indexOf(updateBefore);
			if (updateBefore.tick === update.tick) history.splice(index, 1);
			else index++;

			history.splice(index, 0, update);

			let certainty = update.certainty;
			for (let i = index+1; i < history.length; i++) {
				let otherUpdate = history[i];
				certainty *= update.certaintyRetention;

				if (otherUpdate.certainty < certainty) history.splice(i--, 1);
				else break;
			}

			/*

			let otherConnection = this.updateToConnection.get(updateBefore);
			let different = otherConnection !== connection;
			if (different) {
				console.log("hit!");
				this.updateTimeouts.get(otherConnection).set(update.gameObjectId, update.tick);
			}
			*/
		}

		//this.updateToConnection.set(update, connection);
	}

	tick() {
		this.tryAdvanceGame();

		let now = performance.now();

		//console.log(this.firstTing, this.lastSentTick, this.firstTing < this.lastSentTick);

		let thing = ['/', '/'];

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
				rewindTo: this.lastSentTick
			});

			for (let [, history] of this.stateHistory) {
				for (let i = history.length-1; i >= 0; i--) {
					let update = history[i];

					if (update.tick > this.tickIndex) continue;
					//if (update.tick <= this.lastSentTick) break;
					if (update.tick <= this.lastSentTick) break;

					//let idx = this.objectIds.indexOf(update.gameObjectId);
					//thing[idx] = update.whoSent;

					//delete update.whoSent;

					let copy = { ...update };
					//delete copy.whoSent;

					connection.queueCommand({
						command: 'stateUpdate',
						...(copy ?? update)
					});


				}
			}

			connection.tick();
		}

		this.logRow[4] = `0:${thing[0]}, 1:${thing[1]}`;

		this.lastSentTick = this.tickIndex;
	}

	addConnection(connection: GameServerConnection) {
		this.connections.push(connection);

		//connection.addedOneWayLatency = 50;

		connection.queueCommand({
			command: 'gameInfo',
			playerId: this.connections.indexOf(connection),
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

			/*
			let timeouts = this.updateTimeouts.get(connection);
			for (let [objectId, expiration] of timeouts) {
				if (data.serverTick >= expiration) timeouts.delete(objectId);
			}
			*/
		});

		connection.on('ping', ({ timestamp }) => {
			let now = performance.now();
			this.pendingPings.get(connection).set(timestamp, now);
		});
	}
}

/** Finds the last element in an array that fulfills a predicate. */
const findLast = <T>(arr: T[], predicate: (elem: T) => boolean) => {
	for (let i = arr.length-1; i >= 0; i--) {
		let item = arr[i];
		if (predicate(item)) return item;
	}
};