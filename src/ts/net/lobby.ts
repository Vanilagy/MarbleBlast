import { Socket } from "../../../shared/socket";
import { LobbySettings } from "../../../shared/types";
import { G } from "../global";
import { MbpMenu } from "../ui/menu_mbp";
import { gameServers } from "./game_server";

export class Lobby {
	id: string;
	name: string;
	settings: LobbySettings;
	sockets: {
		id: string,
		name: string,
		connectionStatus: 'connecting' | 'connected'
	}[] = [];
	pollerInterval: number;
	lastConnectionStatus: string = null;

	constructor(id: string, name: string, settings: LobbySettings) {
		this.id = id;
		this.name = name;
		this.settings = settings;
	}

	join() {
		this.applySettings();

		(G.menu as MbpMenu).lobbyScreen.onJoin();

		Socket.on('lobbySettingsChange', settings => {
			this.settings = settings;
			this.applySettings();
		});

		Socket.on('lobbySocketList', list => {
			this.sockets = list;
			(G.menu as MbpMenu).lobbyScreen.updatePlayerList(list);
			(G.menu as MbpMenu).lobbyScreen.updatePlayButton();
		});

		Socket.on('lobbyTextMessage', data => {
			(G.menu as MbpMenu).lobbyScreen.addChatMessage(data.username, data.body);
		});

		this.pollerInterval = setInterval(() => {
			let gameServer = gameServers.find(x => x.id === this.settings.gameServer);
			if (!gameServer) return;
			if (!gameServer.connection) return;

			let status = gameServer.connection.socket.getStatus();
			if (status !== this.lastConnectionStatus) {
				this.lastConnectionStatus = status;
				Socket.send('connectionStatus', status);
			}
		}, 1000 / 30) as unknown as number;
	}

	leave() {
		clearInterval(this.pollerInterval);

		Socket.send('leaveLobby', null);
		Socket.off('lobbySettingsChange');

		let connectedGameServer = gameServers.find(x => x.connection);
		connectedGameServer?.disconnect();
	}

	onSettingsChanged() {
		Socket.send('setLobbySettings', this.settings);
		this.applySettings();
	}

	applySettings() {
		if (this.settings.gameServer) {
			let gameServer = gameServers.find(x => x.id === this.settings.gameServer);
			if (!gameServer) return;

			if (!gameServer.connection) {
				let connectedGameServer = gameServers.find(x => x.connection);
				connectedGameServer?.disconnect();

				gameServer.connect('rtc');
			}
		}

		(G.menu as MbpMenu).lobbyScreen.updateUi();
	}
}