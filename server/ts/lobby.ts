import { SocketCommands } from "../../shared/socket_commands";
import { Socket } from "./socket";
import { uuid } from "./util";
import { LobbySettings } from "../../shared/types";
import { gameServers } from "./game_server";
import { DefaultMap } from "../../shared/default_map";

export const lobbies: Lobby[] = [];
const lobbyListSubscribers = new Set<Socket>();

const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
	missionPath: 'beginner/movement.mis',
	gameServer: null
};

export class Lobby {
	id: string;
	name: string;
	sockets: Socket[] = [];
	settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS };
	gameServerConnectionInfo = new DefaultMap<Socket, {
		status: 'connecting' | 'connected',
		loadingCompletion: number
	}>(() => ({ status: null, loadingCompletion: 0 }));
	inGame = false;

	constructor(name: string) {
		this.id = uuid();
		this.name = name;
	}

	join(socket: Socket) {
		this.sockets.push(socket);

		socket.send('joinLobbyResponse', {
			id: this.id,
			name: this.name,
			settings: this.settings
		});

		this.sendSocketList();
		onLobbiesChanged();
	}

	leave(socket: Socket) {
		this.sockets = this.sockets.filter(x => x !== socket);

		this.sendSocketList();
		onLobbiesChanged();
	}

	sendSocketList() {
		let list = this.sockets.map(x => ({
			id: x.sessionId,
			name: x.username,
			connectionStatus: this.gameServerConnectionInfo.get(x).status,
			loadingCompletion: this.gameServerConnectionInfo.get(x).loadingCompletion
		}));

		for (let socket of this.sockets) {
			socket.send('lobbySocketList', list);
		}
	}

	setSettings(newSettings: LobbySettings, setter: Socket) {
		this.settings = newSettings;

		for (let socket of this.sockets) {
			if (socket === setter) continue;

			socket.send('lobbySettingsChange', this.settings);
		}

		onLobbiesChanged();
	}

	sendTextMessage(sender: Socket, messageBody: string) {
		if (messageBody.length > 250) return; // Why do you gotta be a dick

		for (let socket of this.sockets) {
			if (socket === sender) continue;

			socket.send('lobbyTextMessage', {
				username: sender.username,
				body: messageBody
			});
		}
	}

	setConnectionStatus(socket: Socket, status: 'connected' | 'connecting') {
		let info = this.gameServerConnectionInfo.get(socket);
		info.status = status;

		this.sendSocketList();
	}

	setLoadingCompletion(socket: Socket, completion: number) {
		let info = this.gameServerConnectionInfo.get(socket);
		info.loadingCompletion = completion;

		this.sendSocketList();
	}

	initializeStartGame() {
		if (this.inGame) return;
		this.inGame = true;

		let gameServer = gameServers.find(x => x.id === this.settings.gameServer);
		gameServer.socket.send('createGame', {
			lobbyId: this.id,
			lobbySettings: this.settings,
			sessions: this.sockets.map(x => x.sessionId)
		});

		onLobbiesChanged();

		// And now we wait for confirmation from the game server.
	}

	startGame(gameId: string) {
		// We got confirmation from the game server, let's start the game!
		let gameSeed = Math.floor(Math.random() * 2**32);

		for (let socket of this.sockets) {
			socket.send('startGame', {
				lobbySettings: this.settings,
				gameId: gameId,
				seed: gameSeed
			});
		}
	}
}

export const onLobbiesChanged = () => {
	let list = createLobbyList();

	for (let subscriber of lobbyListSubscribers) {
		subscriber.send('lobbyList', list);
	}
};

export const addLobbyListSubscriber = (socket: Socket) => {
	lobbyListSubscribers.add(socket);

	socket.send('lobbyList', createLobbyList());
};

export const removeLobbyListSubscriber = (socket: Socket) => {
	lobbyListSubscribers.delete(socket);
};

const createLobbyList = () => {
	let list: SocketCommands['lobbyList'] = [];

	for (let lobby of lobbies) {
		list.push({
			id: lobby.id,
			name: lobby.name,
			settings: lobby.settings,
			socketCount: lobby.sockets.length,
			status: lobby.inGame? 'playing' : 'idle'
		});
	}

	return list;
};