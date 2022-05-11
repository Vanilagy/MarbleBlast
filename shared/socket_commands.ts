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
		sessionId: string,
		connectionId: string
	},
	rtcSdpGameServer: {
		sdp: RTCSessionDescription,
		sessionId: string,
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
		gameId: string,
		seed: number
	},
	endGameRequest: null,
	endGame: null,
	loadingCompletion: number,
	lobbyOwner: string,
	kickSocketOutOfLobby: string,
	kicked: null,
	promotePlayer: string,

	lobbyList: {
		id: string,
		name: string,
		settings: LobbySettings,
		socketCount: number,
		status: 'idle' | 'playing'
	}[],
	subscribeToLobbyList: null,
	unsubscribeFromLobbyList: null,

	createGame: {
		lobbyId: string,
		lobbySettings: LobbySettings,
		lobbyOwnerSessionId: string,
		sessions: string[]
	},
	createGameConfirm: {
		lobbyId: string,
		gameId: string
	},
	destroyGame: {
		lobbyId: string
	}
};