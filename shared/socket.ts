import { SocketCommands } from './socket_commands';

export abstract class Socket {
	static WebSocketConstructor: typeof WebSocket;
	static url: string;
	static ws: WebSocket;
	static commandHandlers: Record<keyof SocketCommands, ((data: any) => void)[]> = {} as any;
	static sendQueue: string[] = [];

	static init(url: string, wsConstructor: typeof WebSocket) {
		this.WebSocketConstructor = wsConstructor;
		this.url = url;

		this.establishWebSocketConnection();

		setInterval(() => {
			this.send('heartbeat', null); // Keeps the connection alive, especially over Cloudflare
		}, 30 * 1000);
	}

	static establishWebSocketConnection() {
		this.ws = new this.WebSocketConstructor(this.url);

		this.ws.onopen = () => {
			for (let queued of this.sendQueue) {
				if (this.ws.readyState === this.ws.OPEN) // For some reason this has to be checked again? Stupid I agree
					this.ws.send(queued);
			}

			this.sendQueue.length = 0;

			this.ws.onmessage = (ev) => {
				let { command, data } = JSON.parse(ev.data);

				let arr = this.commandHandlers[command as keyof SocketCommands];
				if (!arr) return;

				for (let fn of arr) fn(data);
			};
		};
		this.ws.onclose = () => {
			setTimeout(this.establishWebSocketConnection.bind(this), 2000);
		};
		this.ws.onerror = () => {
			setTimeout(this.establishWebSocketConnection.bind(this), 2000);
		};
	}

	static send<K extends keyof SocketCommands>(command: K, data: SocketCommands[K]) {
		let serialized = JSON.stringify({ command, data });

		if (this.ws.readyState === this.ws.OPEN) {
			this.ws.send(serialized);
		} else {
			this.sendQueue.push(serialized);
		}
	}

	static on<K extends keyof SocketCommands>(command: K, callback: (data: SocketCommands[K]) => void) {
		let arr = this.commandHandlers[command];
		if (!arr) {
			arr = this.commandHandlers[command] = [];
		}

		arr.push(callback);
	}
}