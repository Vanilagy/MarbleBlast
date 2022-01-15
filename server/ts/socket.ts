import expressWs from "express-ws";
import { SocketCommands } from "../../shared/socket_commands";

export type WebSocketType = Parameters<expressWs.WebsocketRequestHandler>[0];

export class Socket {
	ws: WebSocketType;
	commandHandlers: Record<keyof SocketCommands, ((data: any) => void)[]> = {} as any;
	onClose: () => void = null;
	sessionId: string = null;

	constructor(ws: WebSocketType) {
		this.ws = ws;

		ws.onmessage = (ev) => {
			try {
				let { command, data } = JSON.parse(ev.data as string);

				let arr = this.commandHandlers[command as keyof SocketCommands];
				if (!arr) return;

				for (let fn of arr) fn(data);
			} catch (e) {
				console.error(e);
			}
		};
		ws.onerror = () => {
			ws.onmessage = null;
			this.onClose?.();
		};
		ws.onclose = () => {
			ws.onmessage = null;
			this.onClose?.();
		};
	}

	send<K extends keyof SocketCommands>(command: K, data: SocketCommands[K]) {
		if (this.ws.readyState === this.ws.OPEN) {
			this.ws.send(JSON.stringify({ command, data }));
		}
	}

	on<K extends keyof SocketCommands>(command: K, callback: (data: SocketCommands[K]) => void) {
		let arr = this.commandHandlers[command];
		if (!arr) {
			arr = this.commandHandlers[command] = [];
		}

		arr.push(callback);
	}
}