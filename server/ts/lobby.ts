import { SocketCommands } from "../../shared/socket_commands";
import { Socket } from "./socket";
import { uuid } from "./util";
import { LobbySettings } from "../../shared/types";

export const lobbies: Lobby[] = [];
const lobbyListSubscribers = new Set<Socket>();

const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
	missionPath: 'beginner/movement.mis'
};

export class Lobby {
	id: string;
	name: string;
	players: Socket[] = [];
	settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS };

	constructor(name: string) {
		this.id = uuid();
		this.name = name;
	}

	join(socket: Socket) {
		this.players.push(socket);

		socket.send('joinLobbyResponse', {
			id: this.id,
			name: this.name,
			settings: this.settings
		});
		this.sendPlayerList();
	}

	leave(socket: Socket) {
		this.players = this.players.filter(x => x !== socket);

		this.sendPlayerList();
	}

	sendPlayerList() {
		let list = this.players.map(x => ({
			name: x.username
		}));

		for (let socket of this.players) {
			socket.send('lobbyPlayerList', list);
		}
	}

	setSettings(newSettings: LobbySettings, setter: Socket) {
		this.settings = newSettings;

		for (let socket of this.players) {
			if (socket === setter) continue;

			socket.send('lobbySettingsChange', this.settings);
		}
	}

	sendTextMessage(sender: Socket, messageBody: string) {
		if (messageBody.length > 250) return; // Why do you gotta be a dick

		for (let socket of this.players) {
			if (socket === sender) continue;

			socket.send('lobbyTextMessage', {
				username: sender.username,
				body: messageBody
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
			name: lobby.name
		});
	}

	return list;
};