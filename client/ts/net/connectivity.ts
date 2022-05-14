import { Socket } from "../../../shared/socket";
import { Util } from "../util";
import { GameServer } from "./game_server";

export abstract class Connectivity {
	static sessionId: string;

	static async init() {
		this.sessionId = Util.uuid();

		GameServer.init();

		let url = location.origin.replace('http', 'ws') + '/ws';
		url += `?session-id=${encodeURIComponent(this.sessionId)}`;

		Socket.init(url, WebSocket);
	}
}