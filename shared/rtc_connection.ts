import { GameServerSocket } from './game_server_connection';

const peerConnectionConfig = {
	'iceServers': [
		{'urls': 'stun:stun.stunprotocol.org:3478'},
		{'urls': 'stun:stun.l.google.com:19302'},
	]
};

export abstract class RTCConnection implements GameServerSocket {
	rtc: RTCPeerConnection;
	dataChannel: RTCDataChannel;
	receive: (data: ArrayBuffer) => void = null;

	constructor(RTCPeerConnectionConstructor: typeof RTCPeerConnection) {
		this.rtc = new RTCPeerConnectionConstructor(peerConnectionConfig);

		this.rtc.onicecandidate = (ev) => this.gotIceCandidate(ev.candidate);
		this.rtc.ondatachannel = (ev) => {
			let channel = ev.channel;
			this.initDataChannel(channel);
		};
	}

	async createOffer() {
		let channel = this.rtc.createDataChannel('main', {
			ordered: false,
			maxRetransmits: 0
		});
		this.initDataChannel(channel);

		let offer = await this.rtc.createOffer();
		this.createdDescription(offer);
	}

	abstract gotIceCandidate(candidate: RTCIceCandidate): void;

	async createdDescription(description: RTCSessionDescriptionInit) {
		await this.rtc.setLocalDescription(description);
	}

	async gotIceFromServer(candidate: RTCIceCandidate) {
		if (!candidate.candidate) return; // "Expect line: candidate:<candidate-str>" bruh firefox moment
		//if (this.rtc.signalingState === 'closed') return;
		this.rtc.addIceCandidate(candidate);
	}

	async gotSdpFromServer(description: RTCSessionDescription) {
		//if (this.rtc.signalingState === 'closed') return;
		await this.rtc.setRemoteDescription(description);

		if (description.type === 'offer') {
			let answer = await this.rtc.createAnswer();
			this.createdDescription(answer);
		}
	}

	initDataChannel(channel: RTCDataChannel) {
		this.dataChannel = channel;
		this.dataChannel.binaryType = 'arraybuffer';

		this.dataChannel.onmessage = async (ev) => {
			this.receive?.(ev.data);
		};
		this.dataChannel.onopen = () => {
			console.log("DC open! 🎉");
		};
	}

	send(data: ArrayBuffer) {
		if (this.canSend()) this.dataChannel.send(data);
	}

	canSend() {
		return this.dataChannel?.readyState === 'open';
	}

	getStatus() {
		// todo is this suffish
		return this.canSend() ? 'connected' as const : 'connecting' as const;
	}

	close() {
		this.rtc.close();
	}
}