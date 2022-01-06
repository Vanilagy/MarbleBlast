import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { Vector4 } from "../math/vector4";
import { ResourceManager } from "../resources";
import { Util } from "../util";

export interface MisFile {
	root: MissionElementSimGroup,
	/** The custom marble attributes overrides specified in the file. */
	marbleAttributes: Record<string, string>,
	activatedPackages: string[],
	materialProperties: Record<string, Record<string, number>>,
	materialMappings: Record<string, string>
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
	goldtime: string,
	platinumtime: string,
	ultimatetime: string,
	awesometime: string,
	game: string,
	modification: string,
	gamemode: string,
	music: string,
	gametype: string,
	alarmstarttime: string,
	noblast: string,
	blast: string,
	useultramarble: string,

	score: any,
	score0: any,
	score1: any,
	goldscore: any,
	goldscore0: any,
	goldscore1: any,
	platinumscore: any,
	platinumscore0: any,
	platinumscore1: any,
	ultimatescore: any,
	ultimatescore0: any,
	ultimatescore1: any,
	awesomescore: any
	awesomescore0: any
	awesomescore1: any
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
	timebonus?: string,
	timepenalty?: string,
	add?: string
}

/** Holds the markers used for the path of a pathed interior. */
export interface MissionElementPath extends MissionElementBase {
	_type: MissionElementType.Path,
	markers: MissionElementMarker[],
	isLooping?: string
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

	// checkpoint stuff:
	respawnpoint?: string,
	add?: string,
	sub?: string,
	gravity?: string,
	disableOob?: string,

