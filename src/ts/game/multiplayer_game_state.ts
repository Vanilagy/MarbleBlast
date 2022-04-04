import { CommandToData } from "../../../shared/game_server_format";
import { GameState } from "./game_state";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameState extends GameState {
	game: MultiplayerGame;

	serverFrame: number = null;
	targetClientFrame: number = null;

	supplyServerTimeState(serverFrame: number, clientFrame: number) {
		if (this.serverFrame === null) {
			// This is the first time state we get from the server
			this.frame = clientFrame - 1;
		}

		this.serverFrame = serverFrame;
		this.targetClientFrame = clientFrame;
	}
}