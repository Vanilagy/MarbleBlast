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
	getStatus(): 'connecting' | 'connected';
	close(): void;
}

export enum Reliability {
	Unreliable,
	Urgent,
	Relaxed
}

interface CommandBundle {
	command: GameServerMessage['commandWrappers'][number]['command'],
	reliability: Reliability,
	localPacketId: number
}

export class GameServerConnection {
	socket: GameServerSocket;
	queuedCommands: CommandBundle[] = [];
	awaitingRelaxedAck: CommandBundle[] = [];
	queuedAcks: number[] = [];
	localPacketId = 0;
	lastRemotePacketId = -1;

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

	queueCommand(command: GameServerMessage['commandWrappers'][number]['command'], reliability: Reliability) {
		reliability = Reliability.Unreliable;
		let commandObject = {
			command,
			reliability: reliability,
			localPacketId: this.localPacketId
		};

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
			localPacketId: this.localPacketId++,
			lastRemotePacketId: this.lastRemotePacketId,
			needsAck: this.queuedCommands.some(x => x.reliability === Reliability.Relaxed),
			commandWrappers: this.queuedCommands.map(x => ({ packetId: x.localPacketId, command: x.command })),
			acks: this.queuedAcks
		};
		this.send(message);

		for (let i = 0; i < this.queuedCommands.length; i++) {
			let cmd = this.queuedCommands[i];

			if (cmd.reliability === Reliability.Unreliable || cmd.reliability === Reliability.Relaxed) {
				this.queuedCommands.splice(i--, 1);

				if (cmd.reliability === Reliability.Relaxed)
					this.awaitingRelaxedAck.push(cmd);
			}
		}

		this.queuedAcks.length = 0;
	}

	async send(message: GameServerMessage) {
		let encoded = FixedFormatBinarySerializer.encode(message, gameServerMessageFormat);
		if (this.addedOneWayLatency) await wait(this.addedOneWayLatency);

		this.onOutgoingPacket?.(encoded.byteLength);

		if (this.socket.canSend()) this.socket.send(encoded);
	}

	onMessage(message: GameServerMessage) {
		if (message.localPacketId <= this.lastRemotePacketId) return; // Discard out-of-order messages

		for (let i = 0; i < this.queuedCommands.length; i++) {
			let cmd = this.queuedCommands[i];
			if (cmd.reliability === Reliability.Urgent && cmd.localPacketId <= message.lastRemotePacketId)
				this.queuedCommands.splice(i--, 1);
		}

		for (let wrapper of message.commandWrappers) {
			if (wrapper.packetId <= this.lastRemotePacketId) continue;

			let arr = this.commandHandlers.get(wrapper.command.command);
			for (let fn of arr) fn(wrapper.command);
		}

		for (let i = 0; i < this.awaitingRelaxedAck.length; i++) {
			let cmd = this.awaitingRelaxedAck[i];
			if (message.acks.includes(cmd.localPacketId)) {
				this.awaitingRelaxedAck.splice(i--, 1);
			} else if (message.lastRemotePacketId > cmd.localPacketId) {
				this.awaitingRelaxedAck.splice(i--, 1);
				this.queuedCommands.push(cmd); // Requeue the thing
			}
		}

		this.lastRemotePacketId = message.localPacketId;
		if (message.needsAck) this.queuedAcks.push(message.localPacketId);
	}

	on<K extends GameServerCommands>(command: K, callback: (data: CommandToData<K>, attachmentId?: string) => void) {
		let arr = this.commandHandlers.get(command);
		arr.push(callback);
	}

	disconnect() {
		this.socket.close();
	}
}