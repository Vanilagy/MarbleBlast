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
	_subtype: string,
	/** Is unique for every element in the mission file. */
	_id: number
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
	starthelptext: string,
	level: string,
	artist: string,
	goldtime: string
}

export interface MissionElementMissionArea extends MissionElementBase {
	_type: MissionElementType.MissionArea,
	area: string,
	flightceiling: string,
	flightceilingRange: string,
	locked: string
}

export interface MissionElementSky extends MissionElementBase {
	_type: MissionElementType.Sky,
	position: string,
	rotation: string,
	scale: string,
	cloudheightper: string[],
	cloudspeed1: string,
	cloudspeed2: string,
	cloudspeed3: string,
	visibledistance: string,
	useskytextures: string,
	renderbottomtexture: string,
	skysolidcolor: string,
	fogdistance: string,
	fogcolor: string,
	fogvolume1: string,
	fogvolume2: string,
	fogvolume3: string,
	materiallist: string,
	windvelocity: string,
	windeffectprecipitation: string,
	norenderbans: string,
	fogvolumecolor1: string,
	fogvolumecolor2: string,
	fogvolumecolor3: string
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
	interiorfile: string,
	showterraininside: string
}

/** Represents a static shape. */
export interface MissionElementStaticShape extends MissionElementBase {
	_type: MissionElementType.StaticShape,
	position: string,
	rotation: string,
	scale: string,
	datablock: string,
	resettime?: string,
	timeout?: string
}

/** Represents an item. */
export interface MissionElementItem extends MissionElementBase {
	_type: MissionElementType.Item,
	position: string,
	rotation: string,
	scale: string,
	datablock: string,
	collideable: string,
	static: string,
	rotate: string,
	showhelponpickup: string,
	timebonus?: string
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
	seqnum: string,
	mstonext: string,
	/** Either Linear, Accelerate or Spline. */
	smoothingtype: string
}

/** Represents a moving interior. */
export interface MissionElementPathedInterior extends MissionElementBase {
	_type: MissionElementType.PathedInterior,
	position: string,
	rotation: string,
	scale: string,
	datablock: string,
	interiorresource: string,
	interiorindex: string,
	baseposition: string,
	baserotation: string,
	basescale: string,
	// These two following values are a bit weird. See usage for more explanation.
	initialtargetposition: string,
	initialposition: string
}

/** Represents a trigger area used for out-of-bounds and help. */
export interface MissionElementTrigger extends MissionElementBase {
	_type: MissionElementType.Trigger,
	position: string,
	rotation: string,
	scale: string,
	datablock: string,
	/** A list of 12 strings representing 4 vectors. The first vector corresponds to the origin point of the cuboid, the other three are the side vectors. */
	polyhedron: string,
	text?: string,
	targettime?: string
}

/** Represents the song choice. */
export interface MissionElementAudioProfile extends MissionElementBase {
	_type: MissionElementType.AudioProfile,
	filename: string,
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
	currentElementId = 0;

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

	readElement(type: string, subtype: string) {
		this.lineIndex++;
		let element: MissionElement = null;

		switch (type) {
			case "SimGroup": element = this.readSimGroup(subtype); break;
			case "ScriptObject": element = this.readScriptObject(subtype); break;
			case "MissionArea": element = this.readMissionArea(subtype); break;
			case "Sky": element = this.readSky(subtype); break;
			case "Sun": element = this.readSun(subtype); break;
			case "InteriorInstance": element = this.readInteriorInstance(subtype); break;
			case "StaticShape": element = this.readStaticShape(subtype); break;
			case "Item": element = this.readItem(subtype); break;
			case "Path": element = this.readPath(subtype); break;
			case "Marker": element = this.readMarker(subtype); break;
			case "PathedInterior": element = this.readPathedInterior(subtype); break;
			case "Trigger": element = this.readTrigger(subtype); break;
			case "AudioProfile": element = this.readAudioProfile(subtype); break;
			case "MessageVector": element = this.readMessageVector(subtype); break;
			default: console.error("Unknown element type!");
		}

		if (element) element._id = this.currentElementId++;
		return element;
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
			let key = parts[0];

			if (key.endsWith(']')) {
				// The key is specifying array data, so handle that case.
				let openingIndex = key.indexOf('[');
				let arrayName = key.slice(0, openingIndex);
				let array = (obj[arrayName] ?? (obj[arrayName] = [])) as string[]; // Create a new array or use the existing one

				let index = Number(key.slice(openingIndex + 1, -1));
				array[index] = parts[1].slice(1, -2);
			} else {
				key = key.toLowerCase(); // TorqueScript is case-insensitive here

				if (parts[1][0] === '"') {
					obj[key] = parts[1].slice(1, -2); // Remove " " and final ;
				} else {
					obj[key] = parts[1].slice(0, -1); // Remove only final ;
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
			markers: markers.sort((a, b) => Number(a.seqnum) - Number(b.seqnum)) // Make sure they're sorted sequentially
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
		let text = await ResourceManager.readBlobAsText(blob);
		let parser = new MisParser(text);
		
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