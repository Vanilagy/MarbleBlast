import { Game } from "./game";

export class SingleplayerGame extends Game {
	type = 'singleplayer' as const;

	async init() {
		await super.init();

		await this.addPlayer({
			id: -1,
			sessionId: null,
			marbleId: -2,
			checkpointStateId: -3
		});
		this.localPlayer = this.players[0];
		this.localPlayer.controlledMarble.addToGame();

		this.state.scheduledRestartFrame = 0;
	}

	signalRestartIntent() {
		this.state.restart();
	}
}