	// teleport/destination trigger stuff:
	destination?: string,
	delay?: string,
	centerdestpoint?: string,
	keepvelocity?: string,
	inversevelocity?: string,
	keepangular?: string,
	keepcamera?: string,
	camerayaw?: string
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

export type MissionElement = MissionElementSimGroup | MissionElementScriptObject | MissionElementMissionArea | MissionElementSky | MissionElementSun | MissionElementInteriorInstance | MissionElementStaticShape | MissionElementItem | MissionElementPath | MissionElementMarker | MissionElementPathedInterior | MissionElementTrigger | MissionElementAudioProfile | MissionElementMessageVector | MissionElementTSStatic | MissionElementParticleEmitterNode;

const elementHeadRegEx = /new\s+(\w+)\((.*?)\)\s*{/g;
const blockCommentRegEx = /\/\*(.|\n)*?\*\//g;
const lineCommentRegEx = /\/\/.*/g;
const assignmentRegEx = /(\$(?:\w|\d)+)\s*=\s*(.+?);/g;
const marbleAttributesRegEx = /setMarbleAttributes\("(\w+)",\s*(.+?)\);/g;
const activatePackageRegEx = /activatePackage\((.+?)\);/g;
const materialPropertyRegEx = /new MaterialProperty *\( *(.+?) *\)\s*{\s*((?:\w+ *= *(\d|\.)+;\s*)*)}/gi;
const addMaterialMappingRegEx = /addMaterialMapping *\( *"(.+?)" *, *(.+?) *\)/gi;
const keyValuePairRegEx = /([^\s]+?)\s*=\s*"(.*?)"\s*;/g;

/** A parser for .mis files, which hold mission information. */
export class MisParser {
	text: string;
	index = 0;
	currentElementId = 0;
	variables: Record<string, string>;

	constructor(text: string) {
		this.text = text;
	}

	parse(): MisFile {
		// This is dirty, but prepend all material definitions to the top of the file so we can parse them incase any custom material of this level uses them.
		this.text = materialPropertyDefinition + '\n\n' + this.text;

		let objectWriteBeginIndex = this.text.indexOf("//--- OBJECT WRITE BEGIN ---");
		let objectWriteEndIndex = this.text.lastIndexOf("//--- OBJECT WRITE END ---");

		let outsideText = this.text.slice(0, objectWriteBeginIndex) + this.text.slice(objectWriteEndIndex);

		// Find all specified variables
		this.variables = { "$usermods": '""' }; // Just make $usermods point to nothing
		assignmentRegEx.lastIndex = 0;
		let match: RegExpMatchArray = null;
		while ((match = assignmentRegEx.exec(outsideText)) !== null) {
			// Only use the first variable found. This is because the variable is likely to be modified later on with conditional statements and that's too complex to parse right now.
			if (!this.variables[match[1]]) this.variables[match[1]] = match[2];
		}

		// Parse any custom marble attributes specified at the top of the file
		let marbleAttributes: Record<string, string> = {};
		match = null;
		marbleAttributesRegEx.lastIndex = 0;
		while ((match = marbleAttributesRegEx.exec(outsideText)) !== null) {
			marbleAttributes[match[1]] = this.resolveExpression(match[2]);
		}

		// Parse any packages that the mission file activates
		let activatedPackages: string[] = [];
		match = null;
		activatePackageRegEx.lastIndex = 0;
		while ((match = activatePackageRegEx.exec(outsideText)) !== null) {
			activatedPackages.push(this.resolveExpression(match[1]));
		}

		let materialProperties: Record<string, Record<string, number>> = {};
		match = null;
		materialPropertyRegEx.lastIndex = 0;
		while ((match = materialPropertyRegEx.exec(outsideText)) !== null) {
			let pairs = match[2].split(';').filter(x => x.trim()).map(x => x.split('=').map(x => x.trim()));
			materialProperties[match[1]] = {};
			for (let pair of pairs) {
				materialProperties[match[1]][pair[0]] = Number(pair[1]);
			}
		}

		let materialMappings: Record<string, string> = {};
		match = null;
		addMaterialMappingRegEx.lastIndex = 0;
		while ((match = addMaterialMappingRegEx.exec(outsideText)) !== null) {
			materialMappings[match[1]] = match[2];
		}

		// Trim away the outside text
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

			// The detected "comment" might be inside a string literal, in which case we ignore it 'cause it ain't no comment.
			if (blockMatch && Util.indexIsInStringLiteral(this.text, blockMatch.index)) blockMatch = null;
			if (lineMatch && Util.indexIsInStringLiteral(this.text, lineMatch.index)) lineMatch = null;

			if (!blockMatch && !lineMatch) break;
			else if (!lineMatch || (blockMatch && lineMatch && blockMatch.index < lineMatch.index)) {
				this.text = this.text.slice(0, blockMatch.index) + this.text.slice(blockMatch.index + blockMatch[0].length);
				currentIndex = blockMatch.index;
			} else {
				this.text = this.text.slice(0, lineMatch.index) + this.text.slice(lineMatch.index + lineMatch[0].length);
				currentIndex = lineMatch.index;
			}
		}

		let indexOfMissionGroup = this.text.indexOf('new SimGroup(MissionGroup)');
		if (indexOfMissionGroup !== -1) this.index = indexOfMissionGroup;

		// Read out all elements (we're expecting exactly one!)
		let elements = [];
		while (this.hasNextElement()) {
			let element = this.readElement();
			if (!element) continue;
			elements.push(element);
		}

		if (elements.length !== 1) {
			// We expect there to be only one outer element; the MissionGroup SimGroup.
			console.log(elements);
			throw new Error("Mission file doesn't have exactly 1 outer element!");
		}

		return {
			root: elements[0] as MissionElementSimGroup,
			marbleAttributes,
			activatedPackages,
			materialProperties,
			materialMappings
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
		let keyValuePairs: Record<string, string> = {}; // Possible optional key-value pairs also included with the sim group

		// Read in all elements
		while (true) {
			elementHeadRegEx.lastIndex = this.index;
			keyValuePairRegEx.lastIndex = this.index;
			let head = elementHeadRegEx.exec(this.text);
			let keyValue = keyValuePairRegEx.exec(this.text);

			let index = Math.min(head?.index, keyValue?.index);
			if (!isFinite(index)) break;
			if (Util.indexOfIgnoreStringLiterals(this.text.slice(this.index, index), '}') !== -1) break;

			if (index === head?.index) {
				let element = this.readElement();
				if (!element) continue;
				elements.push(element);
			} else {
				keyValuePairs[keyValue[1]] = this.resolveExpression(keyValue[2]);
				this.index += keyValue[0].length;
			}
		}

		let endingBraceIndex = Util.indexOfIgnoreStringLiterals(this.text, '};', this.index);
		if (endingBraceIndex === -1) endingBraceIndex = this.text.length;
		this.index = endingBraceIndex + 2;

		if (!elements) return null;

		return Object.assign(keyValuePairs, {
			_type: MissionElementType.SimGroup,
			_name: name,
			elements: elements
		}) as any as MissionElementSimGroup;
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
		let simGroup = this.readSimGroup(name) as any;
		simGroup['markers'] = (simGroup.elements as MissionElementMarker[]).sort((a, b) => MisParser.parseNumber(a.seqnum) - MisParser.parseNumber(b.seqnum)); // Make sure they're sorted sequentially
		delete simGroup['elements'];

		simGroup._type = MissionElementType.Path;
		return simGroup as MissionElementPath;
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
		if (!string) return new Vector3();
		let parts = string.split(' ').map((part) => Number(part));
		if (parts.length < 3) return new Vector3();
		if (parts.find(x => !isFinite(x)) !== undefined) return new Vector3();

		return new Vector3(parts[0], parts[1], parts[2]);
	}

	/** Parses a 4-component vector from a string of four numbers. */
	static parseVector4(string: string) {
		if (!string) return new Vector4();
		let parts = string.split(' ').map((part) => Number(part));
		if (parts.length < 4) return new Vector4();
		if (parts.find(x => !isFinite(x)) !== undefined) return new Vector4();

		return new Vector4(parts[0], parts[1], parts[2], parts[3]);
	}

	/** Returns a quaternion based on a rotation specified from 4 numbers. */
	static parseRotation(string: string) {
		if (!string) return new Quaternion();
		let parts = string.split(' ').map((part) => Number(part));
		if (parts.length < 4) return new Quaternion();
		if (parts.find(x => !isFinite(x)) !== undefined) return new Quaternion();

		let quaternion = new Quaternion();
		// The first 3 values represent the axis to rotate on, the last represents the negative angle in degrees.
		quaternion.setFromAxisAngle(new Vector3(parts[0], parts[1], parts[2]), -Util.degToRad(parts[3]));

		return quaternion;
	}

	/** Parses a numeric value. */
	static parseNumber(string: string) {
		if (!string || typeof string !== 'string') return 0;
		// Strange thing here, apparently you can supply lists of numbers. In this case tho, we just take the first value.
		let val = Number(string.split(',')[0]);
		if (isNaN(val)) return 0;
		return val;
	}


	/** Parses a list of space-separated numbers. */
	static parseNumberList(string: string) {
		let parts = string.split(' ');
		let result: number[] = [];

		for (let part of parts) {
			let number = Number(part);

			if (!isNaN(number)) {
				// The number parsed without issues; simply add it to the array.
				result.push(number);
			} else {
				// Since we got NaN, we assume the number did not parse correctly and we have a case where the space between multiple numbers are missing. So "0.0000000 1.0000000" turning into "0.00000001.0000000".
				const assumedDecimalPlaces = 7; // Reasonable assumption

				// Scan the part to try to find all numbers contained in it
				while (part.length > 0) {
					let dotIndex = part.indexOf('.');
					if (dotIndex === -1) break;

					let section = part.slice(0, Math.min(dotIndex + assumedDecimalPlaces + 1, part.length));
					result.push(Number(section));
					part = part.slice(dotIndex + assumedDecimalPlaces + 1);
				}
			}
		}

		return result;
	}

	/** Parses a boolean value. */
	static parseBoolean(string: string) {
		if (!string) return false;
		if (string === "0") return false;
		return true;
	}
}

/** The source string, taken from PQ, where all default frictions and materials are defined. */
const materialPropertyDefinition = `
new MaterialProperty(GrassFrictionMaterial) {
	friction = 1.50;
	restitution = 0.35;
};

new MaterialProperty(TarmacFrictionMaterial) {
	friction = 0.35;
	restitution = 0.7;
};

new MaterialProperty(RugFrictionMaterial) {
	friction = 6;
	restitution = 0.5;
};

new MaterialProperty(IceFrictionMaterial) {
	friction = 0.03;
	restitution = 0.95;
};

new MaterialProperty(CarpetFrictionMaterial) {
	friction = 6;
	restitution = 0.5;
};

new MaterialProperty(SandFrictionMaterial) {
	friction = 4;
	restitution = 0.1;
};

new MaterialProperty(WaterFrictionMaterial) {
	friction = 6;
	restitution = 0;
};

new MaterialProperty(BouncyFrictionMaterial) {
	friction = 0.2;
	restitution = 0;
	force = 15;
};

new MaterialProperty(RandomForceMaterial) {
	friction = -1;
	restitution = 1;
};

// MBU/O values...

new MaterialProperty(HighFrictionMultiplayerMaterial) {
	friction = 6;
	restitution = 0.3;
};

// added to stop the game from popping an error in the console log that it cannot find the
// material property even though the game runs fine without that minor piece of code
// so these lines of code are an extra to shut the game up and you can remove them if you wish

new MaterialProperty(DefaultMaterial) {
	friction = 1;
	restitution = 1;
};

// these values are for a balanced game play with Mini Marble Golf (the levels)
// they might be a tad different to their MBP equivalent and are more realistic

new MaterialProperty(MMGGrassMaterial) {
	friction = 0.9;
	restitution = 0.5;
};

new MaterialProperty(MMGSandMaterial) {
	friction = 6;
	restitution = 0.1;
};

new MaterialProperty(MMGWaterMaterial) {
	friction = 6;
	restitution = 0;
};

new MaterialProperty(MMGIceMaterial) {
	friction = 0.03;
	restitution = 0.95;
};

new MaterialProperty(MMGIceShadowMaterial) {
	friction = 0.2;
	restitution = 0.95;
};

// These are some old values

new MaterialProperty(BumperMaterial) {
	friction = 0.5;
	restitution = 0;
	force = 15;
};

new MaterialProperty(ButtonMaterial) {
	friction = 1;
	restitution = 1;
};

// MBG Values for their frictions. MBP ones still rock, though.

// Space

new MaterialProperty(NoFrictionMaterial) {
	friction = 0.01;
	restitution = 0.5;
};

// Mud

new MaterialProperty(LowFrictionMaterial) {
	friction = 0.20;
	restitution = 0.5;
};

// Grass

new MaterialProperty(HighFrictionMaterial) {
	friction = 1.50;
	restitution = 0.5;
};

// Yellow ramps with arrows from Three Fold Maze and Escher's Race

new MaterialProperty(VeryHighFrictionMaterial) {
	friction = 2;
	restitution = 1;
};

// Normal floor

new MaterialProperty(RubberFloorMaterial) {
	friction = 1;
	restitution = 1;
};

// Oil Slick

new MaterialProperty(IceMaterial) {
	friction = 0.05;
	restitution = 0.5;
};

new MaterialProperty(XmasSnowMaterial) {
	friction = 3;
	restitution = 0.2;
};

// PlatinumQuest frictions

new MaterialProperty(PQSpaceMaterial) {
	friction = 0.01;
	restitution = 0.35;
};

// It's elite
new MaterialProperty(PQIceMaterial) {
	friction = 0.07331;
	restitution = 0.75;
};

new MaterialProperty(PQMudMaterial) {
	friction = 0.30;
	restitution = 0.5;
};

// Match 3FM/ER friction
new MaterialProperty(PQGrassMaterial) {
	friction = 2;
	restitution = 0.5;
};

// Tad higher on rest. now
new MaterialProperty(PQSandMaterial) {
	friction = 4;
	restitution = 0.15;
};

new MaterialProperty(PQBouncyMaterial) {
	friction = 0.2;
	restitution = 0;
	force = 15;
};

new MaterialProperty(IceShardMaterial) {
	friction = 0;
	restitution = 0;
	force = 0;
};

new MaterialProperty(MORepulsionMaterial) {
	friction = 1;
	restitution = 1;
	force = 10;
};

new MaterialProperty(MOWeakRepulsionMaterial) {
	friction = 1;
	restitution = 1;
	force = 5;
};

// Spooky!!

new MaterialProperty(SpookyWaterMaterial) {
	friction = 6;
	restitution = 0;
};

new MaterialProperty(SpookyDirtMaterial) {
	friction = 6;
	restitution = 0.3;
};

new MaterialProperty(SpookyGrassMaterial) {
	friction = 2;
	restitution = 0.75;
};`;