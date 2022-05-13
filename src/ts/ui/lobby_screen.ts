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
import { Connectivity } from "../net/connectivity";

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
	playerActionsContainer: HTMLDivElement;
	currentPlayerActionReceiver: string = null;

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
		this.playerActionsContainer = document.querySelector('#mbp-lobby-player-actions');

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

			G.lobby.leave();
		});

		menu.setupButton(this.playButton, 'play/play', () => {
			Socket.send('startGameRequest', null);
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

		this.playerActionsContainer.querySelector('._click-preventer').addEventListener('click', () => {
			this.playerActionsContainer.classList.add('hidden');
		});

		menu.setupButton(this.playerActionsContainer.querySelector('#mbp-lobby-player-action-kick') as HTMLImageElement, 'mp/play/kick', async () => {
			let confirmed = await menu.showConfirmPopup('Kick Player', `Are you sure you want to kick player ${G.lobby.sockets.find(x => x.id === this.currentPlayerActionReceiver)?.name} out of this lobby?`);
			if (!confirmed) return;

			this.playerActionsContainer.classList.add('hidden');
			Socket.send('kickSocketOutOfLobby', this.currentPlayerActionReceiver);
		});

		menu.setupButton(this.playerActionsContainer.querySelector('#mbp-lobby-player-action-promote') as HTMLImageElement, 'mp/play/empty', async () => {
			let confirmed = await menu.showConfirmPopup('Promote Player', `Are you sure you want to promote player ${G.lobby.sockets.find(x => x.id === this.currentPlayerActionReceiver)?.name} to lobby owner?`);
			if (!confirmed) return;

			this.playerActionsContainer.classList.add('hidden');
			Socket.send('promotePlayer', this.currentPlayerActionReceiver);
		});

		this.updateGameServerList();
	}

	show() {
		if (!G.lobby) throw new Error("Ah ah ah! ☝");

		this.div.classList.remove('hidden');
		this.updateUi();

		G.menu.backgroundImage.src = (G.menu as MbpMenu).multiplayerBg;
		this.chatMessageContainer.scrollTop = 1e10;
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

		if (G.lobby.localSessionIsOwner()) {
			this.serverSelectorCollapsed.src = this.serverSelectorCollapsed.src.replace(/_\w\.png$/, '_n.png');
			this.serverSelectorCollapsed.style.pointerEvents = '';
			this.playerListContainer.classList.add('_is-lobby-owner');
			this.levelImageContainer.style.pointerEvents = '';
		} else {
			this.serverSelectorCollapsed.src = this.serverSelectorCollapsed.src.replace(/_\w\.png$/, '_i.png');
			this.serverSelectorCollapsed.style.pointerEvents = 'none';
			this.playerListContainer.classList.remove('_is-lobby-owner');
			this.levelImageContainer.style.pointerEvents = 'none';
		}
	}

	// todo: method name
	updatePlayerList(list: SocketCommands['lobbySocketList']) {
		this.playerListContainer.innerHTML = '';

		for (let player of list) {
			let div = document.createElement('div');

			div.innerHTML = `<span>${Util.htmlEscape(player.name)}</span>`;

			if (G.lobby.ownerSessionId === player.id)
				div.innerHTML += '<img src="./assets/img/crown_b.png" class="_lobby-owner-icon" title="Lobby owner">';

			let statusColor = {
				'connecting': '', // Good?
				'connected': '#72e13c'
			}[player.connectionStatus] ?? '';
			div.innerHTML += `<span style="color: ${statusColor};">${{
				'connecting': "Connecting",
				'connected': "Connected"
			}[Util.htmlEscape(player.connectionStatus)] ?? "In Lobby"}</span>`;

			this.playerListContainer.appendChild(div);

			if (G.lobby.localSessionIsOwner() && player.id !== G.lobby.ownerSessionId) div.addEventListener('click', () => {
				this.playerActionsContainer.classList.remove('hidden');
				let wholeBoundingRect = this.div.getBoundingClientRect();
				let boundingRect = div.getBoundingClientRect();

				this.playerActionsContainer.style.bottom = (boundingRect.top - wholeBoundingRect.top) + 'px';
				this.playerActionsContainer.style.left = (boundingRect.left - wholeBoundingRect.left + Math.floor(boundingRect.width/2)) + 'px';

				this.currentPlayerActionReceiver = player.id;
			});
		}

		if (!list.some(x => x.id === this.currentPlayerActionReceiver)) {
			this.playerActionsContainer.classList.add('hidden'); // Hide the action popup if the player isn't in the lobby anymore
			this.currentPlayerActionReceiver = null;
		}
	}

	updatePlayButton() {
		let enabled = !!G.lobby.settings.gameServer && G.lobby.sockets.every(x => x.connectionStatus === 'connected') && G.lobby.localSessionIsOwner();

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