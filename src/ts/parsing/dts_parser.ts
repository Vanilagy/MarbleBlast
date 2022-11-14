/* eslint-disable @typescript-eslint/no-unused-vars */
import { BinaryFileParser, Point2F, Point3F, Box3F } from "./binary_file_parser";
import { ResourceManager } from "../resources";

export enum MeshType {
	Standard = 0,
	Skin = 1,
	Decal = 2,
	Sorted = 3,
	Null = 4
}

/** A compacted representation of a quaternion. Can be converted to a regular quaternion by normalizing and then conjugating. */
export interface Quat16 {
	x: number,
	y: number,
	z: number,
	w: number
}

/** Basically a variable-size bitfield, each number in the array representing a 32-bit word in that bitfield. */
type BitSet = number[];

export interface DtsFile {
	version: number,
	exporterVersion: number,
	smallestVisibleSize: number,
	radius: number,
	tubeRadius: number,
	center: Point3F,
	bounds: Box3F,
	/** The nodes describing a node graph. Each node is assigned certain transforms and holds a list of objects to draw. */
	nodes: {
		nameIndex: number,
		parentIndex: number,
		firstObject: number,
		firstChild: number,
		nextSibling: number
	}[],
	/** The objects, containing a list of meshses to draw. */
	objects: {
		nameIndex: number,
		numMeshes: number,
		startMeshIndex: number,
		nodeIndex: number,
		nextSibling: number,
		firstDecal: number
	}[],
	decals: {
		nameIndex: number,
		numMeshes: number,
		startMeshIndex: number,
		objectIndex: number,
		nextSibling: number
	}[],
	iflMaterials: {
		nameIndex: number,
		materialSlot: number,
		firstFrame: number,
		firstFrameOffTimeIndex: number,
		numFrames: number
	}[],
	objectStates: {
		vis: number,
		frameIndex: number,
		matFrame: number
	}[],
	decalStates: number[],
	triggers: {
		state: number,
		pos: number
	}[],
	details: {
		nameIndex: number,
		subShapeNum: number,
		objectDetailNum: number,
		size: number,
		averageError: number,
		maxError: number,
		polyCount: number
	}[],
	/** A list of meshes to draw. */
	meshes: {
		type: number,
		parentMesh: number,
		numFrames: number,
		numMatFrames: number,
		bounds: Box3F,
		center: Point3F,
		radius: number,
		verts: Point3F[],
		tverts: Point2F[],
		norms: Point3F[],
		encodedNorms: number[],
		primitives: {
			start: number,
			numElements: number,
			matIndex: number
		}[],
		indices: number[],
		mergeIndices: number[],
		vertsPerFrame: number,
		flags: number,
		// Values used only for SkinMesh:
		initialTransforms?: number[][],
		vertIndices?: number[],
		boneIndices?: number[],
		weights?: number[],
		nodeIndices?: number[]
	}[],
	subShapeFirstNode: number[],
	subShapeFirstObject: number[],
	subShapeFirstDecal: number[],
	subShapeNumNodes: number[],
	subShapeNumObjects: number[],
	subShapeNumDecals: number[],
	/** The default node rotations. */
	defaultRotations: Quat16[],
	/** The default node translations. */
	defaultTranslations: Point3F[],
	/** Values used for sequence animations. */
	nodeRotations: Quat16[],
	nodeTranslations: Point3F[],
	nodeUniformScales: number[],
	nodeAlignedScales: Point3F[],
	nodeArbScaleFactors: Point3F[],
	nodeArbScaleRots: Quat16[],
	groundTranslations: Point3F[],
	groundRotations: Quat16[],
	names: string[],
	alphaIn: number[],
	alphaOut: number[],
	/** A list of sequences, used for animation of transforms and/or materials. */
	sequences: {
		nameIndex: number,
		flags: number,
		numKeyframes: number,
		duration: number,
		priority: number,
		firstGroundFrame: number,
		numGroundFrames: number,
		baseRotation: number,
		baseTranslation: number,
		baseScale: number,
		baseObjectState: number,
		baseDecalState: number,
		firstTrigger: number,
		numTriggers: number,
		toolBegin: number,
		rotationMatters: BitSet,
		translationMatters: BitSet,
		scaleMatters: BitSet,
		decalMatters: BitSet,
		iflMatters: BitSet,
		visMatters: BitSet,
		frameMatters: BitSet,
		matFrameMatters: BitSet
	}[],
	matNames: string[],
	matFlags: number[],
	matReflectanceMaps: number[],
	matBumpMaps: number[],
	matDetailMaps: number[],
	matDetailScales: number[],
	matReflectance: number[]
}

