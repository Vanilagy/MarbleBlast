import { Socket } from "../../../shared/socket";
import { LobbySettings } from "../../../shared/types";
import { MultiplayerGame } from "../game/multiplayer_game";
import { G } from "../global";
import { MissionLibrary } from "../mission_library";
import { MbpMenu } from "../ui/menu_mbp";
import { Connectivity } from "./connectivity";
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
	ownerSessionId: string = null;
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

	leave(kicked = false) {
		clearInterval(this.pollerInterval);

		if (!kicked) Socket.send('leaveLobby', null);

		let connectedGameServer = gameServers.find(x => x.connection);
		connectedGameServer?.disconnect();

		G.lobby = null;

		(G.menu as MbpMenu).lobbyScreen.hide();
		(G.menu as MbpMenu).lobbySelectScreen.show();

		if (kicked) G.menu.showAlertPopup('Kicked', 'The lobby owner has kicked you out of the lobby.');
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

	localSessionIsOwner() {
		return this.ownerSessionId === Connectivity.sessionId;
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

Socket.on('lobbyOwner', ownerSessionId => {
	let lobby = G.lobby;
	if (!lobby) return;

	lobby.ownerSessionId = ownerSessionId;
	(G.menu as MbpMenu).lobbyScreen.updateUi();
	(G.menu as MbpMenu).lobbyScreen.updatePlayerList(lobby.sockets);
});

Socket.on('kicked', () => {
	let lobby = G.lobby;
	if (!lobby) return;

	lobby.leave(true);
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

Socket.on('endGame', () => {
	let lobby = G.lobby;
	let game = G.game;
	if (!lobby || !game) return;

	(game as MultiplayerGame).stopAndExit(true);

	G.menu.levelSelect.hide();
	(G.menu as MbpMenu).lobbyScreen.show();
});