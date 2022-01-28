import { GameObjectState } from "./game_server_format";

export interface GameObjectStateUpdate {
	gameStateId: number,
	gameObjectId: number,
	tick: number,
	precedence: number,
	state: GameObjectState
}