/** A helper construct used by the DTS parser. It keeps 3 indices into one data buffer for reading a stream of 32-bit, 16-bit and 8-bit values, respectively. */
class Alloc {
	buf: ArrayBuffer;
	view: DataView;
	index32: number;
	index16: number;
	index8: number;
	lastGuardValue = 0;

	constructor(buf: ArrayBuffer, start32: number, start16: number, start8: number) {
		this.buf = buf;
		this.view = new DataView(this.buf);
		this.index32 = start32;
		this.index16 = start32 + start16 * 4;
		this.index8 = start32 + start8 * 4;
	}

	readU32() {
		let val = this.view.getUint32(this.index32, true);
		this.index32 += 4;
		return val;
	}

	readS32() {
		let val = this.view.getInt32(this.index32, true);
		this.index32 += 4;
		return val;
	}

	readF32() {
		let val = this.view.getFloat32(this.index32, true);
		this.index32 += 4;
		return val;
	}

	readPoint2F(): Point2F {
		return {
			x: this.readF32(),
			y: this.readF32()
		};
	}

	readPoint3F(): Point3F {
		return {
			x: this.readF32(),
			y: this.readF32(),
			z: this.readF32()
		};
	}

	readBoxF(): Box3F {
		return {
			min: this.readPoint3F(),
			max: this.readPoint3F()
		};
	}

	readU16() {
		let val = this.view.getUint16(this.index16, true);
		this.index16 += 2;
		return val;
	}

	readS16() {
		let val = this.view.getInt16(this.index16, true);
		this.index16 += 2;
		return val;
	}

	readU8() {
		let val = this.view.getUint8(this.index8);
		this.index8 += 1;
		return val;
	}

	readQuat16(): Quat16 {
		return {
			x: this.readS16(),
			y: this.readS16(),
			z: this.readS16(),
			w: this.readS16()
		};
	}

	readMatrixF() {
		return new Array(16).fill(null).map(() => this.readF32());
	}

	/** Guards are sequentially increasing numbers in all three buffers which are used to check data integrity. */
	guard() {
		let guard32 = this.readU32();
		let guard16 = this.readU16();
		let guard8 = this.readU8();

		if (!(guard32 === guard16 && guard16 === guard8 && guard8 === this.lastGuardValue)) {
			throw new Error("Guard fail! Expected " + this.lastGuardValue + " but got " + guard32 + " for 32, " + guard16 + " for 16 and " + guard8 + " for 8.");
		}

		this.lastGuardValue++;
	}
}

/** Class used for old DTS versions. Is used to build a new buffer in the modern DTS format which is then parsed as usual. */
class OldAlloc {
	sourceView: DataView;
	buffer32: DataView;
	buffer16: DataView;
	buffer8: DataView;

	sourceIndex = 0;
	index32 = 0;
	index16 = 0;
	index8 = 0;

	nextGuard = 0;

	constructor(sourceView: DataView, sourceIndex: number) {
		this.sourceView = sourceView;
		this.sourceIndex = sourceIndex;

		this.buffer32 = new DataView(new ArrayBuffer(25000));
		this.buffer16 = new DataView(new ArrayBuffer(25000));
		this.buffer8 = new DataView(new ArrayBuffer(25000));
	}

	skip(bytes: number) {
		this.sourceIndex += bytes;
	}

	allocate32(words: number) {
		this.index32 += words * 4;
	}

	allocate16(words: number) {
		this.index16 += words * 2;
	}

	allocate8(words: number) {
		this.index8 += words * 1;
	}

	copyInto32(count: number) {
		for (let i = 0; i < count; i++) {
			this.buffer32.setUint32(this.index32 + i * 4, this.sourceView.getUint32(this.sourceIndex + i * 4, true), true);
		}

		this.sourceIndex += count * 4;
		this.index32 += count * 4;
	}

	copyInto16(count: number) {
		for (let i = 0; i < count ; i++) {
			this.buffer16.setUint16(this.index16 + i * 2, this.sourceView.getUint16(this.sourceIndex + i * 2, true), true);
		}

		this.sourceIndex += count * 2;
		this.index16 += count * 2;
	}

	copyInto8(count: number) {
		for (let i = 0; i < count * 1; i++) {
			this.buffer8.setUint8(this.index8 + i * 1, this.sourceView.getUint8(this.sourceIndex + i * 1));
		}

		this.sourceIndex += count * 1;
		this.index8 += count * 1;
	}

