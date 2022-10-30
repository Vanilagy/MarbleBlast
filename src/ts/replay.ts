import { Level, TimeState, PHYSICS_TICK_RATE } from "./level";
import { PowerUp } from "./shapes/power_up";
import { Shape } from "./shape";
import { Trigger } from "./triggers/trigger";
import { Util } from "./util";
import { TrapDoor } from "./shapes/trap_door";
import { LandMine } from "./shapes/land_mine";
import { executeOnWorker } from "./worker";
import { PushButton } from "./shapes/push_button";
import { Mission } from "./mission";
import { Interior } from "./interior";
import { Nuke } from "./shapes/nuke";
import { Vector3 } from "./math/vector3";
import { Quaternion } from "./math/quaternion";

/** Stores everything necessary for a correct replay of a playthrough. Instead of relying on replaying player inputs, the replay simply stores all necessary state. */
export class Replay {
	level: Level;
	missionPath: string;
	version = 5;
	mode: 'record' | 'playback' = 'record';
	/** If writing to the replay is still permitted. */
	canStore = true;
	/** Replays get invalidated if they don't end in a successful finish. */
	isInvalid = false;
	/** The timestamp at the moment of saving (serializing) the replay. */
	timestamp: number;

	/** The position of the marble at each physics tick. */
	marblePositions: Vector3[] = [];
	/** The orientation of the marble at each physics tick. */
	marbleOrientations: Quaternion[] = [];
	/** The linear velocity of the marble at each physics tick. */
	marbleLinearVelocities: Vector3[] = [];
	/** The angular velocity of the marble at each physics tick. */
	marbleAngularVelocities: Vector3[] = [];
	/** Stores the times the marble was inside a shape/trigger. */
	marbleInside: {
		tickIndex: number,
		id: number
	}[] = [];
	/** Stores the times the marble entered a shape/trigger. */
	marbleEnter: {
		tickIndex: number,
		id: number
	}[] = [];
	/** Stores the times the marble left a shape/trigger. */
	marbleLeave: {
		tickIndex: number,
		id: number
	}[] = [];
	/** Stores the times the marble collided with a shape. */
	marbleContact: {
		tickIndex: number,
		id: number
	}[] = [];
	/** Stores power-up usage. */
	uses: {
		tickIndex: number,
		id: number
	}[] = [];
	/** Stores blast usage. */
	blasts: {
		tickIndex: number
	}[] = [];
	/** Camera orientation for each physics tick. */
	cameraOrientations: {
		yaw: number,
		pitch: number
	}[] = [];
	/** How much to revert time for each time travel. */
	timeTravelTimeToRevert = new Map<number, number>();
	/** When the finish area was hit. */
	touchFinishTickIndices: number[] = [];
	finishTime: TimeState = null;
	/** In order to replay trapdoors correctly, their completion state upon attempt start must be reconstructed properly. */
	trapdoorStartValues: {
		id: number,
		lastContactTime: number,
		lastDirection: number,
		lastCompletion: number
	}[] = [];
	/** In order to replay mines correctly, their visibility state upon attempt start must be reconstructed properly. */
	landmineStartValues: {
		id: number,
		disappearTime: number
	}[] = [];
	/** In order to replay push buttons correctly, their completion state upon attempt start must be reconstructed properly. */
	pushButtonStartValues: {
		id: number,
		lastContactTime: number
	}[] = [];
	/** In order to replay nukes correctly, their visibility state upon attempt start must be reconstructed properly. */
	nukeStartValues: {
		id: number,
		disappearTime: number
	}[] = [];
	/** The timeSinceLoad at the start of the play. */
	timeSinceLoad: number;
	/** The gain of the rolling sound for each physics tick. */
	rollingSoundGain: number[] = [];
	/** The playback rate of the rolling sound for each physics tick. */
	rollingSoundPlaybackRate: number[] = [];
	/** The gain of the sliding sound for each physics tick. */
	slidingSoundGain: number[] = [];
	/** When the jump sound played. */
	jumpSoundTimes: number[] = [];
	/** When bounces happened. */
	bounceTimes: {
		tickIndex: number,
		volume: number,
		showParticles: boolean
	}[] = [];
	/** Which powerups were selected at random. */
	randomPowerUpChoices = new Map<number, number[]>();
	checkpointRespawns: number[] = [];

