import { GameObjectState } from "./game_object_state_update";

export type RTCCommands = {
	playMission: {
		missionPath: string
	},
	stateUpdate: {
		gameObjectId: number,
		state: GameObjectState
	},
	timeState: {
		serverTick: number,
		clientTick: number
	}
};

export type RTCMessage = {
	packetId: number,
	ack: number,
	commands: {
		command: keyof RTCCommands,
		data: unknown,
		ack?: number
	}[]
};