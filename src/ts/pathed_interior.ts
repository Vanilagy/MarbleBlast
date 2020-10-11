import { Interior } from "./interior";
import { DifParser } from "./parsing/dif_parser";
import { MissionElementSimGroup, MissionElementType, MissionElementPathedInterior, MissionElementPath, MisParser, MissionElementTrigger } from "./parsing/mis_parser";
import { Util } from "./util";
import * as THREE from "three";
import { TimeState, PHYSICS_TICK_RATE, Level } from "./level";
import { MustChangeTrigger } from "./triggers/must_change_trigger";
import OIMO from "./declarations/oimo";

interface MarkerData {
	msToNext: number,
	smoothingType: string,
	position: THREE.Vector3,
	rotation: THREE.Quaternion
}

/** Represents a Torque 3D Pathed Interior moving along a set path. */
export class PathedInterior extends Interior {
	path: MissionElementPath;
	markerData: MarkerData[];
	element: MissionElementPathedInterior;triggers: MustChangeTrigger[] = [];

	duration: number;
	timeOffset: number = 0;
	timeStart: number = null;
	timeDest: number = null;
	changeTime: number = null;

	prevVelocity = new OIMO.Vec3();
	prevPosition = new THREE.Vector3();
	currentPosition = new THREE.Vector3();

	/** Creates a PathedInterior from a sim group containing it and its path (and possible triggers). */
	static async createFromSimGroup(simGroup: MissionElementSimGroup, level: Level) {
		let interiorElement = simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior) as MissionElementPathedInterior;

		let path = interiorElement.interiorresource.slice(interiorElement.interiorresource.indexOf('interiors/'));
		let difFile = await DifParser.loadFile('./assets/data/' + path);
		let pathedInterior = new PathedInterior(difFile, path, level, Number(interiorElement.interiorindex));
		
		await pathedInterior.init();
		pathedInterior.buildCollisionGeometry(new THREE.Vector3(1, 1, 1));
		pathedInterior.element = interiorElement;
		pathedInterior.path = simGroup.elements.find((element) => element._type === MissionElementType.Path) as MissionElementPath;
		pathedInterior.computeDuration();
		// Parse the markers
		pathedInterior.markerData = pathedInterior.path.markers.map(x => {
			return {
				msToNext: Number(x.mstonext),
				smoothingType: x.smoothingtype,
				position: MisParser.parseVector3(x.position),
				rotation: MisParser.parseRotation(x.rotation)
			};
		});

		// Add MustChangeTriggers if necessary
		let triggers = simGroup.elements.filter((element) => element._type === MissionElementType.Trigger) as MissionElementTrigger[];
		for (let triggerElement of triggers) {
			let trigger = new MustChangeTrigger(triggerElement, pathedInterior);
			pathedInterior.triggers.push(trigger);
		}