	/** The current tick index to write to / read from. */
	get currentTickIndex() {
		return Math.max(this.level.timeState.tickIndex, 0);
	}

	currentJumpSoundTime = 0;
	currentBounceTime = 0;

	constructor(level?: Level) {
		if (level) {
			this.level = level;
			this.missionPath = level.mission.path;
		}
	}

	/** Inits the replay's values. */
	init() {
		if (this.mode === 'record') {
			// Reset all values

			this.canStore = true;
			this.isInvalid = false;
			this.marblePositions.length = 0;
			this.marbleOrientations.length = 0;
			this.marbleLinearVelocities.length = 0;
			this.marbleAngularVelocities.length = 0;
			this.marbleInside.length = 0;
			this.marbleEnter.length = 0;
			this.marbleLeave.length = 0;
			this.marbleContact.length = 0;
			this.uses.length = 0;
			this.blasts.length = 0;
			this.cameraOrientations.length = 0;
			this.timeTravelTimeToRevert.clear();
			this.touchFinishTickIndices.length = 0;
			this.finishTime = null;
			this.trapdoorStartValues.length = 0;
			this.landmineStartValues.length = 0;
			this.pushButtonStartValues.length = 0;
			this.nukeStartValues.length = 0;
			this.rollingSoundGain.length = 0;
			this.rollingSoundPlaybackRate.length = 0;
			this.slidingSoundGain.length = 0;
			this.jumpSoundTimes.length = 0;
			this.bounceTimes.length = 0;
			this.randomPowerUpChoices.clear();
			this.checkpointRespawns.length = 0;

			// Remember trapdoor, mine and push button states
			for (let shape of this.level.shapes) {
				if (shape instanceof TrapDoor) {
					this.trapdoorStartValues.push({
						id: shape.id,
						lastContactTime: shape.lastContactTime,
						lastDirection: shape.lastDirection,
						lastCompletion: shape.lastCompletion
					});
				} else if (shape instanceof LandMine) {
					this.landmineStartValues.push({
						id: shape.id,
						disappearTime: shape.disappearTime
					});
				} else if (shape instanceof PushButton) {
					this.pushButtonStartValues.push({
						id: shape.id,
						lastContactTime: shape.lastContactTime
					});
				} else if (shape instanceof Nuke) {
					this.nukeStartValues.push({
						id: shape.id,
						disappearTime: shape.disappearTime
					});
				}
			}

			this.timeSinceLoad = this.level.timeState.timeSinceLoad;
		} else {
			// Reconstruct trapdoor, mine and push button states
			for (let shape of this.level.shapes) {
				if (shape instanceof TrapDoor) {
					let startValues = this.trapdoorStartValues.find(x => x.id === shape.id);
					if (!startValues) continue;

					// This is quite stupid. lastContactTime, of course, is never null, but it might be -Infinity, in which case JSON.stringify turns it to null. We're catching that here.
					if (startValues.lastContactTime === null) startValues.lastContactTime = -Infinity;
					shape.lastContactTime = startValues.lastContactTime - this.timeSinceLoad + this.level.timeState.timeSinceLoad;
					shape.lastDirection = startValues.lastDirection;
					shape.lastCompletion = startValues.lastCompletion;
				} else if (shape instanceof LandMine) {
					let startValues = this.landmineStartValues.find(x => x.id === shape.id);
					if (!startValues) continue;

					if (startValues.disappearTime === null) startValues.disappearTime = -Infinity;
					shape.disappearTime = startValues.disappearTime - this.timeSinceLoad + this.level.timeState.timeSinceLoad;
				} else if (shape instanceof PushButton) {
					let startValues = this.pushButtonStartValues.find(x => x.id === shape.id);
					if (!startValues) continue;

					if (startValues.lastContactTime === null) startValues.lastContactTime = -Infinity;
					shape.lastContactTime = startValues.lastContactTime - this.timeSinceLoad + this.level.timeState.timeSinceLoad;
				} else if (shape instanceof Nuke) {
					let startValues = this.nukeStartValues.find(x => x.id === shape.id);
					if (!startValues) continue;

					if (startValues.disappearTime === null) startValues.disappearTime = -Infinity;
					shape.disappearTime = startValues.disappearTime - this.timeSinceLoad + this.level.timeState.timeSinceLoad;
				}
			}
		}
	}

