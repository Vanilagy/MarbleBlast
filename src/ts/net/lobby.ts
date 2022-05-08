import { Socket } from "../../../shared/socket";
import { LobbySettings } from "../../../shared/types";
import { G } from "../global";
import { MissionLibrary } from "../mission_library";
import { MbpMenu } from "../ui/menu_mbp";
import { gameServers } from "./game_server";

export class Lobby {
	id: string;
	name: string;
	settings: LobbySettings;
	sockets: {
		id: string,
		name: string,
		connectionStatus: 'connecting' | 'connected',
		loadingCompletion: number
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

		let connectedGameServer = gameServers.find(x => x.connection);
		connectedGameServer?.disconnect();

		G.lobby = null;
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

Socket.on('lobbySettingsChange', settings => {
	let lobby = G.lobby;
	if (!lobby) return;

	lobby.settings = settings;
	lobby.applySettings();
});

Socket.on('lobbySocketList', list => {
	let lobby = G.lobby;
	if (!lobby) return;

	lobby.sockets = list;
	(G.menu as MbpMenu).lobbyScreen.updatePlayerList(list);
	(G.menu as MbpMenu).lobbyScreen.updatePlayButton();
});

Socket.on('lobbyTextMessage', data => {
	let lobby = G.lobby;
	if (!lobby) return;

	(G.menu as MbpMenu).lobbyScreen.addChatMessage(data.username, data.body);
});

Socket.on('startGame', data => {
	let lobby = G.lobby;
	if (!lobby) return;

	lobby.settings = data.lobbySettings; // Make sure we're all on the same page

	let mission = MissionLibrary.allMissions.find(x => x.path === lobby.settings.missionPath);
	if (!mission) return;

	(G.menu as MbpMenu).lobbyScreen.hide();
	G.menu.loadingScreen.loadMissionMultiplayer(mission, lobby, data.gameId, data.seed);
});