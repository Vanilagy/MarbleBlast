import NodeWebSocket from 'ws';
import { Socket } from '../../shared/socket';
import { RTCPeerConnection as WRTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'wrtc';
import { RTCCommands } from '../../shared/rtc';
import { RTCConnection } from '../../shared/rtc_connection';
import { GameObjectState } from '../../shared/game_object_state';
import { performance} from 'perf_hooks';

const ID = 'EU-1';
const KEY = 'I love cocks';
const URL = `ws://localhost:8080/register-gameserver?id=${encodeURIComponent(ID)}&key=${encodeURIComponent(KEY)}`;
const TICK_FREQUENCY = 60;
const PHYSICS_TICK_RATE = 120; // fixme probably rename this to game tick rate or something like this? game **update** rate!
const UPDATE_BUFFER_SIZE = 3; // In ticks

console.log("Game server started with id: " + ID);

Socket.init(URL, NodeWebSocket as any);

Socket.on('rtcIceGameServer', data => {
	let connection = connections.find(x => x.sessionId === data.sessionId);
	if (!connection) {
		connection = new GameClientRTCConnection(data.sessionId);
		connections.push(connection);
	}

	connection.gotIceFromServer(new RTCIceCandidate(data.ice));
});

Socket.on('rtcSdpGameServer', data => {
	let connection = connections.find(x => x.sessionId === data.sessionId);
	if (!connection) {
		connection = new GameClientRTCConnection(data.sessionId);
		connections.push(connection);
	}

	connection.gotSdpFromServer(new RTCSessionDescription(data.sdp));
});

let connections: GameClientRTCConnection[] = [];

class GameClientRTCConnection extends RTCConnection {
	sessionId: string;

	constructor(sessionId: string) {
		super(WRTCPeerConnection);

		this.sessionId = sessionId;

		this.on('playMission', data => {
			let game = games.find(x => x.missionPath === data.missionPath);

			if (!game) {
				game = new Game(data.missionPath);
				games.push(game);
			}

			game.addConnection(this);
		});
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

setInterval(() => {
	for (let game of games) game.tick();
}, 1000 / TICK_FREQUENCY);

class Game {
	missionPath: string;
	connections: GameClientRTCConnection[] = [];
	gameObjectStates = new Map<number, GameObjectState>();
	tickIndex: number;
	startTime: number;
	lastTickTime: number;

	constructor(missionPath: string) {
		this.missionPath = missionPath;

		this.start();
	}

	start() {
		this.tickIndex = 0;
		this.startTime = performance.now();
	}

	advanceTimeIfNecessary() {
		let now = performance.now();

		while (now - this.lastTickTime >= 1000 / PHYSICS_TICK_RATE) {
			this.tickIndex++;
			this.lastTickTime += 1000 / PHYSICS_TICK_RATE;
		}
	}

	onStateUpdate(update: RTCCommands['stateUpdate']) {
		if (this.gameObjectStates.has(update.gameObjectId)) {
			if (this.gameObjectStates.get(update.gameObjectId).tick > update.state.tick) {
				console.log("yooo");
				return;
			}
		}
		this.gameObjectStates.set(update.gameObjectId, update.state);
	}

	tick() {
		this.advanceTimeIfNecessary();

		for (let connection of this.connections) {
			for (let [objectId, state] of this.gameObjectStates) {
				connection.queueCommand('stateUpdate', {
					gameObjectId: objectId,
					state: state
				}, true, 'stateUpdate@' + objectId);
			}

			connection.tick();
		}
	}

	addConnection(connection: GameClientRTCConnection) {
		this.connections.push(connection);

		connection.queueCommand('timeState', {
			serverTick: this.tickIndex,
			clientTick: this.tickIndex + UPDATE_BUFFER_SIZE // No better guess yet
		});

		connection.on('stateUpdate', data => {
			this.onStateUpdate(data);
		});

		connection.on('timeState', data => {
			let rtt = data.serverTick - this.tickIndex;

			connection.queueCommand('timeState', {
				serverTick: this.tickIndex,
				clientTick: this.tickIndex + rtt + UPDATE_BUFFER_SIZE
			});
		});
	}
}