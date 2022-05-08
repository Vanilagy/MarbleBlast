import { Socket } from "../../../shared/socket";
import { SocketCommands } from "../../../shared/socket_commands";
import { G } from "../global";
import { Lobby } from "../net/lobby";
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
			div.textContent = lobby.name;

			div.addEventListener('click', () => {
				Socket.send('joinLobbyRequest', lobby.id);
			});

			this.listContainer.appendChild(div);
		}
	}
}