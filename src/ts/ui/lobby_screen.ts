import { Socket } from "../../../shared/socket";
import { SocketCommands } from "../../../shared/socket_commands";
import { AudioManager } from "../audio";
import { G } from "../global";
import { MissionLibrary } from "../mission_library";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { MbpLevelSelect } from "./level_select_mbp";
import { MbpMenu } from "./menu_mbp";
import { gameServers } from "../net/game_server";

export class LobbyScreen {
	div: HTMLDivElement;
	menu: MbpMenu;

	leaveButton: HTMLImageElement;

	serverSelectorCollapsed: HTMLImageElement;
	currentServer: HTMLParagraphElement;
	serverSelectorWindow: HTMLDivElement;
	noServersMessage: HTMLParagraphElement;

	levelImageContainer: HTMLDivElement;
	levelImage: HTMLImageElement;
	levelTitle: HTMLParagraphElement;

	playerListContainer: HTMLDivElement;

	playButton: HTMLImageElement;

	chatMessageContainer: HTMLDivElement;
	chatInput: HTMLInputElement;

	initProperties() {
		this.div = document.querySelector('#mbp-lobby');

		this.leaveButton = document.querySelector('#mbp-lobby-leave');

		this.serverSelectorCollapsed = document.querySelector('#mbp-lobby-server-selector-collapsed');
		this.currentServer = document.querySelector('#mbp-lobby-current-server');
		this.serverSelectorWindow = document.querySelector('#mbp-lobby-server-selector-window');
		this.noServersMessage = document.querySelector('#mbp-lobby-no-servers');

		this.levelImageContainer = document.querySelector('#mbp-lobby-image-container');
		this.levelImage = document.querySelector('#mbp-lobby-image');
		this.levelTitle = document.querySelector('#mbp-lobby-level-title');

		this.playerListContainer = document.querySelector('#mbp-lobby-player-list');

		this.playButton = document.querySelector('#mbp-lobby-play');

		this.chatMessageContainer = document.querySelector('#mbp-lobby-chat-container');
		this.chatInput = document.querySelector('#mbp-lobby-chat-input');
	}

	constructor(menu: MbpMenu) {
		this.initProperties();
		this.menu = menu;

		menu.setupButton(this.leaveButton, 'mp/play/leave', async () => {
			let confirmed = await menu.showConfirmPopup("Leave lobby", "Are you sure you want to leave this lobby?");
			if (!confirmed) return;

			this.hide();
			G.lobby.leave();
			menu.lobbySelectScreen.show();
		});

		menu.setupButton(this.playButton, 'play/play', () => {
			let selectedMission = MissionLibrary.allMissions.find(x => x.path === G.lobby.settings.missionPath);
			if (!selectedMission) return;

			this.hide();
			menu.loadingScreen.loadLevel(selectedMission);
		}, true);

		menu.setupButton(this.serverSelectorCollapsed, 'mp/play/difficulty', () => {
			if (this.serverSelectorWindow.classList.contains('hidden')) {
				this.serverSelectorWindow.classList.remove('hidden');
			} else {
				this.serverSelectorWindow.classList.add('hidden');
			}
		});

		this.serverSelectorWindow.querySelector('._click-preventer').addEventListener('click', () => {
			this.serverSelectorWindow.classList.add('hidden');
		});

		this.levelImageContainer.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		this.levelImageContainer.addEventListener('click', () => {
			AudioManager.play('buttonpress.wav');

			this.hide();
			(menu.levelSelect as MbpLevelSelect).show(true);
		});

		(this.chatInput.parentElement as HTMLFormElement).addEventListener('submit', e => {
			e.preventDefault();

			let body = this.chatInput.value.trim();
			if (!body) return;

			this.addChatMessage(StorageManager.data.username, body);
			this.chatInput.value = '';

			Socket.send('sendLobbyTextMessage', body);
		});

		this.chatInput.addEventListener('focus', () => this.chatInput.setAttribute('placeholder', ''));
		this.chatInput.addEventListener('blur', () => this.chatInput.setAttribute('placeholder', "Type a message"));

		window.addEventListener('keydown', e => {
			if (this.div.classList.contains('hidden')) return;

			if (e.code === 'Enter' && document.activeElement !== this.chatInput) {
				this.chatInput.focus();
			}
		});

		this.updateGameServerList();
	}