	readS32(storeIndex = this.index32 / 4) {
		let val = this.sourceView.getInt32(this.sourceIndex, true);
		this.sourceIndex += 4;
		if (storeIndex !== null) {
			this.buffer32.setInt32(storeIndex * 4, val, true);
			if (storeIndex * 4 === this.index32) this.index32 += 4;
		}
		return val;
	}

	writeS32(value: number) {
		this.buffer32.setInt32(this.index32, value, true);
		this.index32 += 4;
	}

	writeU8(value: number) {
		this.buffer8.setUint8(this.index8, value);
		this.index8 += 1;
	}

	guard() {
		this.buffer32.setUint32(this.index32, this.nextGuard, true);
		this.buffer16.setUint16(this.index16, this.nextGuard, true);
		this.buffer8.setUint8(this.index8, this.nextGuard);

		this.nextGuard++;
		this.index32 += 4;
		this.index16 += 2;
		this.index8 += 1;
	}

	createBuffer() {
		// Make sure they're all a multiple of 4 long
		this.index16 = Math.ceil(this.index16 / 4) * 4;
		this.index8 = Math.ceil(this.index8 / 4) * 4;

		let buffer = new ArrayBuffer(this.index32 + this.index16 + this.index8);
		let typed = new Uint8Array(buffer);
		let index = 0;

		// Concat everything
		for (let i = 0; i < this.index32; i++) {
			typed[index++] = this.buffer32.getUint8(i);
		}
		for (let i = 0; i < this.index16; i++) {
			typed[index++] = this.buffer16.getUint8(i);
		}
		for (let i = 0; i < this.index8; i++) {
			typed[index++] = this.buffer8.getUint8(i);
		}

		return { buffer, start16: this.index32 / 4, start8: (this.index32 + this.index16) / 4 };
	}
}

/** A parser for .dts files, used for static shapes and items. Main resources are http://docs.garagegames.com/torque-3d/official/content/documentation/Artist%20Guide/Formats/dts_format.html#:~:text=DTS%20is%20the%20native%20binary,and%20(optionally)%20sequence%20data.&text=The%20DTS%20file%20format%20stores,loading%20on%20non%2DIntel%20platforms. and the Torque 3D source. */
export class DtsParser extends BinaryFileParser {
	parse(stopAfterMaterials = false): DtsFile {
		let version = this.readU16();
		let exporterVersion = this.readU16();

		let memBuffer: ArrayBuffer;
		let start32: number;
		let start16: number;
		let start8: number;

		let sequences: DtsFile["sequences"];
		let materialList: any;

		if (version < 19) {
			// We're dealing with an old DTS version; create a new buffer first.
			let result = this.readOldShape(version);
			memBuffer = result.bufferInfo.buffer;
			start32 = 0;
			start16 = result.bufferInfo.start16;
			start8 = result.bufferInfo.start8;

			sequences = result.sequences;
			materialList = result.materialList;
		} else {
			let sizeMemBuffer = this.readU32();
			memBuffer = this.buffer;
			start16 = this.readU32();
			start8 = this.readU32();
			start32 = this.index;

			this.index += sizeMemBuffer * 4;

			let numSequences = this.readS32();
			sequences = [];
			for (let i = 0; i < numSequences; i++) {
				sequences.push(this.parseSequence());
			}

			materialList = this.parseMaterialList(version);
		}

		let shape = {};
		if (!stopAfterMaterials) {
			let alloc = new Alloc(memBuffer, start32, start16, start8);
			shape = this.assembleShape(alloc, version);
		}

		let obj = {
			version,
			exporterVersion,
			sequences
		};
		obj = Object.assign(obj, materialList); // Merge in the material list
		obj = Object.assign(obj, shape); // Merge the rest of the shape data

		return obj as any; // The type is fucked anyway, just go with any.
	}

