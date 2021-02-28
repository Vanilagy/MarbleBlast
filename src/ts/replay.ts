import { Level, TimeState, PHYSICS_TICK_RATE } from "./level";
import OIMO from "./declarations/oimo";
import { PowerUp } from "./shapes/power_up";
import { Shape } from "./shape";
import { Trigger } from "./triggers/trigger";
import { Util } from "./util";
import { TrapDoor } from "./shapes/trap_door";
import { LandMine } from "./shapes/land_mine";
import { executeOnWorker } from "./worker";
import { PushButton } from "./shapes/push_button";
import { Mission } from "./mission";

/** Stores everything necessary for a correct replay of a playthrough. Instead of relying on replaying player inputs, the replay simply stores all necessary state. */
export class Replay {
	level: Level;
	missionPath: string;
	mode: 'record' | 'playback' = 'record';
	/** If writing to the replay is still permitted. */
	canStore = true;
	/** Replays get invalidated if they don't end in a successful finish. */
	isInvalid = false;
	/** The timestamp at the moment of saving (serializing) the replay. */
	timestamp: number;

	/** The position of the marble at each physics tick. */
	marblePositions: OIMO.Vec3[] = [];
	/** The orientation of the marble at each physics tick. */
	marbleOrientations: OIMO.Quat[] = [];
	/** The linear velocity of the marble at each physics tick. */
	marbleLinearVelocities: OIMO.Vec3[] = [];
	/** The angular velocity of the marble at each physics tick. */
	marbleAngularVelocities: OIMO.Vec3[] = [];
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
	/** Stores the times the marble collidede with a shape. */
	marbleContact: {
		tickIndex: number,
		id: number
	}[] = [];
	/** Stores power-up usage. */
	uses: {
		tickIndex: number,
		id: number
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

	/** The current tick index to write to / read from. */
	currentTickIndex = 0;
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
		this.currentTickIndex = 0;

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
			this.cameraOrientations.length = 0;
			this.timeTravelTimeToRevert.clear();
			this.touchFinishTickIndices.length = 0;
			this.finishTime = null;
			this.trapdoorStartValues.length = 0;
			this.landmineStartValues.length = 0;
			this.pushButtonStartValues.length = 0;
			this.rollingSoundGain.length = 0;
			this.rollingSoundPlaybackRate.length = 0;
			this.slidingSoundGain.length = 0;
			this.jumpSoundTimes.length = 0;
			this.bounceTimes.length = 0;

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
				}
			}
		}
	}

	/** Writes current data to the replay. */
	record() {
		if (this.mode === 'playback' || !this.canStore) return;

		this.marblePositions.push(this.level.marble.body.getPosition());
		this.marbleOrientations.push(this.level.marble.body.getOrientation());
		this.marbleLinearVelocities.push(this.level.marble.body.getLinearVelocity());
		this.marbleAngularVelocities.push(this.level.marble.body.getAngularVelocity());
		this.cameraOrientations.push({ yaw: this.level.yaw, pitch: this.level.pitch });

		if (this.level.finishTime && this.finishTime === null) this.finishTime = Util.jsonClone(this.level.finishTime);

		this.currentTickIndex++;

		// Check if the replay is excessively long. If it is, stop it to prevent a memory error.
		if (this.marblePositions.length >= PHYSICS_TICK_RATE * 60 * 30) {
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

	recordMarbleContact(shape: Shape) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.marbleContact.push({
			tickIndex: this.currentTickIndex,
			id: shape.id
		});
	}

	recordUsePowerUp(powerUp: PowerUp) {
		if (this.mode === 'playback' || !this.canStore) return;

		this.uses.push({
			tickIndex: this.currentTickIndex,
			id: powerUp.id
		});
	}

	recordTouchFinish() {
		if (this.mode === 'playback' || !this.canStore) return;
		this.touchFinishTickIndices.push(this.currentTickIndex);
	}

	/** Apply the replay's stored state to the world. */
	playback() {
		let i = this.currentTickIndex;

		for (let obj of this.marbleInside) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.triggers.find(x => x.id === obj.id);
			object.onMarbleInside(this.level.timeState);
		}

		for (let obj of this.marbleEnter) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.triggers.find(x => x.id === obj.id);
			object.onMarbleEnter(this.level.timeState);
		}

		for (let obj of this.marbleLeave) {
			if (obj.tickIndex !== i) continue;

			let object = this.level.shapes.find(x => x.id === obj.id) ?? this.level.triggers.find(x => x.id === obj.id);
			object.onMarbleLeave(this.level.timeState);
		}

		for (let obj of this.marbleContact) {
			if (obj.tickIndex !== i) continue;

			let shape = this.level.shapes.find(x => x.id === obj.id);
			shape.onMarbleContact(this.level.timeState, null);
		}

		for (let use of this.uses) {
			if (use.tickIndex !== i) continue;

			let powerUp = this.level.shapes.find(x => x.id === use.id) as PowerUp;
			powerUp.use(this.level.timeState);
		}

		for (let tickIndex of this.touchFinishTickIndices) if (tickIndex === i) this.level.touchFinish();

		this.level.marble.body.setPosition(this.marblePositions[i]);
		this.level.marble.body.setOrientation(this.marbleOrientations[i]);
		this.level.marble.body.setLinearVelocity(this.marbleLinearVelocities[i]);
		this.level.marble.body.setAngularVelocity(this.marbleAngularVelocities[i]);
		this.level.yaw = this.cameraOrientations[i].yaw;
		this.level.pitch = this.cameraOrientations[i].pitch;

		for (let i = this.currentJumpSoundTime; i < this.jumpSoundTimes.length; i++) {
			if (this.jumpSoundTimes[i] > this.currentTickIndex) break;
			if (this.jumpSoundTimes[i] === this.currentTickIndex) this.level.marble.playJumpSound();
		}
		for (let i = this.currentBounceTime; i < this.bounceTimes.length; i++) {
			if (this.bounceTimes[i].tickIndex > this.currentTickIndex) break;
			if (this.bounceTimes[i].tickIndex === this.currentTickIndex) {
				this.level.marble.playBounceSound(this.bounceTimes[i].volume);
				if (this.bounceTimes[i].showParticles) this.level.marble.showBounceParticles();
			}
		}
		this.level.marble.rollingSound.gain.gain.value = this.rollingSoundGain[i];
		this.level.marble.rollingSound.node.playbackRate.value = this.rollingSoundPlaybackRate[i];
		this.level.marble.slidingSound.gain.gain.value = this.slidingSoundGain[i];

		this.currentTickIndex = Math.min(this.marblePositions.length - 1, this.currentTickIndex + 1); // Make sure to stop at the last tick
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
			version: 2,
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
			cameraOrientations: Util.arrayBufferToString(cameraOrientations.buffer),
			timeTravelTimeToRevert: [...this.timeTravelTimeToRevert.entries()],
			touchFinishTickIndices: this.touchFinishTickIndices,
			finishTime: this.finishTime,
			trapdoorStartValues: this.trapdoorStartValues,
			landmineStartValues: this.landmineStartValues,
			pushButtonStartValues: this.pushButtonStartValues,
			timeSinceLoad: this.timeSinceLoad,
			rollingSoundGain: Util.arrayBufferToString(new Float32Array(this.rollingSoundGain).buffer),
			rollingSoundPlaybackRate: Util.arrayBufferToString(new Float32Array(this.rollingSoundPlaybackRate).buffer),
			slidingSoundGain: Util.arrayBufferToString(new Float32Array(this.slidingSoundGain).buffer),
			jumpSoundTimes: this.jumpSoundTimes,
			bounceTimes: this.bounceTimes
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
		replay.timeSinceLoad = serialized.timeSinceLoad;
		replay.rollingSoundGain = [...new Float32Array(Util.stringToArrayBuffer(serialized.rollingSoundGain))];
		replay.rollingSoundPlaybackRate = [...new Float32Array(Util.stringToArrayBuffer(serialized.rollingSoundPlaybackRate))];
		replay.slidingSoundGain = [...new Float32Array(Util.stringToArrayBuffer(serialized.slidingSoundGain))];
		replay.jumpSoundTimes = serialized.jumpSoundTimes;
		replay.bounceTimes = serialized.bounceTimes;

		return replay;
	}

	static vec3sToBuffer(arr: OIMO.Vec3[]) {
		let buffer = new Float32Array(arr.length * 3);
		for (let i = 0; i < arr.length; i++) {
			buffer[i * 3 + 0] = arr[i].x;
			buffer[i * 3 + 1] = arr[i].y;
			buffer[i * 3 + 2] = arr[i].z;
		}

		return buffer;
	}

	static quatsToBuffer(arr: OIMO.Quat[]) {
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
		let vecs: OIMO.Vec3[] = [];

		for (let i = 0; i < buf.length / 3; i++) {
			let vec = new OIMO.Vec3(buf[i * 3 + 0], buf[i * 3 + 1], buf[i * 3 + 2]);
			vecs.push(vec);
		}
		
		return vecs;
	}

	static bufferToQuats(buf: Float32Array) {
		let quats: OIMO.Quat[] = [];

		for (let i = 0; i < buf.length / 4; i++) {
			let quat = new OIMO.Quat(buf[i * 4 + 0], buf[i * 4 + 1], buf[i * 4 + 2], buf[i * 4 + 3]);
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
		for (let i = 0; i < 6; i++) filename += Math.floor(Math.random() * 10); // Add a random string of numbers to the end
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
}