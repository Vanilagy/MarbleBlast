import { BinarySerializer } from "./binary_serializer";
import { RTCCommands, RTCMessage } from "./rtc";

/** Returns a promise that resolves after `ms` milliseconds. */
const wait = (ms: number) => {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const peerConnectionConfig = {
	'iceServers': [
		{'urls': 'stun:stun.stunprotocol.org:3478'},
		{'urls': 'stun:stun.l.google.com:19302'},
	]
};

export abstract class RTCConnection {
	rtc: RTCPeerConnection;
	dataChannel: RTCDataChannel;

	queuedCommands: {
		command: keyof RTCCommands,
		data: any,
		ack?: number,
		id?: string
	}[] = [];
	localPacketId = 0;
	remotePacketId = -1;

	tickTimeout = 0;
	addedOneWayLatency = 0;
	commandHandlers: Record<keyof RTCCommands, ((data: any) => void)[]> = {} as any;

	constructor(RTCPeerConnectionConstructor: typeof RTCPeerConnection) {
		this.rtc = new RTCPeerConnectionConstructor(peerConnectionConfig);

		this.rtc.onicecandidate = (ev) => this.gotIceCandidate(ev.candidate);
		this.rtc.ondatachannel = (ev) => {
			let channel = ev.channel;
			this.initDataChannel(channel);
		};
	}

	async createOffer() {
		let channel = this.rtc.createDataChannel('main');
		this.initDataChannel(channel);

		let offer = await this.rtc.createOffer();
		this.createdDescription(offer);
	}

	abstract gotIceCandidate(candidate: RTCIceCandidate): void;

	async createdDescription(description: RTCSessionDescriptionInit) {
		await this.rtc.setLocalDescription(description);
	}

	async gotIceFromServer(candidate: RTCIceCandidate) {
		if (!candidate.candidate) return; // "Expect line: candidate:<candidate-str>" bruh moment
		this.rtc.addIceCandidate(candidate);
	}

	async gotSdpFromServer(description: RTCSessionDescription) {
		await this.rtc.setRemoteDescription(description);

		if (description.type === 'offer') {
			let answer = await this.rtc.createAnswer();
			this.createdDescription(answer);
		}
	}

	initDataChannel(channel: RTCDataChannel) {
		this.dataChannel = channel;
		this.dataChannel.binaryType = 'arraybuffer';

		this.dataChannel.onmessage = (ev) => {
			let decoded = BinarySerializer.decode(ev.data) as RTCMessage;
			this.onMessage(decoded);
		};
		this.dataChannel.onopen = () => {
			console.log("DC open! 🎉");
		};
	}

	queueCommand<K extends keyof RTCCommands>(command: K, data: RTCCommands[K], reliable = true, uniqueCommandId?: string) {
		let commandObject = {
			command,
			data,
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
		if (this.dataChannel?.readyState !== 'open') return;
		if (this.tickTimeout-- > 0 && this.queuedCommands.length === 0) return;

		this.sendCommands();

		if (this.queuedCommands.length === 0) this.tickTimeout = 2; // When we've got no more commands to send, our main function is simply to send over ACKs - we can do this at a reduced rate.
	}

	sendCommands() {
		let message: RTCMessage = {
			packetId: this.localPacketId++,
			ack: this.remotePacketId,
			commands: this.queuedCommands.map(x => ({
				command: x.command,
				data: x.data,
				ack: x.ack
			}))
		};
		this.send(message);

		for (let i = 0; i < this.queuedCommands.length; i++) {
			if (this.queuedCommands[i].ack === null)
				this.queuedCommands.splice(i--, 1);
		}
	}

	async send(message: RTCMessage) {
		let encoded = BinarySerializer.encode(message);
		if (this.addedOneWayLatency) await wait(this.addedOneWayLatency);

		if (this.dataChannel?.readyState === 'open') {
			this.dataChannel.send(encoded);
		}
	}

	onMessage(message: RTCMessage) {
		//console.log(message);

		if (message.packetId <= this.remotePacketId) return; // Discard out-of-order messages
		this.remotePacketId = message.packetId;

		for (let i = 0; i < this.queuedCommands.length; i++) {
			if (this.queuedCommands[i].ack !== null && this.queuedCommands[i].ack <= message.ack)
				this.queuedCommands.splice(i--, 1);
		}

		for (let { command, data, ack } of message.commands) {
			if (ack !== null && ack < this.remotePacketId) continue;

			let arr = this.commandHandlers[command as keyof RTCCommands];
			if (!arr) continue;

			for (let fn of arr) fn(data);
		}
	}

	on<K extends keyof RTCCommands>(command: K, callback: (data: RTCCommands[K]) => void) {
		let arr = this.commandHandlers[command];
		if (!arr) {
			arr = this.commandHandlers[command] = [];
		}

		arr.push(callback);
	}
}