	assembleShape(alloc: Alloc, version: number) {
		let numNodes = alloc.readS32();
		let numObjects = alloc.readS32();
		let numDecals = alloc.readS32();
		let numSubShapes = alloc.readS32();
		let numIflMaterials = alloc.readS32();
		let numNodeRots: number;
		let numNodeTrans: number;
		let numNodeUniformScales: number;
		let numNodeAlignedScales: number;
		let numNodeArbitraryScales: number;
		if (version < 22) {
			numNodeRots = numNodeTrans = alloc.readS32() - numNodes;
			numNodeUniformScales = numNodeAlignedScales = numNodeArbitraryScales = 0;
		} else {
			numNodeRots = alloc.readS32();
			numNodeTrans = alloc.readS32();
			numNodeUniformScales = alloc.readS32();
			numNodeAlignedScales = alloc.readS32();
			numNodeArbitraryScales = alloc.readS32();
		}
		let numGroundFrames = 0;
		if (version > 23) numGroundFrames = alloc.readS32();
		let numObjectStates = alloc.readS32();
		let numDecalStates = alloc.readS32();
		let numTriggers = alloc.readS32();
		let numDetails = alloc.readS32();
		let numMeshes = alloc.readS32();
		let numSkins = 0; // Skins are apparently deprecated
		if (version < 23) numSkins = alloc.readS32();
		let numNames = alloc.readS32();
		let smallestVisibleSize = alloc.readF32();
		let smallestVisibleDL = alloc.readS32();
		let skipDL = Math.min(smallestVisibleSize, 0 /* "smNumSkipLoadDetails" */);

		alloc.guard();

		let radius = alloc.readF32();
		let tubeRadius = alloc.readF32();
		let center = alloc.readPoint3F();
		let bounds = alloc.readBoxF();

		alloc.guard();

		let nodeIndex = 0;
		let nodes = Array(numNodes).fill(null).map(() => {
			return {
				index: nodeIndex++,
				nameIndex: alloc.readS32(),
				parentIndex: alloc.readS32(),
				firstObject: alloc.readS32(),
				firstChild: alloc.readS32(),
				nextSibling: alloc.readS32()
			};
		});

		alloc.guard();

		let objects = Array(numObjects).fill(null).map(() => {
			return {
				nameIndex: alloc.readS32(),
				numMeshes: alloc.readS32(),
				startMeshIndex: alloc.readS32(),
				nodeIndex: alloc.readS32(),
				nextSibling: alloc.readS32(),
				firstDecal: alloc.readS32()
			};
		});

		alloc.guard();

		let decals = Array(numDecals).fill(null).map(() => {
			return {
				nameIndex: alloc.readS32(),
				numMeshes: alloc.readS32(),
				startMeshIndex: alloc.readS32(),
				objectIndex: alloc.readS32(),
				nextSibling: alloc.readS32()
			};
		});

		alloc.guard();

		let iflMaterials = Array(numIflMaterials).fill(null).map(() => {
			return {
				nameIndex: alloc.readS32(),
				materialSlot: alloc.readS32(),
				firstFrame: alloc.readS32(),
				firstFrameOffTimeIndex: alloc.readS32(),
				numFrames: alloc.readS32()
			};
		});

		alloc.guard();

		let subShapeFirstNode = Array(numSubShapes).fill(null).map(() => alloc.readS32());
		let subShapeFirstObject = Array(numSubShapes).fill(null).map(() => alloc.readS32());
		let subShapeFirstDecal = Array(numSubShapes).fill(null).map(() => alloc.readS32());

		alloc.guard();

		let subShapeNumNodes = Array(numSubShapes).fill(null).map(() => alloc.readS32());
		let subShapeNumObjects = Array(numSubShapes).fill(null).map(() => alloc.readS32());
		let subShapeNumDecals = Array(numSubShapes).fill(null).map(() => alloc.readS32());

		alloc.guard();

		//let subShapeFirstTranslucentObject = Array(numSubShapes).fill(null).map(() => alloc.getS32());
		// Works only without? Confus!!

		let defaultRotations = Array(numNodes).fill(null).map(() => alloc.readQuat16());
		let defaultTranslations = Array(numNodes).fill(null).map(() => alloc.readPoint3F());
		let nodeRotations = Array(numNodeRots).fill(null).map(() => alloc.readQuat16());
		let nodeTranslations = Array(numNodeTrans).fill(null).map(() => alloc.readPoint3F());

		alloc.guard();

		let nodeUniformScales: any[] = [];
		let nodeAlignedScales: any[] = [];
		let nodeArbScaleFactors: any[] = [];
		let nodeArbScaleRots: any[] = [];

		if (version > 21) {
			nodeUniformScales = Array(numNodeUniformScales).fill(null).map(() => alloc.readF32());
			nodeAlignedScales = Array(numNodeAlignedScales).fill(null).map(() => alloc.readPoint3F());
			nodeArbScaleFactors = Array(numNodeArbitraryScales).fill(null).map(() => alloc.readPoint3F());
			nodeArbScaleRots = Array(numNodeArbitraryScales).fill(null).map(() => alloc.readQuat16());

			alloc.guard();
		}

		// Super old version stuff would go here

		let groundTranslations = Array(numGroundFrames).fill(null).map(() => alloc.readPoint3F());
		let groundRotations = Array(numGroundFrames).fill(null).map(() => alloc.readQuat16());

		if (version > 23) alloc.guard(); // 😂

		let objectStates = Array(numObjectStates).fill(null).map(() => {
			return {
				vis: alloc.readF32(),
				frameIndex: alloc.readS32(),
				matFrame : alloc.readS32()
			};
		});

		alloc.guard();

		let decalStates = Array(numDecalStates).fill(null).map(() => alloc.readS32());

		alloc.guard();

		let triggers = Array(numTriggers).fill(null).map(() => {
			return {
				state: alloc.readU32(),
				pos: alloc.readF32()
			};
		});

		alloc.guard();

		let details = Array(numDetails).fill(null).map(() => {
			return {
				nameIndex: alloc.readS32(),
				subShapeNum: alloc.readS32(),
				objectDetailNum: alloc.readS32(),
				size: alloc.readF32(),
				averageError: alloc.readF32(),
				maxError: alloc.readF32(),
				polyCount: alloc.readS32()
			};
		});

		alloc.guard();

		let meshes: DtsFile["meshes"] = [];

		for (let i = 0; i < numMeshes; i++) {
			let type = alloc.readU32();

			if (type === MeshType.Null) {
				// Null meshes are simply skipped
				meshes.push(null);
				continue;
			}

			alloc.guard();

			let numFrames = alloc.readS32();
			let numMatFrames = alloc.readS32();
			let parentMesh = alloc.readS32();
			let bounds = alloc.readBoxF();
			let center = alloc.readPoint3F();
			let radius = alloc.readF32();

			let numVerts = alloc.readS32();
			let verts = (parentMesh < 0)? Array(numVerts).fill(null).map(() => alloc.readPoint3F()) : meshes[parentMesh].verts;
			let numTVerts = alloc.readS32();
			let tverts = (parentMesh < 0)? Array(numTVerts).fill(null).map(() => alloc.readPoint2F()) : meshes[parentMesh].tverts;

			let norms = (parentMesh < 0)? Array(numVerts).fill(null).map(() => alloc.readPoint3F()) : meshes[parentMesh].norms;
			let encodedNorms: number[] = [];
			if (version > 21) encodedNorms = (parentMesh < 0)? Array(numVerts).fill(null).map(() => alloc.readU8()) : meshes[parentMesh].encodedNorms;
			let numPrimitives = alloc.readS32();
			let primitives = Array(numPrimitives).fill(null).map(() => {
				return {
					start: alloc.readU16(),
					numElements: alloc.readU16(),
					matIndex: alloc.readU32()
				};
			});
			let numIndices = alloc.readS32();
			let indices = Array(numIndices).fill(null).map(() => alloc.readS16());
			let numMergeIndices = alloc.readS32();
			let mergeIndices = Array(numMergeIndices).fill(null).map(() => alloc.readS16());
			let vertsPerFrame = alloc.readS32();
			let flags = alloc.readS32();

			alloc.guard();

			let mesh: DtsFile["meshes"][number] = {
				type,
				numFrames,
				numMatFrames,
				parentMesh,
				bounds,
				center,
				radius,
				verts,
				tverts,
				norms,
				encodedNorms,
				primitives,
				indices,
				mergeIndices,
				vertsPerFrame,
				flags
			};

			if (type === MeshType.Skin) {
				// A skinned mesh comes with additional properties describing the bones and skin of the mesh.

				let numInitialVerts = alloc.readS32();
				let initialVerts = Array(numInitialVerts).fill(null).map(() => alloc.readPoint3F());
				let initialNorms = Array(numInitialVerts).fill(null).map(() => alloc.readPoint3F());
				let encodedNorms = Array(numInitialVerts).fill(null).map(() => alloc.readU8());
				let numInitialTransforms = alloc.readS32();
				let initialTransforms = Array(numInitialTransforms).fill(null).map(() => alloc.readMatrixF());

				let numVertIndices = alloc.readS32();
				let vertIndices = Array(numVertIndices).fill(null).map(() => alloc.readS32());
				let boneIndices = Array(numVertIndices).fill(null).map(() => alloc.readS32());
				let weights = Array(numVertIndices).fill(null).map(() => alloc.readF32());
				let numNodeIndices = alloc.readS32();
				let nodeIndices = Array(numNodeIndices).fill(null).map(() => alloc.readS32());

				mesh.verts = initialVerts;
				mesh.norms = initialNorms;
				mesh.encodedNorms = encodedNorms;
				mesh.initialTransforms = initialTransforms;
				mesh.vertIndices = vertIndices;
				mesh.boneIndices = boneIndices;
				mesh.weights = weights;
				mesh.nodeIndices = nodeIndices;

				alloc.guard();
			}

			meshes.push(mesh);
		}

		alloc.guard();

		let names = [];
		for (let i = 0; i < numNames; i++) {
			let str = "";

			while (true) {
				let newCharCode = alloc.readU8();
				if (newCharCode === 0) break; // Null-terminated string

				str += String.fromCharCode(newCharCode);
			}

			names.push(str);
		}

		alloc.guard();

		let alphaIn = new Array(numDetails).fill(null).map(() => alloc.readF32());
		let alphaOut = new Array(numDetails).fill(null).map(() => alloc.readF32());

		return {
			smallestVisibleSize,
			radius,
			tubeRadius,
			center,
			bounds,
			nodes,
			objects,
			decals,
			iflMaterials,
			subShapeFirstNode,
			subShapeFirstObject,
			subShapeFirstDecal,
			subShapeNumNodes,
			subShapeNumObjects,
			subShapeNumDecals,
			defaultRotations,
			defaultTranslations,
			nodeRotations,
			nodeTranslations,
			nodeUniformScales,
			nodeAlignedScales,
			nodeArbScaleFactors,
			nodeArbScaleRots,
			groundTranslations,
			groundRotations,
			objectStates,
			decalStates,
			triggers,
			details,
			meshes,
			names,
			alphaIn,
			alphaOut
		};
	}

