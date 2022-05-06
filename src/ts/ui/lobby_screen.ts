import { Socket } from "../../../shared/socket";
import { SocketCommands } from "../../../shared/socket_commands";
import { AudioManager } from "../audio";
import { G } from "../global";
import { MissionLibrary } from "../mission_library";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { MbpLevelSelect } from "./level_select_mbp";
import { MbpMenu } from "./menu_mbp";

export class LobbyScreen {
	div: HTMLDivElement;

	leaveButton: HTMLImageElement;

	levelImageContainer: HTMLDivElement;
	levelImage: HTMLImageElement;
	levelTitle: HTMLParagraphElement;

	playerListContainer: HTMLDivElement;

	playButton: HTMLImageElement;

	chatMessageContainer: HTMLDivElement;
	chatInput: HTMLInputElement;

	constructor(menu: MbpMenu) {
		this.initProperties();

		menu.setupButton(this.leaveButton, 'mp/play/leave', async () => {
			let confirmed = await menu.showConfirmPopup("Leave lobby", "Are you sure you want to leave this lobby?");
			if (!confirmed) return;

			this.hide();
			G.lobby.leave();
			menu.lobbySelectScreen.show();
		});

		menu.setupButton(this.playButton, 'play/play', () => {
			console.log("pressed");
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
	}

	initProperties() {
		this.div = document.querySelector('#mbp-lobby');

		this.leaveButton = document.querySelector('#mbp-lobby-leave');

		this.levelImageContainer = document.querySelector('#mbp-lobby-image-container');
		this.levelImage = document.querySelector('#mbp-lobby-image');
		this.levelTitle = document.querySelector('#mbp-lobby-level-title');

		this.playerListContainer = document.querySelector('#mbp-lobby-player-list');

		this.playButton = document.querySelector('#mbp-lobby-play');

		this.chatMessageContainer = document.querySelector('#mbp-lobby-chat-container');
		this.chatInput = document.querySelector('#mbp-lobby-chat-input');
	}

	show() {
		if (!G.lobby) throw new Error("Ah ah ah! ☝");

		this.div.classList.remove('hidden');
		this.updateUi();
	}

	hide() {
		this.div.classList.add('hidden');
	}

	updateUi() {
		let selectedMission = MissionLibrary.allMissions.find(x => x.path === G.lobby.settings.missionPath);
		if (!selectedMission) return;

		this.levelImage.src = selectedMission.getImagePath();
		this.levelTitle.textContent = selectedMission.title;
	}

	updatePlayerList(list: SocketCommands['lobbyPlayerList']) {
		this.playerListContainer.innerHTML = '';

		for (let player of list) {
			let div = document.createElement('div');

			div.innerHTML = `<span>${Util.htmlEscape(player.name)}</span><span>Connected</span>`;

			this.playerListContainer.appendChild(div);
		}
	}

	addChatMessage(username: string, body: string) {
		let div = document.createElement('div');
		div.innerHTML = `<b>${Util.htmlEscape(username)}</b>: ${Util.htmlEscape(body)}`;

		let scrolledToBottom = this.chatMessageContainer.scrollHeight - this.chatMessageContainer.scrollTop === this.chatMessageContainer.clientHeight;
		this.chatMessageContainer.appendChild(div);

		if (scrolledToBottom) this.chatMessageContainer.scrollTop = 1e6;
	}
}