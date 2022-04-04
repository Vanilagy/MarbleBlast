import { CommandToData } from "../../../shared/game_server_format";
import { GameState } from "./game_state";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameState extends GameState {
	game: MultiplayerGame;

	serverTick: number = null;
	targetClientTick: number = null;

	supplyServerTimeState(serverTick: number, clientTick: number) {
		if (this.serverTick === null) {
			// This is the first time state we get from the server
			this.tick = clientTick - 1;
		}

		this.serverTick = serverTick;
		this.targetClientTick = clientTick;
	}
}