import { Interior } from "./interior";
import { MissionElementSimGroup, MissionElementType, MissionElementPathedInterior, MissionElementPath, MisParser, MissionElementTrigger } from "../../../shared/mis_parser";
import { Util } from "../util";
import { MustChangeTrigger } from "./triggers/must_change_trigger";
import { AudioManager, AudioSource } from "../audio";
import { Matrix4 } from "../math/matrix4";
import { Vector3 } from "../math/vector3";
import { Quaternion } from "../math/quaternion";
import { Game } from "./game";
import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { Marble } from "./marble";
import { Collision } from "../physics/collision";
import { MisUtils } from "../parsing/mis_utils";

let v1 = new Vector3();
let m1 = new Matrix4();

interface MarkerData {
	msToNext: number,
	smoothingType: string,
	position: Vector3,
	rotation: Quaternion
}

type PathedInteriorState = EntityState & { entityType: 'pathedInterior' };

interface InternalPathedInteriorState {
	prevPosition: Vector3,
	currentPosition: Vector3
}

/** Represents a Torque 3D Pathed Interior moving along a set path. */
export class PathedInterior extends Interior {
	restartable = true;
	path: MissionElementPath;
	markerData: MarkerData[];
	simGroup: MissionElementSimGroup;
	element: MissionElementPathedInterior;
	triggers: MustChangeTrigger[] = [];
	hasCollision: boolean;
	/** Some pathed interiors emit a sound; this is for that. */
	soundSource: AudioSource;
	soundPosition: Vector3;

	/** The total duration of the path. */
	duration: number;
	/** The source time (internal) */
	currentTime = 0;
	/** The destination time (internal) */
	targetTime = 0;
	/** The start reference point in time (external) of interior interpolation */
	changeTime = 0;

	basePosition: Vector3;
	baseOrientation: Quaternion;
	baseScale: Vector3;
	prevPosition = new Vector3();
	currentPosition = new Vector3();

	allowSpecialMaterials = false; // Frictions don't work on pathed interiors

	/** Creates a PathedInterior from a sim group containing it and its path (and possible triggers). */
	static async createFromSimGroup(simGroup: MissionElementSimGroup, game: Game) {
		let interiorElement = simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior) as MissionElementPathedInterior;

		let { dif: difFile, path } = await game.mission.getDif(interiorElement.interiorresource);
		if (!difFile) return null;
		let pathedInterior = new PathedInterior(difFile, path, game, MisParser.parseNumber(interiorElement.interiorindex));
		pathedInterior.simGroup = simGroup;
		pathedInterior.element = interiorElement;

		game.interiors.push(pathedInterior);
		await Util.wait(10); // See shapes for the meaning of this hack
		await pathedInterior.init(interiorElement._id);

