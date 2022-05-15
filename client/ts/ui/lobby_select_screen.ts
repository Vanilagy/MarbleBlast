import { Socket } from "../../../shared/socket";
import { SocketCommands } from "../../../shared/socket_commands";
import { G } from "../global";
import { MissionLibrary } from "../mission_library";
import { gameServers } from "../net/game_server";
import { Lobby } from "../net/lobby";
import { lobbyModeNames } from "./lobby_screen";
import { MbpMenu } from "./menu_mbp";

export class LobbySelectScreen {
	menu: MbpMenu;
	div: HTMLDivElement;

	closeButton: HTMLImageElement;
	createLobbyButton: HTMLImageElement;
	listContainer: HTMLDivElement;

	constructor(menu: MbpMenu) {
		this.menu = menu;
		this.initProperties();

		menu.setupButton(this.closeButton, 'mp/team/close', () => {
			this.hide();
			menu.home.show();
		});

		menu.setupButton(this.createLobbyButton, 'mp/team/create', () => {
			Socket.send('createLobbyRequest', null);
		});

		Socket.on('lobbyList', list => {
			this.updateLobbyList(list);
		});

		Socket.on('joinLobbyResponse', data => {
			if (G.lobby) throw new Error("Already in a lobby!");

			this.hide();

			let newLobby = new Lobby(data.id, data.name, data.settings);
			G.lobby = newLobby;
			newLobby.join();
			this.menu.lobbyScreen.show();
		});
	}

	initProperties() {
		this.div = document.querySelector('#mbp-lobby-select');

		this.closeButton = document.querySelector('#mbp-lobby-select-close');
		this.createLobbyButton = document.querySelector('#mbp-lobby-select-create');
		this.listContainer = document.querySelector('#mbp-lobby-select-list');
	}

	show() {
		this.div.classList.remove('hidden');
		G.menu.backgroundImage.src = (G.menu as MbpMenu).multiplayerBg;

		Socket.send('subscribeToLobbyList', null);
	}

	hide() {
		this.div.classList.add('hidden');

		Socket.send('unsubscribeFromLobbyList', null);
	}

	updateLobbyList(list: SocketCommands['lobbyList']) {
		this.listContainer.innerHTML = '';

		for (let lobby of list) {
			let div = document.createElement('div');

			let img = document.createElement('img');
			let mission = MissionLibrary.allMissions.find(x => x.path === lobby.settings.missionPath);
			img.src = mission.getImagePath();
			img.title = mission.title;

			let topText = document.createElement('p');
			topText.textContent = lobby.name;

			let bottomText = document.createElement('p');
			let gameServer = gameServers.find(x => x.id === lobby.settings.gameServer);
			bottomText.innerHTML = `<span style="color: #e5a8ff">${lobbyModeNames[lobby.settings.mode]}</span>  |  ${lobby.socketCount} Player${lobby.socketCount === 1 ? '' : 's'}  |  ${gameServer?.id ?? 'Server not selected'}`;

			let statusText = document.createElement('p');
			statusText.textContent = lobby.status === 'idle' ? 'Waiting' : 'In-Game';
			if (lobby.status === 'playing') statusText.style.color = '#ffa966';

			div.append(img, topText, bottomText, statusText);

			div.addEventListener('click', () => {
				if (lobby.status === 'playing') {
					alert("Cannot join ongoing games right now.");
					return;
				}
				Socket.send('joinLobbyRequest', lobby.id);
			});

			this.listContainer.appendChild(div);
		}
	}
}