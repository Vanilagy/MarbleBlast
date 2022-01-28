import { GameServerCommands } from "../../../shared/rtc";
import { GameState } from "./game_state";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameState extends GameState {
	game: MultiplayerGame;

	serverTick: number = null;
	targetClientTick: number = null;

	supplyServerTimeState(data: GameServerCommands['timeState']) {
		if (this.serverTick === null) {
			// This is the first time state we get from the server

			this.tick = data.clientTick - 1;
		}

		this.serverTick = data.serverTick;
		this.targetClientTick = data.clientTick;
	}
}