		pathedInterior.reset();
		return pathedInterior;
	}

	/** Computes the total duration of the path. */
	computeDuration() {
		let total = 0;

		// Don't count the last marker
		for (let i = 0; i < this.path.markers.length-1; i++) {
			total += Number(this.path.markers[i].mstonext);
		}

		this.duration = total;
	}

	setDestinationTime(now: TimeState, destination: number) {
		let currentInternalTime = this.getInternalTime(now.currentAttemptTime);

		this.timeStart = currentInternalTime;
		this.timeDest = destination;
		this.changeTime = now.currentAttemptTime;
	}

	getInternalTime(externalTime: number) {
		// Simply loop
		if (this.changeTime === null) return (externalTime + this.timeOffset) % this.duration;

		// Interpolate from timeStart to timeDest
		let dur = Math.abs(this.timeStart - this.timeDest);
		let completion = Util.clamp((externalTime - this.changeTime) / dur, 0, 1);
		return Util.clamp(Util.lerp(this.timeStart, this.timeDest, completion), 0, this.duration);
	}

	tick(time: TimeState) {
		let transform = this.getTransformAtTime(this.getInternalTime(time.currentAttemptTime));

		let mat = this.worldMatrix.clone();
		mat.multiplyMatrices(transform, mat);

		let position = new THREE.Vector3();
		mat.decompose(position, new THREE.Quaternion(), new THREE.Vector3()); // The orientation doesn't really matter in any level afaik

		if (!this.prevPosition) this.prevPosition.copy(position);
		else this.prevPosition.copy(this.currentPosition);

		this.currentPosition = position;

		this.prevVelocity = this.body.getLinearVelocity().clone();
		// Calculate the velocity based on current and last position
		let velocity = position.clone().sub(this.prevPosition).multiplyScalar(PHYSICS_TICK_RATE);

		if (velocity.length() > 0) {
			// If the interior is moving, make sure it's flagged as kinematic
			this.body.setType(OIMO.RigidBodyType.KINEMATIC);
			this.body.setLinearVelocity(Util.vecThreeToOimo(velocity));
		} else if (this.body.getType() !== OIMO.RigidBodyType.STATIC) {
			// If the interior is currently stationary, we can flag it as that for increased performance
			this.body.setType(OIMO.RigidBodyType.STATIC);
			this.body.setLinearVelocity(new OIMO.Vec3());
		}
	}

	updatePosition() {
		this.body.setPosition(Util.vecThreeToOimo(this.currentPosition));
	}

	/** Computes the transform of the interior at a point in time along the path. */
	getTransformAtTime(time: number) {
		let m1 = this.markerData[0];
		let m2 = this.markerData[1];

		// Find the two markers in question
		let currentEndTime = Number(m1.msToNext);
		let i = 2;
		while (currentEndTime < time && i < this.markerData.length) {
			m1 = m2;
			m2 = this.markerData[i++];
			
			currentEndTime += m1.msToNext;
		}

		let m1Time = currentEndTime - m1.msToNext;
		let m2Time = currentEndTime;
		let duration = m2Time - m1Time;
		let position: THREE.Vector3;

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

			position = new THREE.Vector3();
			position.x = Util.catmullRom(completion, p0.x, p1.x, p2.x, p3.x);
			position.y = Util.catmullRom(completion, p0.y, p1.y, p2.y, p3.y);
			position.z = Util.catmullRom(completion, p0.z, p1.z, p2.z, p3.z);
		}

		if (!position) {
			let p1 = m1.position;
			let p2 = m2.position;
			position = Util.lerpThreeVectors(p1, p2, completion);
		}
		
		let r1 = m1.rotation;
		let r2 = m2.rotation;
		let rotation = r1.clone().slerp(r2, completion);

		let firstPosition = this.markerData[0].position;
		position.sub(firstPosition);

		let mat = new THREE.Matrix4();
		mat.compose(position, rotation, new THREE.Vector3(1, 1, 1));

		return mat;
	}

	render(time: TimeState) {
		let transform = this.getTransformAtTime(this.getInternalTime(time.currentAttemptTime));

		let mat = this.worldMatrix.clone();
		mat.multiplyMatrices(transform, mat);

		let position = new THREE.Vector3();
		let orientation = new THREE.Quaternion();
		mat.decompose(position, orientation, new THREE.Vector3());

		this.group.position.copy(position);
		this.group.quaternion.copy(orientation);
	}

	reset() {
		// I wish I could explain what's happening here (and why) a bit more clearly, but it's just a big clusterfuck.
		
		if (this.triggers.length > 0) {
			// Make sure the interior doesn't start moving on its own (the default)
			this.timeStart = 0;
			this.timeDest = 0;
			this.changeTime = -Infinity;
		}

		let initialTargetPosition = Number(this.element.initialtargetposition ?? -1);
		if (initialTargetPosition >= 0) {
			this.timeStart = Number(this.element.initialposition);
			if (isNaN(this.timeStart)) {
				// Yeah I know, strange, and this only seems to happen on Money Tree.
				this.timeStart = this.duration;
				this.timeDest = initialTargetPosition;
			}

			this.changeTime = 0;
		} else if (this.element.initialposition) {
			// Interpret the initial position as a time offset
			this.timeOffset = Number(this.element.initialposition);
		}
	}
}