	parseSequence() {
		/// A Sequence holds all the information necessary to perform a particular animation (sequence).
		///
		/// Sequences index a range of keyframes. Keyframes are assumed to be equally spaced in time.
		///
		/// Each node and object is either a member of the sequence or not.  If not, they are set to
		/// default values when we switch to the sequence unless they are members of some other active sequence.
		/// Blended sequences "add" a transform to the current transform of a node.  Any object animation of
		/// a blended sequence over-rides any existing object state.  Blended sequences are always
		/// applied after non-blended sequences.

		let nameIndex = this.readS32();
		let flags = this.readU32();
		let numKeyframes = this.readS32();
		let duration = this.readF32();
		let priority = this.readS32();
		let firstGroundFrame = this.readS32();
		let numGroundFrames = this.readS32();
		let baseRotation = this.readS32();
		let baseTranslation = this.readS32();
		let baseScale = this.readS32();
		let baseObjectState = this.readS32();
		let baseDecalState = this.readS32();
		let firstTrigger = this.readS32();
		let numTriggers = this.readS32();
		let toolBegin = this.readF32();

		let rotationMatters = this.readBitSet();
		let translationMatters = this.readBitSet();
		let scaleMatters = this.readBitSet();
		let decalMatters = this.readBitSet();
		let iflMatters = this.readBitSet();
		let visMatters = this.readBitSet();
		let frameMatters = this.readBitSet();
		let matFrameMatters = this.readBitSet();

		return {
			nameIndex,
			flags,
			numKeyframes,
			duration,
			priority,
			firstGroundFrame,
			numGroundFrames,
			baseRotation,
			baseTranslation,
			baseScale,
			baseObjectState,
			baseDecalState,
			firstTrigger,
			numTriggers,
			toolBegin,
			rotationMatters,
			translationMatters,
			scaleMatters,
			decalMatters,
			iflMatters,
			visMatters,
			frameMatters,
			matFrameMatters
		};
	}

