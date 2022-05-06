import { Socket } from "../../../shared/socket";
import { LobbySettings } from "../../../shared/types";
import { G } from "../global";
import { MbpMenu } from "../ui/menu_mbp";

export class Lobby {
	id: string;
	name: string;
	settings: LobbySettings;

	constructor(id: string, name: string, settings: LobbySettings) {
		this.id = id;
		this.name = name;
		this.settings = settings;

		this.join(); // Happens automatically
	}

	join() {
		Socket.on('lobbySettingsChange', settings => {
			this.settings = settings;
			(G.menu as MbpMenu).lobbyScreen.updateUi();
		});

		Socket.on('lobbyPlayerList', list => {
			(G.menu as MbpMenu).lobbyScreen.updatePlayerList(list);
		});

		Socket.on('lobbyTextMessage', data => {
			(G.menu as MbpMenu).lobbyScreen.addChatMessage(data.username, data.body);
		});

		(G.menu as MbpMenu).lobbyScreen.chatMessageContainer.innerHTML = '';
	}

	leave() {
		Socket.send('leaveLobby', null);
		Socket.off('lobbySettingsChange');
	}

	onSettingsChanged() {
		Socket.send('setLobbySettings', this.settings);
	}
}