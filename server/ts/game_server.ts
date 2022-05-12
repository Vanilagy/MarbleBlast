import { Socket, WebSocketType } from "./socket";
import express from 'express';
import { removeFromArray } from "./util";
import { sockets } from "./sockets";
import { lobbies } from "./lobby";

const KEY = 'I love cocks';
const nig = ['g','e','r'];

export const gameServers: GameServer[] = [];

export const registerGameServer = (ws: WebSocketType, req: express.Request) => {
	let authenticated = req.query.key === KEY;
	if (!authenticated) return;

	let alreadyRegistered = gameServers.some(x => x.id === req.query.id);
	if (alreadyRegistered) {
		console.warn("Game server already registered!");
		return;
	}

	console.log("Registered game server: " + req.query.id);

	let socket = new Socket(ws);
	let gameServer = new GameServer(req.query.id as string, socket, req.query.ws as string);
	gameServers.push(gameServer);

	for (let socket of sockets) sendGameServerList(socket);
};

export const sendGameServerList = (socket: Socket) => {
	socket.send('updateGameServerList', gameServers.map(x => {
		return {
			id: x.id,
			wsUrl: x.wsUrl ?? null
		};
	}));
};

class GameServer {
	id: string;
	socket: Socket;
	wsUrl?: string;

	constructor(id: string, socket: Socket, wsUrl?: string) {
		this.id = id;
		this.socket = socket;
		this.wsUrl = wsUrl;

		this.socket.onClose = () => {
			console.log("Unregistered game server: " + this.id);
			removeFromArray(gameServers, this);
		};

		this.socket.on('rtcIceGameServer', data => {
			let socket = sockets.find(x => x.sessionId === data.sessionId);
			if (!socket) return;

			socket.send('rtcIce', {
				ice: data.ice,
				gameServerId: this.id,
				connectionId: data.connectionId
			});
		});

		this.socket.on('rtcSdpGameServer', data => {
			let socket = sockets.find(x => x.sessionId === data.sessionId);
			if (!socket) return;

			socket.send('rtcSdp', {
				sdp: data.sdp,
				gameServerId: this.id,
				connectionId: data.connectionId
			});
		});

		this.socket.on('createGameConfirm', ({ lobbyId, gameId }) => {
			let lobby = lobbies.find(x => x.id === lobbyId);
			if (!lobby) return;

			lobby.startGame(gameId);
		});
	}
}
