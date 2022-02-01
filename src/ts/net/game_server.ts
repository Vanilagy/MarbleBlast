import { Socket } from "../../../shared/socket";
import { RTCConnection } from "../../../shared/rtc_connection";
import { workerSetInterval } from "../worker";
import { GameServerConnection, GameServerSocket } from "../../../shared/game_server_connection";

export let gameServers: GameServer[] = [];
const TICK_FREQUENCY = 30;

class GameServerRTCConnection extends RTCConnection {
	gameServerId: string;

	constructor(gameServerId: string) {
		super(RTCPeerConnection);

		this.gameServerId = gameServerId;
	}

	gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIce', {
			ice: candidate,
			gameServerId: this.gameServerId
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await super.createdDescription(description);

		Socket.send('rtcSdp', {
			sdp: this.rtc.localDescription,
			gameServerId: this.gameServerId
		});
	}
}

class WebSocketGameServerSocket implements GameServerSocket {
	ws: WebSocket;
	receive: (data: ArrayBuffer) => void;

	constructor(ws: WebSocket) {
		this.ws = ws;
		ws.binaryType = 'arraybuffer';

		ws.onmessage = (ev) => {
			this.receive(ev.data);
		};

		ws.onopen = () => {
			console.log("opened");
		};
	}

	send(data: ArrayBuffer) {
		if (this.canSend()) this.ws.send(data);
	}

	canSend() {
		return this.ws.readyState === this.ws.OPEN;
	}
}

export class GameServer {
	id: string;
	wsUrl: string;
	rtcSocket: GameServerRTCConnection;
	connection: GameServerConnection;

	static init() {
		Socket.on('updateGameServerList', list => {
			for (let gs of list) {
				let exists = gameServers.some(x => x.id === gs.id);
				if (exists) continue;

				let gameServer = new GameServer(gs.id, gs.wsUrl);
				gameServers.push(gameServer);
			}

			console.log(gameServers);

			gameServers[0]?.connect('rtc' ?? 'websocket');
		});

		Socket.on('rtcIce', data => {
			gameServers.find(x => x.id === data.gameServerId)?.rtcSocket.gotIceFromServer(new RTCIceCandidate(data.ice));
		});

		Socket.on('rtcSdp', data => {
			gameServers.find(x => x.id === data.gameServerId)?.rtcSocket.gotSdpFromServer(new RTCSessionDescription(data.sdp));
		});

		workerSetInterval(() => {
			for (let gs of gameServers) gs.connection?.tick();
		}, 1000 / TICK_FREQUENCY);
	}

	constructor(id: string, wsUrl?: string) {
		this.id = id;
		this.wsUrl = wsUrl;
	}

	async connect(type: 'rtc' | 'websocket') {
		if (type === 'rtc') {
			this.rtcSocket = new GameServerRTCConnection(this.id);
			this.rtcSocket.createOffer();

			this.connection = new GameServerConnection(this.rtcSocket);
		} else {
			let ws = new WebSocket(this.wsUrl);
			let socket = new WebSocketGameServerSocket(ws);

			this.connection = new GameServerConnection(socket);
		}
	}
}