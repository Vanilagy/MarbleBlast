import { LobbySettings } from "./types";

export type SocketCommands = {
	heartbeat: null,

	updateGameServerList: {
		id: string,
		wsUrl?: string
	}[],

	rtcIce: {
		ice: RTCIceCandidate,
		gameServerId: string
	},
	rtcSdp: {
		sdp: RTCSessionDescription,
		gameServerId: string
	},
	rtcIceGameServer: {
		ice: RTCIceCandidate,
		sessionId: string
	},
	rtcSdpGameServer: {
		sdp: RTCSessionDescription,
		sessionId: string
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

	lobbyList: {
		id: string,
		name: string
	}[],
	subscribeToLobbyList: null,
	unsubscribeFromLobbyList: null,
	lobbyPlayerList: {
		name: string
	}[]
};