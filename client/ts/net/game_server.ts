import { Socket } from "../../../shared/socket";
import { RTCConnection } from "../../../shared/rtc_connection";
import { workerSetInterval } from "../worker";
import { GameServerConnection, GameServerSocket } from "../../../shared/game_server_connection";
import { G } from "../global";
import { MbpMenu } from "../ui/menu_mbp";
import { Util } from "../util";
import { MultiplayerGame } from "../game/multiplayer_game";

export let gameServers: GameServer[] = [];
const TICK_FREQUENCY = 30;

class GameServerRTCConnection extends RTCConnection {
	gameServerId: string;
	connectionId = Util.uuid();

	constructor(gameServerId: string) {
		super(RTCPeerConnection);

		this.gameServerId = gameServerId;
	}

	gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIce', {
			ice: candidate,
			gameServerId: this.gameServerId,
			connectionId: this.connectionId
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await super.createdDescription(description);

		Socket.send('rtcSdp', {
			sdp: this.rtc.localDescription,
			gameServerId: this.gameServerId,
			connectionId: this.connectionId
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

	getStatus() {
		if (this.ws.readyState === 1) return 'connected' as const;
		return 'connecting' as const;
	}

	close() {
		this.ws.close();
	}
}

export class GameServer {
	id: string;
	wsUrl: string;
	rtcSocket: GameServerRTCConnection;
	connection: GameServerConnection = null;

	static init() {
		Socket.on('updateGameServerList', list => {
			for (let gs of list) {
				let exists = gameServers.some(x => x.id === gs.id);
				if (exists) continue;

				let gameServer = new GameServer(gs.id, gs.wsUrl);
				gameServers.push(gameServer);
			}

			(G.menu as MbpMenu)?.lobbyScreen?.updateGameServerList();
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

	connect(type: 'rtc' | 'websocket') {
		if (type === 'rtc') {
			this.rtcSocket = new GameServerRTCConnection(this.id);
			this.rtcSocket.createOffer();

			this.connection = new GameServerConnection(this.rtcSocket);
		} else {
			let ws = new WebSocket(this.wsUrl);
			let socket = new WebSocketGameServerSocket(ws);

			this.connection = new GameServerConnection(socket);
		}

		this.connection.on('pong', ({ timestamp, subtract }) => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			let now = performance.now();
			let rtt = now - timestamp - subtract;

			game.recentRtts.push({
				value: rtt,
				timestamp: now
			});
		});

		this.connection.on('gameJoinInfo', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			game.onGameJoinInfo(data);
		});

		this.connection.on('serverStateBundle', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			game.onServerStateBundle(data);
		});

		this.connection.on('timeState', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			game.state.supplyServerTimeState(data.serverFrame, data.targetFrame);
		});

		this.connection.on('playerJoin', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			game.addPlayer(data);
		});

		this.connection.on('scheduleRestart', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			Util.insertSorted(game.state.restartFrames, data.frame, (a, b) => a - b);
		});

		this.connection.on('playerRestartIntentState', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			game.players.find(x => x.id === data.playerId).hasRestartIntent = data.state;
		});

		this.connection.on('textMessage', data => {
			let game = G.game as MultiplayerGame;
			if (!game) return;

			let sessionId = game.players.find(x => x.id === data.playerId)?.sessionId;
			let username = G.lobby.sockets.find(x => x.id === sessionId)?.name;
			G.menu.hud.displayChatMessage(username ?? '???', data.body);
		});
	}

	disconnect() {
		if (!this.connection) return;

		this.connection.disconnect();
		this.connection = null;

		console.log("Guubai 🚪");
	}
}