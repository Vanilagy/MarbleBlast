import * as THREE from "three";
import { Util } from "../util";
import { ResourceManager } from "../resources";

export interface MisFile {
	root: MissionElementSimGroup,
	/** The custom marble attributes overrides specified in the file. */
	marbleAttributes: Record<string, string>
}

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
	MessageVector,
	TSStatic,
	ParticleEmitterNode
}

export interface MissionElementBase {
	// Underscore prefix to avoid name clashes
	/** The general type of the element. */
	_type: MissionElementType,
	/** The object name, specified in the () of the "constructor". */
	_name: string,
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
	targettime?: string,
	instant?: string,
	icontinuetottime?: string,
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

/** Represents a static, unmoving, unanimated DTS shape. They're pretty dumb, tbh. */
export interface MissionElementTSStatic extends MissionElementBase {
	_type: MissionElementType.TSStatic,
	position: string,
	rotation: string,
	scale: string,
	shapename: string
}

/** Represents a particle emitter. Currently unused by this port (these are really niche). */
export interface MissionElementParticleEmitterNode extends MissionElementBase {
	_type: MissionElementType.ParticleEmitterNode,
	position: string,
	rotation: string,
	scale: string,
	datablock: string,
	emitter: string,
	velocity: string
}

type MissionElement = MissionElementSimGroup | MissionElementScriptObject | MissionElementMissionArea | MissionElementSky | MissionElementSun | MissionElementInteriorInstance | MissionElementStaticShape | MissionElementItem | MissionElementPath | MissionElementMarker | MissionElementPathedInterior | MissionElementTrigger | MissionElementAudioProfile | MissionElementMessageVector | MissionElementTSStatic | MissionElementParticleEmitterNode;

const elementHeadRegEx = /new (\w+)\((\w*)\) *{/g;
const blockCommentRegEx = /\/\*(.|\n)*?\*\//g;
const lineCommentRegEx = /\/\/.*/g;
const assignmentRegEx = /(\$(?:\w|\d)+)\s*=\s*(.+?);/g;
const marbleAttributesRegEx = /setMarbleAttributes\("(\w+)",\s*(.+?)\);/g;

/** A parser for .mis files, which hold mission information. */
export class MisParser {
	text: string;
	index = 0;
	currentElementId = 0;
	variables: Record<string, string>;
	marbleAttributes: Record<string, string>;

	constructor(text: string) {
		this.text = text;
	}

	parse() {
		let objectWriteBeginIndex = this.text.indexOf("//--- OBJECT WRITE BEGIN ---");
		let objectWriteEndIndex = this.text.lastIndexOf("//--- OBJECT WRITE END ---");

		// Find all specified variables
		this.variables = { "$usermods": '""' }; // Just make $usermods point to nothing
		let preamble = this.text.slice(0, objectWriteBeginIndex);
		assignmentRegEx.lastIndex = 0;
		let match: RegExpMatchArray = null;
		while ((match = assignmentRegEx.exec(preamble)) !== null) {
			// Only use the first variable found. This is because the variable is likely to be modified later on with conditional statements and that's too complex to parse right now.
			if (!this.variables[match[1]]) this.variables[match[1]] = match[2];
		}

		// Parse any custom marble attributes specified at the top of the file
		this.marbleAttributes = {};
		match = null;
		marbleAttributesRegEx.lastIndex = 0;
		while ((match = marbleAttributesRegEx.exec(preamble)) !== null) {
			this.marbleAttributes[match[1]] = this.resolveExpression(match[2]);
		}

		// Trim away the preamble
		if (objectWriteBeginIndex !== -1 && objectWriteEndIndex !== -1) {
			this.text = this.text.slice(objectWriteBeginIndex, objectWriteEndIndex);
		}

		// Remove all block and line comments to make parsing easier
		let currentIndex = 0;
		while (true) {
			blockCommentRegEx.lastIndex = currentIndex;
			lineCommentRegEx.lastIndex = currentIndex;

			let blockMatch = blockCommentRegEx.exec(this.text);
			let lineMatch = lineCommentRegEx.exec(this.text);

			if (!blockMatch && !lineMatch) break;
			else if (!lineMatch || (blockMatch && lineMatch && blockMatch.index < lineMatch.index)) {
				this.text = this.text.slice(0, blockMatch.index) + this.text.slice(blockMatch.index + blockMatch[0].length);
				currentIndex += blockMatch.index;
			} else {
				this.text = this.text.slice(0, lineMatch.index) + this.text.slice(lineMatch.index + lineMatch[0].length);
				currentIndex += lineMatch.index;
			}
		}

		// Read out all elements (we're expecting exactly one!)
		let elements = [];
		while (this.hasNextElement()) {
			let element = this.readElement();
			if (!element) continue;
			elements.push(element);
		}

		if (elements.length !== 1) {
			// We expect there to be only one outer element; the MissionGroup SimGroup.
			throw new Error("Mission file doesn't have exactly 1 outer element!");
			console.log(elements);
		}

		return {
			root: elements[0] as MissionElementSimGroup,
			marbleAttributes: this.marbleAttributes
		};
	}

	readElement() {
		// Get information about the head
		elementHeadRegEx.lastIndex = this.index;
		let head = elementHeadRegEx.exec(this.text);
		this.index = head.index + head[0].length;

		let type = head[1];
		let name = head[2];

		this.index = head.index + head[0].length;
		let element: MissionElement = null;

		switch (type) {
			case "SimGroup": element = this.readSimGroup(name); break;
			case "ScriptObject": element = this.readScriptObject(name); break;
			case "MissionArea": element = this.readMissionArea(name); break;
			case "Sky": element = this.readSky(name); break;
			case "Sun": element = this.readSun(name); break;
			case "InteriorInstance": element = this.readInteriorInstance(name); break;
			case "StaticShape": element = this.readStaticShape(name); break;
			case "Item": element = this.readItem(name); break;
			case "Path": element = this.readPath(name); break;
			case "Marker": element = this.readMarker(name); break;
			case "PathedInterior": element = this.readPathedInterior(name); break;
			case "Trigger": element = this.readTrigger(name); break;
			case "AudioProfile": element = this.readAudioProfile(name); break;
			case "MessageVector": element = this.readMessageVector(name); break;
			case "TSStatic": element = this.readTSStatic(name); break;
			case "ParticleEmitterNode": element = this.readParticleEmitterNode(name); break;
			default: {
				console.warn("Unknown element type! " + type);
				// Still advance the index
				let endingBraceIndex = Util.indexOfIgnoreStringLiterals(this.text, '};', this.index);
				if (endingBraceIndex === -1) endingBraceIndex = this.text.length;
				this.index = endingBraceIndex + 2;
			}
		}

		if (element) element._id = this.currentElementId++;
		return element;
	}

	/** Checks if there's another element coming in the current scope. */
	hasNextElement() {
		elementHeadRegEx.lastIndex = this.index;
		let head = elementHeadRegEx.exec(this.text);

		if (!head) return false;
		if (Util.indexOfIgnoreStringLiterals(this.text.slice(this.index, head.index), '}') !== -1) return false;
		return true;
	}

	readSimGroup(name: string) {
		let elements: MissionElement[] = [];

		// Read in all elements
		while (this.hasNextElement()) {
			let element = this.readElement();
			if (!element) continue;
			elements.push(element);
		}

		let endingBraceIndex = Util.indexOfIgnoreStringLiterals(this.text, '};', this.index);
		if (endingBraceIndex === -1) endingBraceIndex = this.text.length;
		this.index = endingBraceIndex + 2;

		if (!elements) return null;

		return {
			_type: MissionElementType.SimGroup,
			_name: name,
			elements: elements
		} as MissionElementSimGroup;
	}

	/** Reads the key/value pairs of an element. */
	readValues() {
		// Values are either strings or string arrays.
		let obj: Record<string, string | string[]> = {};
		let endingBraceIndex = Util.indexOfIgnoreStringLiterals(this.text, '};', this.index);
		if (endingBraceIndex === -1) endingBraceIndex = this.text.length;
		let section = this.text.slice(this.index, endingBraceIndex).trim();
		let statements = Util.splitIgnoreStringLiterals(section, ';').map(x => x.trim()); // Get a list of all statements

		for (let statement of statements) {
			if (!statement) continue;
			let splitIndex = statement.indexOf('=');
			if (splitIndex === -1) continue;
			let parts = [statement.slice(0, splitIndex), statement.slice(splitIndex + 1)].map((part) => part.trim());
			if (parts.length !== 2) continue;
			let key = parts[0];
			key = key.toLowerCase(); // TorqueScript is case-insensitive here

			if (key.endsWith(']')) {
				// The key is specifying array data, so handle that case.
				let openingIndex = key.indexOf('[');
				let arrayName = key.slice(0, openingIndex);
				let array = (obj[arrayName] ?? (obj[arrayName] = [])) as string[]; // Create a new array or use the existing one

				let index = Number(key.slice(openingIndex + 1, -1));
				array[index] = this.resolveExpression(parts[1]);
			} else {
				obj[key] = this.resolveExpression(parts[1]);
			}
		}

		this.index = endingBraceIndex + 2;
		return obj;
	}

	/** Resolves a TorqueScript rvalue expression. Currently only supports the concatenation @ operator. */
	resolveExpression(expr: string) {
		let parts = Util.splitIgnoreStringLiterals(expr, '@').map(x => {
			x = x.trim();

			if (x.startsWith('$') && this.variables[x] !== undefined) {
				// Replace the variable with its value
				x = this.resolveExpression(this.variables[x]);
			} else if (x.startsWith('"') && x.endsWith('"')) {
				x = Util.unescape(x.slice(1, -1)); // It's a string literal, so remove " "
			}

			return x;
		});

		return parts.join('');
	}

	readScriptObject(name: string) {
		return Object.assign({
			_type: MissionElementType.ScriptObject,
			_name: name
		}, this.readValues()) as unknown as MissionElementScriptObject;
	}

	readMissionArea(name: string) {
		return Object.assign({
			_type: MissionElementType.MissionArea,
			_name: name
		}, this.readValues()) as unknown as MissionElementMissionArea;
	}

	readSky(name: string) {
		return Object.assign({
			_type: MissionElementType.Sky,
			_name: name
		}, this.readValues()) as unknown as MissionElementSky;
	}

	readSun(name: string) {
		return Object.assign({
			_type: MissionElementType.Sun,
			_name: name
		}, this.readValues()) as unknown as MissionElementSun;
	}

	readInteriorInstance(name: string) {
		return Object.assign({
			_type: MissionElementType.InteriorInstance,
			_name: name
		}, this.readValues()) as unknown as MissionElementInteriorInstance;
	}

	readStaticShape(name: string) {
		return Object.assign({
			_type: MissionElementType.StaticShape,
			_name: name
		}, this.readValues()) as unknown as MissionElementStaticShape;
	}

	readItem(name: string) {
		return Object.assign({
			_type: MissionElementType.Item,
			_name: name
		}, this.readValues()) as unknown as MissionElementItem;
	}

	readPath(name: string) {
		let simGroup = this.readSimGroup(name);

		return {
			_type: MissionElementType.Path,
			_name: name,
			markers: (simGroup.elements as MissionElementMarker[]).sort((a, b) => MisParser.parseNumber(a.seqnum) - MisParser.parseNumber(b.seqnum)) // Make sure they're sorted sequentially
		} as MissionElementPath;
	}

	readMarker(name: string) {
		return Object.assign({
			_type: MissionElementType.Marker,
			_name: name
		}, this.readValues()) as unknown as MissionElementMarker;
	}

	readPathedInterior(name: string) {
		return Object.assign({
			_type: MissionElementType.PathedInterior,
			_name: name
		}, this.readValues()) as unknown as MissionElementPathedInterior;
	}

	readTrigger(name: string) {
		return Object.assign({
			_type: MissionElementType.Trigger,
			_name: name
		}, this.readValues()) as unknown as MissionElementTrigger;
	}

	readAudioProfile(name: string) {
		return Object.assign({
			_type: MissionElementType.AudioProfile,
			_name: name
		}, this.readValues()) as unknown as MissionElementAudioProfile;
	}

	readMessageVector(name: string) {
		return Object.assign({
			_type: MissionElementType.MessageVector,
			_name: name
		}, this.readValues()) as unknown as MissionElementMessageVector;
	}

	readTSStatic(name: string) {
		return Object.assign({
			_type: MissionElementType.TSStatic,
			_name: name
		}, this.readValues()) as unknown as MissionElementTSStatic;
	}

	readParticleEmitterNode(name: string) {
		return Object.assign({
			_type: MissionElementType.ParticleEmitterNode,
			_name: name
		}, this.readValues()) as unknown as MissionElementParticleEmitterNode;
	}

	static cachedFiles = new Map<string, MisFile>();
	
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

	/** Parses a numeric value. */
	static parseNumber(string: string) {
		// Strange thing here, apparently you can supply lists of numbers. In this case tho, we just take the first value.
		let val = Number(string.split(',')[0]);
		if (isNaN(val)) return 0;
		return val;
	}
}