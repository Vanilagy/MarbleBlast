import { Socket } from "../../../shared/socket";
import { RTCConnection } from "../../../shared/rtc_connection";
import { state } from "../state";

export let gameServers: GameServer[] = [];
const TICK_FREQUENCY = 60;

class GameServerRTCConnection extends RTCConnection {
	gameServerId: string;

	constructor(gameServerId: string) {
		super(RTCPeerConnection);

		this.gameServerId = gameServerId;
	}

	gotIceCandidate(candidate: RTCIceCandidate) {
		if (!candidate) return;

		Socket.send('rtcIce', {
			ice: candidate,
			gameServerId: this.gameServerId
		});
	}

	async createdDescription(description: RTCSessionDescriptionInit) {
		await super.createdDescription(description);

		Socket.send('rtcSdp', {
			sdp: this.rtc.localDescription,
			gameServerId: this.gameServerId
		});
	}
}

export class GameServer {
	id: string;
	connection: GameServerRTCConnection;

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
			gameServers.find(x => x.id === data.gameServerId)?.connection.gotIceFromServer(new RTCIceCandidate(data.ice));
		});

		Socket.on('rtcSdp', data => {
			gameServers.find(x => x.id === data.gameServerId)?.connection.gotSdpFromServer(new RTCSessionDescription(data.sdp));
		});

		setInterval(() => {
			for (let gs of gameServers) gs.connection?.tick();
		}, 1000 / TICK_FREQUENCY);
	}

	constructor(id: string) {
		this.id = id;
	}

	async connect() {
		this.connection = new GameServerRTCConnection(this.id);
		this.connection.createOffer();

		this.connection.on('stateUpdate', data => {
			state.level?.onStateUpdate(data);
		});
		this.connection.on('timeState', data => {

		});
	}
}