	show() {
		if (!G.lobby) throw new Error("Ah ah ah! ☝");

		this.div.classList.remove('hidden');
		this.updateUi();
	}

	hide() {
		this.div.classList.add('hidden');
	}

	onJoin() {
		this.chatMessageContainer.innerHTML = '';

		let startDiv = document.createElement('div');
		startDiv.textContent = "Welcome to chat!";
		startDiv.style.opacity = '0.5';
		this.chatMessageContainer.appendChild(startDiv);
	}

	updateUi() {
		let selectedMission = MissionLibrary.allMissions.find(x => x.path === G.lobby.settings.missionPath);
		if (selectedMission) {
			this.levelImage.src = selectedMission.getImagePath();
			this.levelTitle.textContent = selectedMission.title;
		}

		if (!G.lobby.settings.gameServer) {
			this.currentServer.textContent = "Select server";
		} else {
			let gameServer = gameServers.find(x => x.id === G.lobby.settings.gameServer);
			if (!gameServer) {
				this.currentServer.textContent = "???";
			} else {
				this.currentServer.textContent = gameServer.id;
			}
		}

		this.updatePlayButton();
	}

	updatePlayerList(list: SocketCommands['lobbySocketList']) {
		this.playerListContainer.innerHTML = '';

		for (let player of list) {
			let div = document.createElement('div');

			div.innerHTML = `<span>${Util.htmlEscape(player.name)}</span>`;

			let statusColor = {
				'connecting': '', // Good?
				'connected': '#72e13c'
			}[player.connectionStatus] ?? '';
			div.innerHTML += `<span style="color: ${statusColor};">${{
				'connecting': "Connecting",
				'connected': "Connected"
			}[Util.htmlEscape(player.connectionStatus)] ?? "In Lobby"}</span>`;

			this.playerListContainer.appendChild(div);
		}
	}

	updatePlayButton() {
		let enabled = !!G.lobby.settings.gameServer && G.lobby.sockets.every(x => x.connectionStatus === 'connected');

		if (enabled && this.playButton.style.pointerEvents === 'none') {
			this.playButton.style.pointerEvents = '';
			this.playButton.src = this.playButton.src.replace(/_\w\.png$/, '_n.png');
		} else if (!enabled) {
			this.playButton.style.pointerEvents = 'none';
			this.playButton.src = this.playButton.src.replace(/_\w\.png$/, '_i.png');
		}
	}

	addChatMessage(username: string, body: string) {
		let div = document.createElement('div');
		div.innerHTML = `<b>${Util.htmlEscape(username)}</b>: ${Util.htmlEscape(body)}`;

		let scrolledToBottom = this.chatMessageContainer.scrollHeight - this.chatMessageContainer.scrollTop === this.chatMessageContainer.clientHeight;
		this.chatMessageContainer.appendChild(div);

		if (scrolledToBottom) this.chatMessageContainer.scrollTop = 1e6;
	}

	updateGameServerList() {
		this.serverSelectorWindow.querySelector('._content').innerHTML = '';

		if (gameServers.length === 0) {
			this.noServersMessage.style.display = '';
			return;
		}

		this.noServersMessage.style.display = 'none';

		for (let gameServer of gameServers) {
			let div = document.createElement('div');
			let img = document.createElement('img');
			this.menu.setupButton(img, 'mp/play/difficultysel', () => {
				G.lobby.settings.gameServer = gameServer.id;
				G.lobby.onSettingsChanged();
				this.serverSelectorWindow.classList.add('hidden');
			});
			let p = document.createElement('p');
			p.textContent = gameServer.id;
			div.append(img, p);

			this.serverSelectorWindow.querySelector('._content').append(div);
		}
	}
}