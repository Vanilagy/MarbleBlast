import express from 'express';
import { gameServers, sendGameServerList } from "./game_server";
import { addLobbyListSubscriber, lobbies, Lobby, onLobbiesChanged, removeLobbyListSubscriber } from './lobby';
import { Socket, WebSocketType } from "./socket";
import { removeFromArray } from './util';

export const sockets: Socket[] = [];

export const handleNewWebSocketConnection = (ws: WebSocketType, req: express.Request) => {
	let sessionId = req.query['session-id'] as string;
	if (!sessionId) return;

	let socket = new Socket(ws);
	socket.sessionId = sessionId;

	initUserSocket(socket);
};

const initUserSocket = (socket: Socket) => {
	sockets.push(socket);
	socket.onClose = () => {
		removeFromArray(sockets, socket);
	};

	sendGameServerList(socket);

	socket.on('rtcIce', data => {
		let gameServer = gameServers.find(x => x.id === data.gameServerId);
		if (!gameServer) return; // todo probably do something more elaborate here? like send an error

		gameServer.socket.send('rtcIceGameServer', {
			ice: data.ice,
			sessionId: socket.sessionId
		});
	});

	socket.on('rtcSdp', data => {
		let gameServer = gameServers.find(x => x.id === data.gameServerId);
		if (!gameServer) return; // todo probably do something more elaborate here? like send an error

		gameServer.socket.send('rtcSdpGameServer', {
			sdp: data.sdp,
			sessionId: socket.sessionId
		});
	});

	socket.on('setUsername', username => {
		socket.username = username;
	});

	socket.on('subscribeToLobbyList', () => {
		addLobbyListSubscriber(socket);
	});

	socket.on('unsubscribeFromLobbyList', () => {
		removeLobbyListSubscriber(socket);
	});

	socket.on('createLobbyRequest', data => {
		let lobby = new Lobby('Wow nice name 🍇 ' + lobbies.length);
		lobbies.push(lobby);
		lobby.join(socket);

		onLobbiesChanged();
	});

	socket.on('joinLobbyRequest', id => {
		let lobby = lobbies.find(x => x.id === id);
		if (!lobby) return;

		lobby.join(socket);
	});

	socket.on('leaveLobby', () => {
		let lobby = lobbies.find(x => x.players.includes(socket));
		if (!lobby) return;

		lobby.leave(socket);
	});

	socket.on('setLobbySettings', newSettings => {
		let lobby = lobbies.find(x => x.players.includes(socket));
		if (!lobby) return;

		lobby.setSettings(newSettings, socket);
	});

	socket.on('sendLobbyTextMessage', body => {
		let lobby = lobbies.find(x => x.players.includes(socket));
		if (!lobby) return;

		lobby.sendTextMessage(socket, body);
	});
};