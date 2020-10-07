import * as THREE from "three";
import { Util } from "../util";
import { ResourceManager } from "../resources";

const elementHeadRegEx = /^new (\w+)\((\w*)\) *{$/;

export enum MissionElementType {
	SimGroup,
	ScriptObject,
	MissionArea,
	Sky,
	Sun,
	InteriorInstance,
	StaticShape,
	Item,
	Path,
	Marker,
	PathedInterior,
	Trigger,
	AudioProfile,
	MessageVector
}

export interface MissionElementBase {
	// Underscore prefix to avoid name clashes
	/** The general type of the element. */
	_type: MissionElementType,
	/** The subtype, specified in the () of the "constructor". */
	_subtype: string
}

/** A sim group simply holds a list of elements. */
export interface MissionElementSimGroup extends MissionElementBase {
	_type: MissionElementType.SimGroup,
	elements: MissionElement[]
}

/** Stores metadata about the mission. */
export interface MissionElementScriptObject extends MissionElementBase {
	_type: MissionElementType.ScriptObject,
	time: string,
	name: string,
	desc: string,
	type: string,
	startHelpText: string,
	level: string,
	artist: string,
	goldTime: string
}

export interface MissionElementMissionArea extends MissionElementBase {
	_type: MissionElementType.MissionArea,
	area: string,
	flightCeiling: string,
	flightCeilingRange: string,
	locked: string
}

export interface MissionElementSky extends MissionElementBase {
	_type: MissionElementType.Sky,
	position: string,
	rotation: string,
	scale: string,
	cloudHeightPer: string[],
	cloudSpeed1: string,
	cloudSpeed2: string,
	cloudSpeed3: string,
	visibleDistance: string,
	useSkyTextures: string,
	renderBottomTexture: string,
	SkySolidColor: string,
	fogDistance: string,
	fogColor: string,
	fogVolume1: string,
	fogVolume2: string,
	fogVolume3: string,
	materialList: string,
	windVelocity: string,
	windEffectPrecipitation: string,
	noRenderBans: string,
	fogVolumeColor1: string,
	fogVolumeColor2: string,
	fogVolumeColor3: string
}

/** Stores information about the lighting direction and color. */
export interface MissionElementSun extends MissionElementBase {
	_type: MissionElementType.Sun,
	direction: string,
	color: string,
	ambient: string
}

/** Represents a static (non-moving) interior instance. */
export interface MissionElementInteriorInstance extends MissionElementBase {
	_type: MissionElementType.InteriorInstance,
	position: string,
	rotation: string,
	scale: string,
	interiorFile: string,
	showTerrainInside: string
}

/** Represents a static shape. */
export interface MissionElementStaticShape extends MissionElementBase {
	_type: MissionElementType.StaticShape,
	position: string,
	rotation: string,
	scale: string,
	dataBlock: string,
	resetTime?: string,
	timeout?: string
}

/** Represents an item. */
export interface MissionElementItem extends MissionElementBase {
	_type: MissionElementType.Item,
	position: string,
	rotation: string,
	scale: string,
	dataBlock: string,
	collideable: string,
	static: string,
	rotate: string,
	showHelpOnPickup: string,
	timeBonus?: string
}

/** Holds the markers used for the path of a pathed interior. */
export interface MissionElementPath extends MissionElementBase {
	_type: MissionElementType.Path,
	markers: MissionElementMarker[]
}

/** One keyframe in a pathed interior path. */
export interface MissionElementMarker extends MissionElementBase {
	_type: MissionElementType.Marker,
	position: string,
	rotation: string,
	scale: string,
	seqNum: string,
	msToNext: string,
	/** Either Linear, Accelerate or Spline. */
	smoothingType: string
}

/** Represents a moving interior. */
export interface MissionElementPathedInterior extends MissionElementBase {
	_type: MissionElementType.PathedInterior,
	position: string,
	rotation: string,
	scale: string,
	dataBlock: string,
	interiorResource: string,
	interiorIndex: string,
	basePosition: string,
	baseRotation: string,
	baseScale: string,
	// These two following values are a bit weird. See usage for more explanation.
	initialTargetPosition: string,
	initialPosition: string
}

/** Represents a trigger area used for out-of-bounds and help. */
export interface MissionElementTrigger extends MissionElementBase {
	_type: MissionElementType.Trigger,
	position: string,
	rotation: string,
	scale: string,
	dataBlock: string,
	/** A list of 12 strings representing 4 vectors. The first vector corresponds to the origin point of the cuboid, the other three are the side vectors. */
	polyhedron: string,
	text?: string,
	targetTime?: string
}

/** Represents the song choice. */
export interface MissionElementAudioProfile extends MissionElementBase {
	_type: MissionElementType.AudioProfile,
	fileName: string,
	description: string,
	preload: string
}

export interface MissionElementMessageVector extends MissionElementBase {
	_type: MissionElementType.MessageVector
}

type MissionElement = MissionElementSimGroup | MissionElementScriptObject | MissionElementMissionArea | MissionElementSky | MissionElementSun | MissionElementInteriorInstance | MissionElementStaticShape | MissionElementItem | MissionElementPath | MissionElementMarker | MissionElementPathedInterior | MissionElementTrigger | MissionElementAudioProfile | MissionElementMessageVector;

/** A parser for .mis files, which hold mission information. */
export class MisParser {
	text: string;
	lines: string[];
	/** The index of the current line being read. */
	lineIndex: number;

	constructor(text: string) {
		this.text = text;
	}

	parse() {
		// Remove empty and commented-out lines
		this.lines = this.text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'));

		let elements = [];
		for (this.lineIndex = 0; this.lineIndex < this.lines.length; this.lineIndex++) {
			let head = this.readElementHead();
			if (!head) continue;

			let element = this.readElement(head[1], head[2]);
			elements.push(element);
		}

		if (elements.length !== 1) {
			// We expect there to be only one outer element; the MissionGroup SimGroup.
			throw new Error("Mission file has more than 1 outer element!");
		}

		return elements[0] as MissionElementSimGroup;
	}

	/** Reads the head of an element, aka the "constructor". */
	readElementHead() {
		return elementHeadRegEx.exec(this.lines[this.lineIndex]);
	}

	readElement(type: string, subtype: string): MissionElement {
		this.lineIndex++;

		switch (type) {
			case "SimGroup": return this.readSimGroup(subtype);
			case "ScriptObject": return this.readScriptObject(subtype);
			case "MissionArea": return this.readMissionArea(subtype);
			case "Sky": return this.readSky(subtype);
			case "Sun": return this.readSun(subtype);
			case "InteriorInstance": return this.readInteriorInstance(subtype);
			case "StaticShape": return this.readStaticShape(subtype);
			case "Item": return this.readItem(subtype);
			case "Path": return this.readPath(subtype);
			case "Marker": return this.readMarker(subtype);
			case "PathedInterior": return this.readPathedInterior(subtype);
			case "Trigger": return this.readTrigger(subtype);
			case "AudioProfile": return this.readAudioProfile(subtype);
			case "MessageVector": return this.readMessageVector(subtype);
			default: console.error("Unknown element type!");
		}
	}

	readSimGroup(subtype: string) {
		let elements: MissionElement[] = [];

		while (true) {
			if (this.lines[this.lineIndex].startsWith('}')) break; // End of the group

			let head = this.readElementHead();
			if (!head) continue;

			let element = this.readElement(head[1], head[2]); // Read the next element
			elements.push(element);
			this.lineIndex++;
		}

		return {
			_type: MissionElementType.SimGroup,
			_subtype: subtype,
			elements: elements
		} as MissionElementSimGroup;
	}

	/** Reads the key/value pairs of an element. */
	readValues() {
		// Values are either strings or string arrays.
		let obj: Record<string, string | string[]> = {};

		while (true) {
			if (this.lines[this.lineIndex].startsWith('}')) break; // Element is over

			let parts = this.lines[this.lineIndex].split('=').map((part) => part.trim());
			if (parts[0].endsWith(']')) {
				// The key is specifying array data, so handle that case.
				let openingIndex = parts[0].indexOf('[');
				let arrayName = parts[0].slice(0, openingIndex);
				let array = (obj[arrayName] ?? (obj[arrayName] = [])) as string[]; // Create a new array or use the existing one

				let index = Number(parts[0].slice(openingIndex + 1, -1));
				array[index] = parts[1].slice(1, -2);
			} else {
				if (parts[1][0] === '"') {
					obj[parts[0]] = parts[1].slice(1, -2); // Remove " " and final ;
				} else {
					obj[parts[0]] = parts[1].slice(0, -1); // Remove only final ;
				}
			}

			this.lineIndex++;
		}

		return obj;
	}

	readScriptObject(subtype: string) {
		return Object.assign({
			_type: MissionElementType.ScriptObject,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementScriptObject;
	}

	readMissionArea(subtype: string) {
		return Object.assign({
			_type: MissionElementType.MissionArea,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementMissionArea;
	}

	readSky(subtype: string) {
		return Object.assign({
			_type: MissionElementType.Sky,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementSky;
	}

	readSun(subtype: string) {
		return Object.assign({
			_type: MissionElementType.Sun,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementSun;
	}

	readInteriorInstance(subtype: string) {
		return Object.assign({
			_type: MissionElementType.InteriorInstance,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementInteriorInstance;
	}

	readStaticShape(subtype: string) {
		return Object.assign({
			_type: MissionElementType.StaticShape,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementStaticShape;
	}

	readItem(subtype: string) {
		return Object.assign({
			_type: MissionElementType.Item,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementItem;
	}

	readPath(subtype: string) {
		let markers: MissionElementMarker[] = [];

		while (true) {
			if (this.lines[this.lineIndex].startsWith('}')) break;

			let head = this.readElementHead();
			if (!head) continue;

			let element = this.readElement(head[1], head[2]) as MissionElementMarker; // We know all elements inside of the path are markers.
			markers.push(element);
			this.lineIndex++;
		}

		return {
			_type: MissionElementType.Path,
			_subtype: subtype,
			markers: markers.sort((a, b) => Number(a.seqNum) - Number(b.seqNum)) // Make sure they're sorted sequentially
		} as MissionElementPath;
	}

	readMarker(subtype: string) {
		return Object.assign({
			_type: MissionElementType.Marker,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementMarker;
	}

	readPathedInterior(subtype: string) {
		return Object.assign({
			_type: MissionElementType.PathedInterior,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementPathedInterior;
	}

	readTrigger(subtype: string) {
		return Object.assign({
			_type: MissionElementType.Trigger,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementTrigger;
	}

	readAudioProfile(subtype: string) {
		return Object.assign({
			_type: MissionElementType.AudioProfile,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementAudioProfile;
	}

	readMessageVector(subtype: string) {
		return Object.assign({
			_type: MissionElementType.MessageVector,
			_subtype: subtype
		}, this.readValues()) as unknown as MissionElementMessageVector;
	}

	static cachedFiles = new Map<string, MissionElementSimGroup>();
	
	/** Loads and parses a .mis file. Returns a cached version if already loaded. */
	static async loadFile(path: string) {
		if (this.cachedFiles.get(path)) return this.cachedFiles.get(path);

		let blob = await ResourceManager.loadResource(path);
		let arrayBuffer = await blob.text();
		let parser = new MisParser(arrayBuffer);
		
		let result = parser.parse();
		this.cachedFiles.set(path, result);

		return result;
	}

	/** Parses a 3-component vector from a string of three numbers. */
	static parseVector3(string: string) {
		let parts = string.split(' ').map((part) => Number(part));
		return new THREE.Vector3(parts[0], parts[1], parts[2]);
	}

	/** Parses a 4-component vector from a string of four numbers. */
	static parseVector4(string: string) {
		let parts = string.split(' ').map((part) => Number(part));
		return new THREE.Vector4(parts[0], parts[1], parts[2], parts[3]);
	}

	/** Returns a quaternion based on a rotation specified from 4 numbers. */
	static parseRotation(string: string) {
		let parts = string.split(' ').map((part) => Number(part));

		let quaternion = new THREE.Quaternion();
		// The first 3 values represent the axis to rotate on, the last represents the negative angle in degrees.
		quaternion.setFromAxisAngle(new THREE.Vector3(parts[0], parts[1], parts[2]), -Util.degToRad(parts[3]));

		return quaternion;
	}
}