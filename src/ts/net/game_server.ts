import { Socket } from "../../../shared/socket";
import { peerConnectionConfig } from "../../../shared/rtc";

export let gameServers: GameServer[] = [];

export class GameServer {
	id: string;
	rtc: RTCPeerConnection;
	dataChannel: RTCDataChannel;

	static init() {
		Socket.on('updateGameServerList', list => {
			for (let gs of list) {
				let exists = gameServers.some(x => x.id === gs.id);
				if (exists) continue;

				let gameServer = new GameServer(gs.id);
				gameServers.push(gameServer);
			}

			console.log(gameServers);

			gameServers[0]?.connect();
		});

		Socket.on('rtcIce', data => {
			gameServers.find(x => x.id === data.gameServerId)?.gotIceFromServer(new RTCIceCandidate(data.ice));
		});

		Socket.on('rtcSdp', data => {
			gameServers.find(x => x.id === data.gameServerId)?.gotSdpFromServer(new RTCSessionDescription(data.sdp));
		});
	}

	constructor(id: string) {
		this.id = id;
	}

	async connect() {
		this.rtc = new RTCPeerConnection(peerConnectionConfig);
		this.dataChannel = this.rtc.createDataChannel('main');
		this.dataChannel.binaryType = 'arraybuffer';

		this.rtc.onconnectionstatechange = () => {
			let state = this.rtc.connectionState;

			if (state === 'disconnected' || state === 'failed') {
				console.log("Attempting to reconnect RTC...");
				this.connect(); // Attempt to reconnect TODO does this even work haha
			} else if (state === 'connected') {
				console.log("RTC connected! 🎉");
			}
		};

		this.dataChannel.onopen = () => {
			console.log("DC OPEN");
		};

		this.rtc.onicecandidate = (ev) => this.gotIceCandidate(ev.candidate);

		let offer = await this.rtc.createOffer();
		this.createdDescription(offer);
	}

	async gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIce', {
			ice: candidate,
			gameServerId: this.id
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await this.rtc.setLocalDescription(description);

		Socket.send('rtcSdp', {
			sdp: this.rtc.localDescription,
			gameServerId: this.id
		});
	}

	async gotIceFromServer(candidate: RTCIceCandidate) {
		this.rtc.addIceCandidate(candidate);
	}

	async gotSdpFromServer(description: RTCSessionDescription) {
		await this.rtc.setRemoteDescription(description);

		if (description.type === 'offer') {
			// Actually not sure if this ever kicks since the server never initiates the thing
			let answer = await this.rtc.createAnswer();
			this.createdDescription(answer);
		}
	}
}