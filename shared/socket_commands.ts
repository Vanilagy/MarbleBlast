import { LobbySettings } from "./types";

export type SocketCommands = {
	heartbeat: null,

	updateGameServerList: {
		id: string,
		wsUrl?: string
	}[],

	rtcIce: {
		ice: RTCIceCandidate,
		gameServerId: string,
		connectionId: string
	},
	rtcSdp: {
		sdp: RTCSessionDescription,
		gameServerId: string,
		connectionId: string
	},
	rtcIceGameServer: {
		ice: RTCIceCandidate,
		connectionId: string
	},
	rtcSdpGameServer: {
		sdp: RTCSessionDescription,
		connectionId: string
	},

	setUsername: string,

	createLobbyRequest: null,
	joinLobbyRequest: string,
	joinLobbyResponse: {
		id: string,
		name: string,
		settings: LobbySettings
	},
	leaveLobby: null,
	setLobbySettings: LobbySettings,
	lobbySettingsChange: LobbySettings,
	sendLobbyTextMessage: string,
	lobbyTextMessage: {
		username: string,
		body: string
	},
	lobbySocketList: {
		id: string,
		name: string,
		connectionStatus: 'connecting' | 'connected',
		loadingCompletion: number
	}[],
	connectionStatus: 'connecting' | 'connected',
	startGameRequest: null,
	startGame: {
		lobbySettings: LobbySettings,
		seed: number
	},
	loadingCompletion: number,

	lobbyList: {
		id: string,
		name: string
	}[],
	subscribeToLobbyList: null,
	unsubscribeFromLobbyList: null,

	createGame: {
		lobbyId: string,
		lobbySettings: LobbySettings,
		sessions: string[]
	},
	createGameConfirm: {
		lobbyId: string
	}
};