import { GameServerConnection, GameServerSocket } from "../../shared/game_server_connection";
import { Game, games, Player } from "./game";
import { performance } from "perf_hooks";

export const sessions: Session[] = [];

export class Session {
	id: string;
	connection: GameServerConnection;
	game: Game = null;
	player: Player = null;

	constructor(id: string, socket: GameServerSocket) {
		this.id = id;
		this.connection = new GameServerConnection(socket);

		this.initConnection();
	}

	initConnection() {
		this.connection.on('join', data => {
			let game = games.find(x => x.id === data.gameId);
			if (!game) return;

			this.game = game;
			this.player = game.addPlayer(this);
		});

		this.connection.on('clientStateBundle', data => {
			this.game?.queuedPlayerBundles.push([this.player, data]);
		});

		this.connection.on('ping', ({ timestamp }) => {
			let now = performance.now();
			this.game?.pendingPings.get(this.player).set(timestamp, now);
		});

		this.connection.on('running', () => {
			if (!this.game) return;
			this.game.onPlayerRunning(this.player);
		});

		this.connection.on('restartIntent', () => {
			if (!this.game) return;
			this.game.onPlayerRestartIntent(this.player);
		});

		this.connection.on('sendTextMessage', data => {
			if (!this.game) return;
			this.game.onPlayerSendTextMessage(this.player, data.body);
		});

		this.connection.on('leave', () => {
			if (!this.game) return;
			this.leaveGame();
		});
	}

	leaveGame() {
		this.game.removePlayer(this.player);
		this.game = null;
		this.player = null;
	}
}