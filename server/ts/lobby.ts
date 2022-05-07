import { SocketCommands } from "../../shared/socket_commands";
import { Socket } from "./socket";
import { uuid } from "./util";
import { LobbySettings } from "../../shared/types";

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
	gameServerConnectionInfo = new WeakMap<Socket, {
		status: 'connecting' | 'connected'
	}>();

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
	}

	leave(socket: Socket) {
		this.sockets = this.sockets.filter(x => x !== socket);

		this.sendSocketList();
	}

	sendSocketList() {
		let list = this.sockets.map(x => ({
			id: x.sessionId,
			name: x.username,
			connectionStatus: this.gameServerConnectionInfo.get(x)?.status ?? null
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
		if (!info) {
			info = { status: null };
			this.gameServerConnectionInfo.set(socket, info);
		}

		info.status = status;

		this.sendSocketList();
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
			name: lobby.name
		});
	}

	return list;
};