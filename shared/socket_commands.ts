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
	}
};