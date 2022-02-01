import { DefaultMap } from "./default_map";
import { FixedFormatBinarySerializer } from "./fixed_format_binary_serializer";
import { CommandToData, GameServerCommands, GameServerMessage, gameServerMessageFormat } from "./game_server_format";

/** Returns a promise that resolves after `ms` milliseconds. */
const wait = (ms: number) => {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
};

export interface GameServerSocket {
	send(data: ArrayBuffer): void;
	receive: (data: ArrayBuffer) => void;
	canSend(): boolean;
}

export class GameServerConnection {
	socket: GameServerSocket;
	queuedCommands: {
		command: GameServerMessage['commands'][number],
		ack?: number,
		id?: string
	}[] = [];
	localPacketId = 0;
	remotePacketId = -1;

	tickTimeout = 0;
	addedOneWayLatency = 0;
	commandHandlers = new DefaultMap<GameServerCommands, ((data: any) => void)[]>(() => []);

	beforeTick?: () => void = null;
	onIncomingPacket?: (byteLength: number) => void = null;
	onOutgoingPacket?: (byteLength: number) => void = null;

	constructor(socket: GameServerSocket) {
		this.socket = socket;

		this.socket.receive = async data => {
			let decoded = FixedFormatBinarySerializer.decode(data, gameServerMessageFormat);
			if (this.addedOneWayLatency) await wait(this.addedOneWayLatency);

			this.onIncomingPacket?.(data.byteLength);
			this.onMessage(decoded);
		};
	}

	queueCommand(command: GameServerMessage['commands'][number], reliable = false ?? true, uniqueCommandId?: string) {
		let commandObject = {
			command,
			ack: reliable? this.localPacketId : null,
			id: uniqueCommandId
		};

		if (uniqueCommandId !== undefined) {
			for (let i = 0; i < this.queuedCommands.length; i++) {
				if (this.queuedCommands[i].id !== uniqueCommandId) continue;

				this.queuedCommands[i] = commandObject;
				return;
			}
		}

		this.queuedCommands.push(commandObject);
	}

	tick() {
		this.beforeTick?.();

		if (this.tickTimeout-- > 0 && this.queuedCommands.length === 0) return;

		this.sendCommands();

		if (this.queuedCommands.length === 0) this.tickTimeout = 2; // When we've got no more commands to send, our main function is simply to send over ACKs - we can do this at a reduced rate.
	}

	sendCommands() {
		let message: GameServerMessage = {
			packetId: this.localPacketId++,
			ack: this.remotePacketId,
			commands: this.queuedCommands.map(x => x.command)
		};
		this.send(message);

		for (let i = 0; i < this.queuedCommands.length; i++) {
			if (this.queuedCommands[i].ack === null)
				this.queuedCommands.splice(i--, 1);
		}
	}

	async send(message: GameServerMessage) {
		//console.log(message);
		let encoded = FixedFormatBinarySerializer.encode(message, gameServerMessageFormat);
		if (this.addedOneWayLatency) await wait(this.addedOneWayLatency);

		this.onOutgoingPacket?.(encoded.byteLength);

		if (this.socket.canSend()) this.socket.send(encoded);
	}

	onMessage(message: GameServerMessage) {
		//console.log(message);

		if (message.packetId <= this.remotePacketId) return; // Discard out-of-order messages

		for (let i = 0; i < this.queuedCommands.length; i++) {
			if (this.queuedCommands[i].ack !== null && this.queuedCommands[i].ack <= message.ack)
				this.queuedCommands.splice(i--, 1);
		}

		for (let command of message.commands) {
			//if (ack !== null && ack <= this.remotePacketId) continue;

			let arr = this.commandHandlers.get(command.command);
			for (let fn of arr) fn(command);
		}

		this.remotePacketId = message.packetId;
	}

	on<K extends GameServerCommands>(command: K, callback: (data: CommandToData<K>) => void) {
		let arr = this.commandHandlers.get(command);
		arr.push(callback);
	}

	clearAllHandlers() {
		this.commandHandlers.clear();
	}
}