		return pathedInterior;
	}

	async init(id: number) {
		await super.init(id);
		this.body.passive = false; // We want to register marble collisions always

		// Pathed interiors ignore the normal position, rotation, scale and use the base- variants instead.
		this.basePosition = MisUtils.parseVector3(this.element.baseposition);
		this.baseOrientation = MisUtils.parseRotation(this.element.baserotation);
		this.baseScale = MisUtils.parseVector3(this.element.basescale);
		this.hasCollision = this.baseScale.x !== 0 && this.baseScale.y !== 0 && this.baseScale.z !== 0; // Don't want to add buggy geometry

		// Fix zero-volume interiors so they receive correct lighting
		if (this.baseScale.x === 0) this.baseScale.x = 0.0001;
		if (this.baseScale.y === 0) this.baseScale.y = 0.0001;
		if (this.baseScale.z === 0) this.baseScale.z = 0.0001;

		this.body.onBeforeIntegrate = this.onBeforeIntegrate.bind(this);
		this.body.orientation.copy(this.baseOrientation);

		// Add collision geometry
		for (let i = 0; i < this.detailLevel.convexHulls.length; i++) this.addConvexHull(i, this.baseScale);

		// Parse the markers
		this.path = this.simGroup.elements.find((element) => element._type === MissionElementType.Path) as MissionElementPath;
		this.markerData = this.path.markers.map(x => {
			return {
				msToNext: MisParser.parseNumber(x.mstonext),
				smoothingType: x.smoothingtype,
				position: MisUtils.parseVector3(x.position),
				rotation: MisUtils.parseRotation(x.rotation)
			};
		});
		if (MisParser.parseBoolean(this.path.isLooping)) this.markerData.push(this.markerData[0]); // In this case, we wrap around the marker list smoothly. Emulate this by copying the start to the end.
		this.computeDuration();

		// Add MustChangeTriggers if necessary
		let triggers = this.simGroup.elements.filter((element) => element._type === MissionElementType.Trigger) as MissionElementTrigger[];
		for (let triggerElement of triggers) {
			if (!triggerElement.targettime) continue; // Not a pathed interior trigger
			let trigger = new MustChangeTrigger(triggerElement, this);
			this.triggers.push(trigger);
		}

		// Create a sound effect if so specified
		if (this.element.datablock?.toLowerCase() === 'pathedmovingblock') {
			this.soundPosition = new Vector3(); // This position will be modified
			this.soundSource = AudioManager.createAudioSource('movingblockloop.wav', AudioManager.soundGain, this.soundPosition);
			this.soundSource.setLoop(true);

			await this.soundSource.promise;
		}

		this.reset();
	}

	async onLevelStart() {
		this.soundSource?.play();
	}

	/** Computes the total duration of the path. */
	computeDuration() {
		let total = 0;

		// Don't count the last marker
		for (let i = 0; i < this.markerData.length-1; i++) {
			total += this.markerData[i].msToNext;
		}

		this.duration = total;
	}

	setTargetTime(target: number) {
		let currentInternalTime = this.getInternalTime(this.game.state.time);
		this.currentTime = currentInternalTime; // Start where the interior currently is
		this.targetTime = target;
		this.changeTime = 1000 * this.game.state.time;

		this.stateNeedsStore = true;
	}

	/** Gets the internal time along the path. Is guaranteed to be in [0, duration]. */
	getInternalTime(externalTime: number) {
		externalTime *= 1000;

		if (this.targetTime < 0) {
			let direction = (this.targetTime === -1)? 1 : (this.targetTime === -2)? -1 : 0;
			return Util.adjustedMod(this.currentTime + (externalTime - this.changeTime) * direction, this.duration);
		} else {
			let dur = Math.abs(this.currentTime - this.targetTime);
			let completion = Util.clamp(dur? (externalTime - this.changeTime) / dur : 1, 0, 1);
			return Util.clamp(Util.lerp(this.currentTime, this.targetTime, completion), 0, this.duration);
		}
	}

	update() {
		this.body.position.copy(this.currentPosition); // Reset it back to where it should be (render loop might've moved it)

		let transform = this.getTransformAtTime(m1, this.getInternalTime(this.game.state.time));

		this.prevPosition.copy(this.currentPosition);
		this.currentPosition.setFromMatrixPosition(transform); // The orientation doesn't matter in that version of TGE, so we only need position
		this.internalStateNeedsStore = true;

		// Approximate the velocity numerically
		let velocity = v1.copy(this.currentPosition).sub(this.prevPosition).multiplyScalar(GAME_UPDATE_RATE);
		this.body.linearVelocity.copy(velocity);

		// Modify the sound effect position, if present
		if (!this.game.simulator.isReconciling) this.soundPosition?.copy(this.currentPosition).add(this.markerData[0]?.position ?? new Vector3());
	}

	onBeforeIntegrate() {
		this.body.position.copy(this.currentPosition);
		this.body.syncShapes();
	}

	/** Computes the transform of the interior at a point in time along the path. */
	getTransformAtTime(dst: Matrix4, time: number) {
		let m1 = this.markerData[0];
		let m2 = this.markerData[1];

		if (!m1) {
			// Incase there are no markers at all
			dst.compose(this.basePosition, this.baseOrientation, this.baseScale);
			return dst;
		}

		// Find the two markers in question
		let currentEndTime = m1.msToNext;
		let i = 2;
		while (currentEndTime < time && i < this.markerData.length) {
			m1 = m2;
			m2 = this.markerData[i++];

			currentEndTime += m1.msToNext;
		}

		if (!m2) m2 = m1;

		let m1Time = currentEndTime - m1.msToNext;
		let m2Time = currentEndTime;
		let duration = m2Time - m1Time;
		let position: Vector3;

		let completion = Util.clamp(duration? (time - m1Time) / duration : 1, 0, 1);
		if (m1.smoothingType === "Accelerate") {
			// A simple easing function
			completion = Math.sin(completion * Math.PI - (Math.PI / 2)) * 0.5 + 0.5;
		} else if (m1.smoothingType === "Spline") {
			// Smooth the path like it's a Catmull-Rom spline.
			let preStart = (i - 2) - 1;
			let postEnd = (i - 1) + 1;
			if (postEnd >= this.path.markers.length) postEnd = 0;
			if (preStart < 0) preStart = this.path.markers.length - 1;

			let p0 = this.markerData[preStart].position;
			let p1 = m1.position;
			let p2 = m2.position;
			let p3 = this.markerData[postEnd].position;

			position = v1;
			position.x = Util.catmullRom(completion, p0.x, p1.x, p2.x, p3.x);
			position.y = Util.catmullRom(completion, p0.y, p1.y, p2.y, p3.y);
			position.z = Util.catmullRom(completion, p0.z, p1.z, p2.z, p3.z);
		}

		if (!position) {
			let p1 = m1.position;
			let p2 = m2.position;
			position = v1.copy(p1).lerp(p2, completion);
		}

		// Offset by the position of the first marker
		let firstPosition = this.markerData[0].position;
		position.sub(firstPosition);

		position.add(this.basePosition); // Add the base position

		dst.compose(position, this.baseOrientation, this.baseScale);

		return dst;
	}

	onMarbleContact(collision: Collision, dt: number, marble: Marble): void {
		super.onMarbleContact(collision, dt, marble);
		this.affect(marble);
	}

	render() {
		let transform = this.getTransformAtTime(m1, this.getInternalTime(this.game.state.time));

		this.mesh.transform.copy(transform);
		this.mesh.changedTransform();

		// Set the position of the body as well for correct camera ray casting results
		this.body.position.setFromMatrixPosition(transform);
		this.body.syncShapes();
	}

	stop() {
		this.soundSource?.stop();
	}

	getState(): PathedInteriorState {
		return {
			entityType: 'pathedInterior',
			currentTime: this.currentTime,
			targetTime: this.targetTime
		};
	}

	getInitialState(): PathedInteriorState {
		let currentTime = 0;
		let targetTime = 0;

		if (this.element.initialposition) {
			currentTime = MisParser.parseNumber(this.element.initialposition);
		}

		if (this.element.initialtargetposition) {
			targetTime = MisParser.parseNumber(this.element.initialtargetposition);
			// Alright this is strange. In Torque, there are some FPS-dependent client/server desync issues that cause the interior to start at the end position whenever the initialTargetPosition is somewhere greater than 1 and, like, approximately below 50.
			if (targetTime > 0 && targetTime < 50) currentTime = this.duration;
		}

		return {
			entityType: 'pathedInterior',
			currentTime,
			targetTime
		};
	}

	loadState(state: PathedInteriorState, { frame }: { frame: number }) {
		this.currentTime = state.currentTime;
		this.targetTime = state.targetTime;
		this.changeTime = 1000 * frame / GAME_UPDATE_RATE;

		// Set the position
		let transform = this.getTransformAtTime(m1, this.getInternalTime(this.game.state.time));
		this.currentPosition.setFromMatrixPosition(transform);
	}

	getInternalState(): InternalPathedInteriorState {
		return {
			prevPosition: this.prevPosition.clone(),
			currentPosition: this.currentPosition.clone()
		};
	}

	loadInternalState(state: InternalPathedInteriorState): void {
		this.prevPosition.copy(state.prevPosition);
		this.currentPosition.copy(state.currentPosition);
	}
}