	/** Writes current data to the replay. */
	record() {
		if (this.mode === 'playback' || !this.canStore) return;

		let marble = this.level.marble;

		this.marblePositions.push(marble.body.position.clone());
		this.marbleOrientations.push(marble.body.orientation.clone());
		this.marbleLinearVelocities.push(marble.body.linearVelocity.clone());
		this.marbleAngularVelocities.push(marble.body.angularVelocity.clone());
		this.cameraOrientations.push({ yaw: this.level.yaw, pitch: this.level.pitch });

		// Store sound state in the replay too
		let rollingSound = (marble.rollingMegaMarbleSound?.playing ? marble.rollingMegaMarbleSound : marble.rollingSound);
		this.rollingSoundGain.push(rollingSound.gain.gain.value);
		this.rollingSoundPlaybackRate.push((rollingSound.node as AudioBufferSourceNode).playbackRate.value);
		this.slidingSoundGain.push(marble.slidingSound.gain.gain.value);

		if (this.level.finishTime && this.finishTime === null) this.finishTime = Util.jsonClone(this.level.finishTime);

		// Check if the replay is excessively long. If it is, stop it to prevent a memory error.
		if (this.marblePositions.length >= PHYSICS_TICK_RATE * 60 * 60) {
			this.canStore = false;
			this.isInvalid = this.level.finishTime === null; // If the playthrough was finished, we don't consider the replay invalid.
		}
	}

