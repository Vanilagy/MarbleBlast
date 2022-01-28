/*

import { GameObjectStateUpdate } from "./game_object_state_update";

export type GameServerCommands = {
	ping: {
		timestamp: number
	},
	pong: {
		timestamp: number,
		subtract: number
	},
	joinMission: {
		missionPath: string
	},
	stateUpdate: {
		gameObjectId: number,
		stateUpdate: GameObjectStateUpdate
	},
	timeState: {
		serverTick: number,
		clientTick: number
	},
	reconciliationInfo: {
		rewindTo: number
	}
};

export type GameServerMessage = {
	packetId: number,
	ack: number,
	commands: {
		command: keyof GameServerCommands,
		data: unknown,
		ack?: number
	}[]
};

*/