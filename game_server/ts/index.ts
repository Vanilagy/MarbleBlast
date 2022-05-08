import NodeWebSocket, { WebSocketServer } from 'ws';
import { setDriftlessInterval } from "driftless";
import { Socket } from '../../shared/socket';
import { RTCPeerConnection as WRTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'wrtc';
import { RTCConnection } from '../../shared/rtc_connection';
import { GameServerConnection, GameServerSocket } from '../../shared/game_server_connection';
import { Game, games } from './game';
import { Session, sessions } from './session';

const wss = new WebSocketServer({
	port: 6969
});

let localIp = '192.168.43.51' ?? '192.168.1.105'; // TEMP SHIT

const ID = 'EU-1';
const KEY = 'I love cocks';
const URL = `ws://localhost:8080/register-gameserver?id=${encodeURIComponent(ID)}&key=${encodeURIComponent(KEY)}&ws=${encodeURIComponent(`ws://${localIp}:` + wss.options.port)}`;
const TICK_FREQUENCY = 30;

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

	getStatus() {
		if (this.ws.readyState === 1) return 'connected' as const;
		return 'connecting' as const;
	}

	close() {
		this.ws.close();
	}
}

wss.on('connection', ws => {
	ws.binaryType = 'arraybuffer';

	let socket = new WebSocketGameServerSocket(ws);
	let connection = new GameServerConnection(socket);
	//addJoinGameHandlerToConnection(connection);

	console.log("New WS connection!");
});

let rtcSockets: GameClientRTCConnection[] = [];

const createRTCSocket = (connectionId: string, sessionId: string) => {
	let rtcSocket = new GameClientRTCConnection(connectionId, sessionId);
	rtcSockets.push(rtcSocket);

	console.log("New RTC connection!");

	let session = new Session(sessionId, rtcSocket);
	sessions.push(session);

	return rtcSocket;
};

Socket.init(URL, NodeWebSocket as any);

Socket.on('rtcIceGameServer', data => {
	let rtcSocket = rtcSockets.find(x => x.connectionId === data.connectionId);
	if (!rtcSocket) rtcSocket = createRTCSocket(data.connectionId, data.sessionId);

	rtcSocket.gotIceFromServer(new RTCIceCandidate(data.ice));
});

Socket.on('rtcSdpGameServer', data => {
	let rtcSocket = rtcSockets.find(x => x.connectionId === data.connectionId);
	if (!rtcSocket) rtcSocket = createRTCSocket(data.connectionId, data.sessionId);

	rtcSocket.gotSdpFromServer(new RTCSessionDescription(data.sdp));
});

class GameClientRTCConnection extends RTCConnection {
	connectionId: string;
	sessionId: string;

	constructor(connectionId: string, sessionId: string) {
		super(WRTCPeerConnection);

		this.connectionId = connectionId;
		this.sessionId = sessionId;
	}

	gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIceGameServer', {
			ice: candidate,
			connectionId: this.connectionId,
			sessionId: this.sessionId
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await super.createdDescription(description);

		Socket.send('rtcSdpGameServer', {
			sdp: this.rtc.localDescription,
			connectionId: this.connectionId,
			sessionId: this.sessionId
		});
	}
}

setDriftlessInterval(() => {
	for (let game of games) game.tick();
}, 1000 / TICK_FREQUENCY);

Socket.on('createGame', data => {
	let game = new Game(data.lobbySettings, data.sessions);
	games.push(game);

	Socket.send('createGameConfirm', {
		lobbyId: data.lobbyId,
		gameId: game.id
	});
});