	recordMarbleInside(object: Shape | Trigger) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.marbleInside.push({
			tickIndex: this.currentTickIndex,
			id: object.id
		});
	}

	recordMarbleEnter(object: Shape | Trigger) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.marbleEnter.push({
			tickIndex: this.currentTickIndex,
			id: object.id
		});
	}

	recordMarbleLeave(object: Shape | Trigger) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.marbleLeave.push({
			tickIndex: this.currentTickIndex,
			id: object.id
		});
	}

	recordMarbleContact(object: Shape | Interior) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.marbleContact.push({
			tickIndex: this.currentTickIndex,
			id: object.id
		});
	}

	recordUsePowerUp(powerUp: PowerUp) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.uses.push({
			tickIndex: this.currentTickIndex,
			id: powerUp.id
		});
	}

	recordUseBlast() {
		if (this.mode === 'playback' || !this.canStore) return;

		this.blasts.push({
			tickIndex: this.currentTickIndex
		});
	}

	recordTouchFinish() {
		if (this.mode === 'playback' || !this.canStore) return;
		this.touchFinishTickIndices.push(this.currentTickIndex);
	}

	recordCheckpointRespawn() {
		if (this.mode === 'playback' || !this.canStore) return;
		this.checkpointRespawns.push(this.currentTickIndex);
	}

	/** Apply the replay's stored state to the world. */
	playBack() {
		let i = this.currentTickIndex;
		if (i >= this.marblePositions.length) return; // Safety measure

		for (let obj of this.marbleInside) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.triggers.find(x => x.id === obj.id);
			object.onMarbleInside(1);
		}

		for (let obj of this.marbleEnter) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.triggers.find(x => x.id === obj.id);
			object.onMarbleEnter(1);
		}

		for (let obj of this.marbleLeave) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.triggers.find(x => x.id === obj.id);
			object.onMarbleLeave();
		}

		for (let obj of this.marbleContact) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.interiors.find(x => x.id === obj.id);
			object.onMarbleContact(null, 1000 / PHYSICS_TICK_RATE);
		}

		for (let use of this.uses) {
			if (use.tickIndex !== i) continue;

			let powerUp = this.level.shapes.find(x => x.id === use.id) as PowerUp;
			powerUp.use(0);
		}

		for (let blast of this.blasts) {
			if (blast.tickIndex !== i) continue;

			this.level.marble.useBlast();
		}

		for (let tickIndex of this.touchFinishTickIndices) if (tickIndex === i) this.level.touchFinish();
		for (let tickIndex of this.checkpointRespawns) if (tickIndex === i) this.level.loadCheckpointState();

		this.level.marble.body.position.copy(this.marblePositions[i]);
		this.level.marble.body.orientation.copy(this.marbleOrientations[i]);
		this.level.marble.body.linearVelocity.copy(this.marbleLinearVelocities[i]);
		this.level.marble.body.angularVelocity.copy(this.marbleAngularVelocities[i]);
		this.level.yaw = this.cameraOrientations[i].yaw;
		this.level.pitch = this.cameraOrientations[i].pitch;

		for (let j = this.currentJumpSoundTime; j < this.jumpSoundTimes.length; j++) {
			if (this.jumpSoundTimes[j] > i) break;
			if (this.jumpSoundTimes[j] === i) this.level.marble.playJumpSound();
		}
		for (let j = this.currentBounceTime; j < this.bounceTimes.length; j++) {
			if (this.bounceTimes[j].tickIndex > i) break;
			if (this.bounceTimes[j].tickIndex === i) {
				this.level.marble.playBounceSound(this.bounceTimes[j].volume);
				if (this.bounceTimes[j].showParticles) this.level.marble.showBounceParticles();
			}
		}
		this.level.marble.rollingSound.gain.gain.setValueAtTime(this.rollingSoundGain[i], this.level.audio.currentTime);
		this.level.marble.rollingMegaMarbleSound?.gain.gain.setValueAtTime(this.rollingSoundGain[i], this.level.audio.currentTime);
		this.level.marble.rollingSound.setPlaybackRate(this.rollingSoundPlaybackRate[i]);
		this.level.marble.rollingMegaMarbleSound?.setPlaybackRate(this.rollingSoundPlaybackRate[i]);
		this.level.marble.slidingSound.gain.gain.setValueAtTime(this.slidingSoundGain[i], this.level.audio.currentTime);
	}

	isPlaybackComplete() {
		return this.currentTickIndex === this.marblePositions.length - 1;
	}

	/** Converts the replay's data into a compressed array buffer. */
	async serialize() {
		let cameraOrientations = new Float32Array(this.cameraOrientations.length * 2);
		for (let i = 0; i < this.cameraOrientations.length; i++) {
			cameraOrientations[i * 2 + 0] = this.cameraOrientations[i].yaw;
			cameraOrientations[i * 2 + 1] = this.cameraOrientations[i].pitch;
		}

		// First, create a more compact object by utilizing typed arrays.
		let serialized: SerializedReplay = {
			version: this.version,
			timestamp: Date.now(),
			missionPath: this.missionPath,
			marblePositions: Util.arrayBufferToString(Replay.vec3sToBuffer(this.marblePositions).buffer),
			marbleOrientations: Util.arrayBufferToString(Replay.quatsToBuffer(this.marbleOrientations).buffer),
			marbleLinearVelocities: Util.arrayBufferToString(Replay.vec3sToBuffer(this.marbleLinearVelocities).buffer),
			marbleAngularVelocities: Util.arrayBufferToString(Replay.vec3sToBuffer(this.marbleAngularVelocities).buffer),
			marbleInside: this.marbleInside,
			marbleEnter: this.marbleEnter,
			marbleLeave: this.marbleLeave,
			marbleContact: this.marbleContact,
			uses: this.uses,
			blasts: this.blasts,
			cameraOrientations: Util.arrayBufferToString(cameraOrientations.buffer),
			timeTravelTimeToRevert: [...this.timeTravelTimeToRevert.entries()],
			touchFinishTickIndices: this.touchFinishTickIndices,
			finishTime: this.finishTime,
			trapdoorStartValues: this.trapdoorStartValues,
			landmineStartValues: this.landmineStartValues,
			pushButtonStartValues: this.pushButtonStartValues,
			nukeStartValues: this.nukeStartValues,
			timeSinceLoad: this.timeSinceLoad,
			rollingSoundGain: Util.arrayBufferToString(new Float32Array(this.rollingSoundGain).buffer),
			rollingSoundPlaybackRate: Util.arrayBufferToString(new Float32Array(this.rollingSoundPlaybackRate).buffer),
			slidingSoundGain: Util.arrayBufferToString(new Float32Array(this.slidingSoundGain).buffer),
			jumpSoundTimes: this.jumpSoundTimes,
			bounceTimes: this.bounceTimes,
			randomPowerUpChoices: [...this.randomPowerUpChoices.entries()],
			checkpointRespawns: this.checkpointRespawns
		};

		// Then compress the whole th ing. As this step is the most expensive, run it in another thread.
		let compressed = await executeOnWorker('compress', JSON.stringify(serialized)) as ArrayBuffer;
		return compressed;
	}

	/** Reconstructs a replay from its compressed array buffer representation. */
	static fromSerialized(buf: ArrayBuffer) {
		let replay = new Replay();
		let string = pako.inflate(new Uint8Array(buf), { to: 'string' });
		let serialized = JSON.parse(string) as SerializedReplay;
		let version = serialized.version ?? 0;

		replay.version = version;
		replay.missionPath = (version >= 1)? serialized.missionPath : null;
		replay.timestamp = (version >= 1)? serialized.timestamp : 0;

		replay.marblePositions = Replay.bufferToVec3s(new Float32Array(Util.stringToArrayBuffer(serialized.marblePositions)));
		replay.marbleOrientations = Replay.bufferToQuats(new Float32Array(Util.stringToArrayBuffer(serialized.marbleOrientations)));
		replay.marbleLinearVelocities = Replay.bufferToVec3s(new Float32Array(Util.stringToArrayBuffer(serialized.marbleLinearVelocities)));
		replay.marbleAngularVelocities = Replay.bufferToVec3s(new Float32Array(Util.stringToArrayBuffer(serialized.marbleAngularVelocities)));
		replay.marbleInside = serialized.marbleInside;
		replay.marbleEnter = serialized.marbleEnter;
		replay.marbleLeave = serialized.marbleLeave ?? []; // Might not be there in older versions
		replay.marbleContact = serialized.marbleContact;
		replay.uses = serialized.uses;
		replay.blasts = serialized.blasts ?? [];

		let cameraOrientations: {
			yaw: number,
			pitch: number
		}[] = [];
		let cameraOrientationsBuffer = new Float32Array(Util.stringToArrayBuffer(serialized.cameraOrientations));
		for (let i = 0; i < cameraOrientationsBuffer.length/2; i++) {
			cameraOrientations.push({
				yaw: cameraOrientationsBuffer[i * 2 + 0],
				pitch: cameraOrientationsBuffer[i * 2 + 1]
			});
		}
		replay.cameraOrientations = cameraOrientations;

		replay.timeTravelTimeToRevert = serialized.timeTravelTimeToRevert.reduce((prev, next) => (prev.set(next[0], next[1]), prev), new Map<number, number>());
		replay.touchFinishTickIndices = serialized.touchFinishTickIndices;
		replay.finishTime = serialized.finishTime;
		replay.trapdoorStartValues = serialized.trapdoorStartValues;
		replay.landmineStartValues = serialized.landmineStartValues;
		replay.pushButtonStartValues = serialized.pushButtonStartValues ?? []; // Might not be there in older versions
		replay.nukeStartValues = serialized.nukeStartValues ?? [];
		replay.timeSinceLoad = serialized.timeSinceLoad;
		replay.rollingSoundGain = [...new Float32Array(Util.stringToArrayBuffer(serialized.rollingSoundGain))];
		replay.rollingSoundPlaybackRate = [...new Float32Array(Util.stringToArrayBuffer(serialized.rollingSoundPlaybackRate))];
		replay.slidingSoundGain = [...new Float32Array(Util.stringToArrayBuffer(serialized.slidingSoundGain))];
		replay.jumpSoundTimes = serialized.jumpSoundTimes;
		replay.bounceTimes = serialized.bounceTimes;
		replay.randomPowerUpChoices = (serialized.randomPowerUpChoices ?? []).reduce((prev, next) => (prev.set(next[0], next[1]), prev), new Map<number, number[]>());
		replay.checkpointRespawns = serialized.checkpointRespawns ?? [];

		return replay;
	}

	static vec3sToBuffer(arr: Vector3[]) {
		let buffer = new Float32Array(arr.length * 3);
		for (let i = 0; i < arr.length; i++) {
			buffer[i * 3 + 0] = arr[i].x;
			buffer[i * 3 + 1] = arr[i].y;
			buffer[i * 3 + 2] = arr[i].z;
		}

		return buffer;
	}

	static quatsToBuffer(arr: Quaternion[]) {
		let buffer = new Float32Array(arr.length * 4);
		for (let i = 0; i < arr.length; i++) {
			buffer[i * 4 + 0] = arr[i].x;
			buffer[i * 4 + 1] = arr[i].y;
			buffer[i * 4 + 2] = arr[i].z;
			buffer[i * 4 + 3] = arr[i].w;
		}

		return buffer;
	}

	static bufferToVec3s(buf: Float32Array) {
		let vecs: Vector3[] = [];

		for (let i = 0; i < buf.length / 3; i++) {
			let vec = new Vector3(buf[i * 3 + 0], buf[i * 3 + 1], buf[i * 3 + 2]);
			vecs.push(vec);
		}

		return vecs;
	}

	static bufferToQuats(buf: Float32Array) {
		let quats: Quaternion[] = [];

		for (let i = 0; i < buf.length / 4; i++) {
			let quat = new Quaternion(buf[i * 4 + 0], buf[i * 4 + 1], buf[i * 4 + 2], buf[i * 4 + 3]);
			quats.push(quat);
		}

		return quats;
	}

	/** Downloads a replay as a .wrec file. */
	static async download(replayData: ArrayBuffer, mission: Mission, normalize = true, unfinished = false) {
		if (normalize) replayData = await this.maybeUpdateReplay(replayData, mission.path); // Normalize the replay first

		// Create the blob and download it
		let blob = new Blob([replayData], {
			type: 'application/octet-stream'
		});
		let url = URL.createObjectURL(blob);

		let filename = Util.removeSpecialChars(mission.title.toLowerCase().split(' ').map(x => Util.uppercaseFirstLetter(x)).join(''));
		filename += '-';
		for (let i = 0; i < 6; i++) filename += '0123456789abcdef'[Math.floor(Math.random() * 16)]; // Add a random hex string to the end
		if (unfinished) filename += 'u'; // Clearly mark the replay as being unfinished
		filename += '.wrec';

		Util.download(url, filename);
		URL.revokeObjectURL(url);
	}

	/** Makes sure a replay fits some requirements. */
	static async maybeUpdateReplay(replayData: ArrayBuffer, missionPath: string) {
		let uncompressed = pako.inflate(new Uint8Array(replayData), { to: 'string' });

		// This is a bit unfortunate, but we'd like to bundle the mission path with the replay, but the first replay version didn't include it. So we need to check if the replay actually includes the mission path, which we can check by checking if it includes the "version" field. We then upgrade the replay to verion 1.
		if (!uncompressed.includes('"version"')) {
			let json = JSON.parse(uncompressed) as SerializedReplay;
			// Upgrade to version 1
			json.missionPath = missionPath;
			json.timestamp = 0;
			json.version = 1;

			let compressed = await executeOnWorker('compress', JSON.stringify(json)) as ArrayBuffer;
			replayData = compressed;
		}

		return replayData;
	}
}

