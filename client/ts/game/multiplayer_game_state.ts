import { GameState } from "./game_state";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameState extends GameState {
	game: MultiplayerGame;

	serverFrame: number = null;
	targetFrame: number = null;

	supplyServerTimeState(serverFrame: number, targetFrame: number) {
		if (this.serverFrame === null) {
			// This is the first time state we get from the server
			this.frame = targetFrame - 1;
		}

		this.serverFrame = serverFrame;
		this.targetFrame = targetFrame;
	}

	get frameGap() {
		return this.targetFrame - this.serverFrame;
	}
}