	/** Parses a Torque MaterialList. */
	parseMaterialList(version: number) {
		let matStreamType = this.readS8(); // Should be 1 always
		let numMaterials = this.readS32();
		let matNames = Array(numMaterials).fill(null).map(x => this.readString());
		let matFlags = Array(numMaterials).fill(null).map(x => this.readU32());
		let matReflectanceMaps = Array(numMaterials).fill(null).map(x => this.readS32());
		let matBumpMaps = Array(numMaterials).fill(null).map(x => this.readS32());
		let matDetailMaps = Array(numMaterials).fill(null).map(x => this.readS32());
		if (version === 25) Array(numMaterials).fill(null).map(x => this.readS32()); // dummy
		let matDetailScales = Array(numMaterials).fill(null).map(x => this.readF32());
		let matReflectance = Array(numMaterials).fill(null).map(x => this.readF32());

		return {
			matNames,
			matFlags,
			matReflectanceMaps,
			matBumpMaps,
			matDetailMaps,
			matDetailScales,
			matReflectance
		};
	}

	readBitSet() {
		this.index += 4; // dummy
		let numWords = this.readS32();
		let words = [];

		for (let i = 0; i < numWords; i++) {
			words.push(this.readU32());
		}

		return words;
	}

	/** Reads an old shape. Creates a new buffer in the new DTS format that is then fed into the regular parser. Refer to the TGE source for more detail. */
	readOldShape(version: number) {
		let oldAlloc = new OldAlloc(this.view, this.index);

		oldAlloc.allocate32(15);
		oldAlloc.guard();

		oldAlloc.copyInto32(1); // Radius
		oldAlloc.copyInto32(1); // Tube radius
		oldAlloc.copyInto32(3); // Center
		oldAlloc.copyInto32(6); // Bounds

		oldAlloc.guard();

		let numNodes = oldAlloc.readS32(0);
		for (let i = 0; i < numNodes; i++) {
			oldAlloc.copyInto32(2);
			oldAlloc.allocate32(3);
		}

		oldAlloc.guard();

		let numObjects = oldAlloc.readS32(1);
		for (let i = 0; i < numObjects; i++) {
			oldAlloc.copyInto32(4);
			oldAlloc.allocate32(2);
		}

		oldAlloc.guard();

		let numDecals = oldAlloc.readS32(2);
		for (let i = 0; i < numDecals; i++) {
			oldAlloc.copyInto32(4);
			oldAlloc.allocate32(1);
		}

		oldAlloc.guard();

		let numIflMaterials = oldAlloc.readS32(4);
		for (let i = 0; i < numIflMaterials; i++) {
			oldAlloc.copyInto32(2);
			oldAlloc.allocate32(3);
		}

		oldAlloc.guard();

		let numSubShapes = oldAlloc.readS32(3);
		let subShapeFirstStart = oldAlloc.index32;
		oldAlloc.copyInto32(numSubShapes); // subShapeFirstNode
		oldAlloc.skip(4); // toss
		oldAlloc.copyInto32(numSubShapes); // subShapeFirstObject
		oldAlloc.skip(4); // toss
		oldAlloc.copyInto32(numSubShapes); // subShapeFirstDecal

		oldAlloc.guard();

		let subShapeNumStart = oldAlloc.index32;
		oldAlloc.allocate32(3 * numSubShapes);

		oldAlloc.guard();

		// compute subShapeNum* vectors
		let prev, first;
		for (let i = 0; i < 3; i++) {
			prev = ((i === 0) ? numNodes : (i === 1 ? numObjects : numDecals));
			for (let j = numSubShapes-1; j >= 0; j--) {
				first = oldAlloc.buffer32.getInt32(subShapeFirstStart + j * 4, true);
				oldAlloc.buffer32.setInt32(subShapeNumStart + j * 4, prev - first, true);
				prev = first;
			}

			subShapeFirstStart += numSubShapes;
			subShapeNumStart += numSubShapes;
		}

		let numNodeStates = oldAlloc.readS32(5);
		let nodeStateStart32 = oldAlloc.index32;
		let nodeStateStart16 = oldAlloc.index16;
		for (let i = 0; i < numNodeStates; i++) {
			oldAlloc.copyInto16(4); // read Quat16....rotation
			oldAlloc.copyInto32(3); // read Point3F...translation
		}

		oldAlloc.guard();

		let numObjectStates = oldAlloc.readS32(6);
		let objectStateStart = oldAlloc.index32;
		oldAlloc.copyInto32(numObjectStates * 3);

		oldAlloc.guard();

		let numDecalStates = oldAlloc.readS32(7);
		let decalStateStart = oldAlloc.index32;
		oldAlloc.copyInto32(numDecalStates);

		oldAlloc.guard();

		let numTriggers = oldAlloc.readS32(8);
		oldAlloc.copyInto32(numTriggers * 2);

		oldAlloc.guard();

		let numDetails = oldAlloc.readS32(9);
		for (let i = 0; i < numDetails; i++) {
			oldAlloc.copyInto32(4);
			oldAlloc.allocate32(3);
		}

		// There's some added detail filling-up code here, but we don't use these anyways. Screw it.

		oldAlloc.guard();

		this.index = oldAlloc.sourceIndex;
		let numSequences = this.readS32();
		let sequences: DtsFile["sequences"] = [];
		for (let i = 0; i < numSequences; i++) {
			let sequence = this.parseSequence();
			sequences.push(sequence);
		}

		oldAlloc.sourceIndex = this.index;
		let numMeshes = oldAlloc.readS32(10);
		for (let i = 0; i < numMeshes; i++) {
			let meshType = oldAlloc.readS32();
			this.readAllocMesh(oldAlloc, meshType);
		}

		oldAlloc.guard();

		let numNames = oldAlloc.readS32(12);
		for (let i = 0; i < numNames; i++) {
			let length = oldAlloc.readS32(null);
			oldAlloc.copyInto8(length);
			oldAlloc.writeU8(0); // end the string
		}

		oldAlloc.guard();

		let materialList: any = null;
		this.index = oldAlloc.sourceIndex;
		let gotList = this.readS32();
		if (gotList) {
			materialList = this.parseMaterialList(version);
		}
		oldAlloc.sourceIndex = this.index;

		// Note: There would still be some skinned mesh or whatever code following this, but really, that's totally unnecessary. To prevent stupid "read out of range" errors when reading this buffer, we just add some extra bit to the end. Done.
		oldAlloc.allocate32(16);

		return {
			bufferInfo: oldAlloc.createBuffer(),
			sequences: sequences,
			materialList: materialList
		};
	}

