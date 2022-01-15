import NodeWebSocket from 'ws';
import { Socket } from '../../shared/socket';
import { RTCPeerConnection as WRTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'wrtc';
import { peerConnectionConfig } from '../../shared/rtc';

const ID = 'EU-1';
const KEY = 'I love cocks';
const URL = `ws://localhost:8080/register-gameserver?id=${encodeURIComponent(ID)}&key=${encodeURIComponent(KEY)}`;

console.log("Game server started with id: " + ID);

Socket.init(URL, NodeWebSocket as any);

Socket.on('rtcIceGameServer', data => {
	let connection = connections.find(x => x.sessionId === data.sessionId);
	if (!connection) {
		connection = new Connection(data.sessionId);
		connections.push(connection);
	}

	connection.gotIceFromServer(new RTCIceCandidate(data.ice));
});

Socket.on('rtcSdpGameServer', data => {
	let connection = connections.find(x => x.sessionId === data.sessionId);
	if (!connection) {
		connection = new Connection(data.sessionId);
		connections.push(connection);
	}

	connection.gotSdpFromServer(new RTCSessionDescription(data.sdp));
});

let connections: Connection[] = [];

class Connection {
	rtc: RTCPeerConnection;
	sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;

		this.rtc = new WRTCPeerConnection(peerConnectionConfig);
		this.rtc.onicecandidate = (ev) => this.gotIceCandidate(ev.candidate);

		this.rtc.ondatachannel = (ev) => {
			let channel = ev.channel;
			channel.binaryType = 'arraybuffer';

			channel.onmessage = (ev) => {
				console.log(ev.data);

				channel.send('penisasdas');
			};
		};
	}

	async gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIceGameServer', {
			ice: candidate,
			sessionId: this.sessionId
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await this.rtc.setLocalDescription(description);

		Socket.send('rtcSdpGameServer', {
			sdp: this.rtc.localDescription,
			sessionId: this.sessionId
		});
	}

	async gotIceFromServer(candidate: RTCIceCandidate) {
		this.rtc.addIceCandidate(candidate);
	}

	async gotSdpFromServer(description: RTCSessionDescription) {
		await this.rtc.setRemoteDescription(description);

		if (description.type === 'offer') {
			let answer = await this.rtc.createAnswer();
			this.createdDescription(answer);
		}
	}
}