export interface SerializedReplay {
	/** The version of the replay, used for compatibility. */
	version: number,
	missionPath: string,
	timestamp: number,

	marblePositions: string;
	marbleOrientations: string;
	marbleLinearVelocities: string;
	marbleAngularVelocities: string;
	marbleInside: {
		tickIndex: number,
		id: number
	}[];
	marbleEnter: {
		tickIndex: number,
		id: number
	}[];
	marbleLeave: {
		tickIndex: number,
		id: number
	}[];
	marbleContact: {
		tickIndex: number,
		id: number
	}[];
	uses: {
		tickIndex: number,
		id: number
	}[];
	blasts: {
		tickIndex: number
	}[];
	cameraOrientations: string;
	timeTravelTimeToRevert: [number, number][]
	touchFinishTickIndices: number[];
	finishTime: TimeState;
	trapdoorStartValues: {
		id: number,
		lastContactTime: number,
		lastDirection: number,
		lastCompletion: number
	}[];
	landmineStartValues: {
		id: number,
		disappearTime: number
	}[];
	pushButtonStartValues: {
		id: number,
		lastContactTime: number
	}[];
	nukeStartValues: {
		id: number,
		disappearTime: number
	}[];
	timeSinceLoad: number;
	rollingSoundGain: string;
	rollingSoundPlaybackRate: string;
	slidingSoundGain: string;
	jumpSoundTimes: number[];
	bounceTimes: {
		tickIndex: number,
		volume: number,
		showParticles: boolean
	}[];
	randomPowerUpChoices: [number, number[]][],
	checkpointRespawns: number[]
}