	readAllocMesh(oldAlloc: OldAlloc, meshType: number) {
		if (meshType === MeshType.Null) return;

		oldAlloc.guard();

		// numFrames, numMatFrames
		oldAlloc.copyInto32(2);

		// parentMesh
		oldAlloc.writeS32(-1);

		// allocate memory for mBounds,mCenter, and mRadius...just filler, will be computed later
		oldAlloc.allocate32(10);

		// read in verts
		let numVerts = oldAlloc.readS32();
		oldAlloc.copyInto32(numVerts * 3);

		// read in tverts
		let numTverts = oldAlloc.readS32();
		oldAlloc.copyInto32(numTverts * 2);

		// read in normals
		let numNormals = oldAlloc.readS32(null); // we could assume same as verts, but apparently in file.
		oldAlloc.copyInto32(numNormals * 3);

		// read in primitives
		let numPrimitives = oldAlloc.readS32();
		for (let i = 0; i < numPrimitives; i++) {
			oldAlloc.copyInto16(2);
			oldAlloc.copyInto32(1);
		}

		// read in indices
		let numIndices = oldAlloc.readS32();
		oldAlloc.copyInto16(numIndices);

		// mergeIndices...none
		oldAlloc.writeS32(0);

		// vertsPerFrame, flags
		oldAlloc.copyInto32(2);

		oldAlloc.guard();

		if (meshType === MeshType.Skin) {
			let numInitialVerts = oldAlloc.readS32();
			oldAlloc.copyInto32(numInitialVerts * 3);

			let numInitialNorms = oldAlloc.readS32(null); // we assume same as verts
			oldAlloc.copyInto32(numInitialNorms * 3);

			let numInitialTransforms = oldAlloc.readS32();
			oldAlloc.copyInto32(numInitialTransforms * 16);

			let numVertIndices = oldAlloc.readS32();
			oldAlloc.copyInto32(numVertIndices);

			let numBoneIndices = oldAlloc.readS32(null);
			oldAlloc.copyInto32(numBoneIndices);

			let weightStart = oldAlloc.index32;
			oldAlloc.allocate32(numBoneIndices); // this is memory for the weights

			let numNodeIndices = oldAlloc.readS32();
			oldAlloc.copyInto32(numNodeIndices);
			let returnToIndex = oldAlloc.index32;

			let numWeights = oldAlloc.readS32(null);
			oldAlloc.index32 = weightStart;
			oldAlloc.copyInto32(numWeights);
			oldAlloc.index32 = returnToIndex;

			oldAlloc.guard();
		}
	}

	static cachedFilePromises = new Map<string, Promise<DtsFile>>();
	static cachedFiles = new Map<string, DtsFile>();

	/** Loads and parses a .dts file. Returns a cached version if already loaded. */
	static async loadFile(path: string) {
		await this.cachedFilePromises.get(path);
		if (this.cachedFiles.get(path)) return this.cachedFiles.get(path);

		let promise = (async () => {
			let blob = await ResourceManager.loadResource(path);
			if (!blob) {
				throw new Error("Missing DTS resource: " + path);
			}

			let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(blob);
			let parser = new DtsParser(arrayBuffer);

			let result = parser.parse();
			this.cachedFiles.set(path, result);
			this.cachedFilePromises.delete(path);

			return result;
		})();
		this.cachedFilePromises.set(path, promise);

		return promise;
	}
}