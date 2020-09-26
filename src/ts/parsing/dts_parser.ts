import { BinaryFileParser, Point2F, Point3F, Box3F } from "./binary_file_parser";
import { ResourceManager } from "../resources";

export enum MeshType {
	Standard = 0,
	Skin = 1,
	Decal = 2,
	Sorted = 3,
	Null = 4
}

export interface Quat16 {
	x: number,
	y: number,
	z: number,
	w: number
}

type BitSet = number[];

export interface DtsFile {
	version: number,
	exporterVersion: number,
	smallestVisibleSize: number,
	radius: number,
	tubeRadius: number,
	center: Point3F,
	bounds: Box3F,
	nodes: {
		index: number, // Not actually in the spec, but helpful
		nameIndex: number,
		parentIndex: number,
		firstObject: number,
		firstChild: number,
		nextSibling: number
	}[],
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
		// SkinMesh stuff:
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
	defaultRotations: Quat16[],
	defaultTranslations: Point3F[],
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
		this.index16 = start32 + start16*4;
		this.index8 = start32 + start8*4;
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

	guard() {
		let guard32 = this.readU32();
		let guard16 = this.readU16();
		let guard8 = this.readU8();

		if (!(guard32 === guard16 && guard16 === guard8 && guard8 === this.lastGuardValue++)) {
			throw new Error("Guard fail!");
		}
	}
}

export class DtsParser extends BinaryFileParser {
    parse(): DtsFile {
		let version = this.readU16();
		let exporterVersion = this.readU16();

		// Usually an if here saying (if version < 19) but yeah it's 24 so who cares

		let sizeMemBuffer = this.readU32();
		let startU16 = this.readU32();
		let startU8 = this.readU32();

		let alloc = new Alloc(this.buffer, this.index, startU16, startU8);
		let shape = this.assembleShape(alloc);

		this.index += sizeMemBuffer * 4;

		let numSequences = this.readS32();
		let sequences = [];
		for (let i = 0; i < numSequences; i++) {
			sequences.push(this.parseSequence());
		}

		let matStreamType = this.readS8(); // Should be 1
		let numMaterials = this.readS32();
		let matNames = Array(numMaterials).fill(null).map(x => this.readString());
		let matFlags = Array(numMaterials).fill(null).map(x => this.readU32());
		let matReflectanceMaps = Array(numMaterials).fill(null).map(x => this.readS32());
		let matBumpMaps = Array(numMaterials).fill(null).map(x => this.readS32());
		let matDetailMaps = Array(numMaterials).fill(null).map(x => this.readS32());
		if (version === 25) Array(numMaterials).fill(null).map(x => this.readS32()); // dummy
		let matDetailScales = Array(numMaterials).fill(null).map(x => this.readF32());
		let matReflectance = Array(numMaterials).fill(null).map(x => this.readF32());

		let obj = {
			version,
			exporterVersion,
			sequences,
			matNames,
			matFlags,
			matReflectanceMaps,
			matBumpMaps,
			matDetailMaps,
			matDetailScales,
			matReflectance
		};
		obj = Object.assign(obj, shape);

		return obj as typeof obj & typeof shape;
	}

	assembleShape(alloc: Alloc) {
		let numNodes = alloc.readS32();
		let numObjects = alloc.readS32();
		let numDecals = alloc.readS32();
		let numSubShapes = alloc.readS32();
		let numIflMaterials = alloc.readS32();
		let numNodeRots = alloc.readS32();
		let numNodeTrans = alloc.readS32();
		let numNodeUniformScales = alloc.readS32();
		let numNodeAlignedScales = alloc.readS32();
		let numNodeArbitraryScales = alloc.readS32();
		let numGroundFrames = alloc.readS32();
		let numObjectStates = alloc.readS32();
		let numDecalStates = alloc.readS32();
		let numTriggers = alloc.readS32();
		let numDetails = alloc.readS32();
		let numMeshes = alloc.readS32();
		let numSkins = 0;
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

		let nodeUniformScales = Array(numNodeUniformScales).fill(null).map(() => alloc.readF32());
		let nodeAlignedScales = Array(numNodeAlignedScales).fill(null).map(() => alloc.readPoint3F());
		let nodeArbScaleFactors = Array(numNodeArbitraryScales).fill(null).map(() => alloc.readPoint3F());
		let nodeArbScaleRots = Array(numNodeArbitraryScales).fill(null).map(() => alloc.readQuat16());

		alloc.guard();

		// Old version stuff would go here

		let groundTranslations = Array(numGroundFrames).fill(null).map(() => alloc.readPoint3F());
		let groundRotations = Array(numGroundFrames).fill(null).map(() => alloc.readQuat16());

		alloc.guard();

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

		let meshes = Array(numMeshes).fill(null).map(() => {
			let type = alloc.readU32();
			
			if (type === MeshType.Null) {
				return null;
			}
			
			alloc.guard();

			let numFrames = alloc.readS32();
			let numMatFrames = alloc.readS32();
			let parentMesh = alloc.readS32();
			let bounds = alloc.readBoxF();
			let center = alloc.readPoint3F();
			let radius = alloc.readF32();
			let numVerts = alloc.readS32();
			let verts = Array(numVerts).fill(null).map(() => alloc.readPoint3F());
			let numTVerts = alloc.readS32();
			let tverts = Array(numTVerts).fill(null).map(() => alloc.readPoint2F());

			let norms = Array(numVerts).fill(null).map(() => alloc.readPoint3F());
			let encodedNorms = Array(numVerts).fill(null).map(() => alloc.readU8());
			let numPrimitives = alloc.readS32();
			let primitives = Array(numPrimitives).fill(null).map(() => {
				return {
					start: alloc.readU16(),
					numElements: alloc.readU16(),
					matIndex: (alloc.readU32() & 0x00ffffff)
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
				let numInitialVerts = alloc.readS32();
				let initialVerts = Array(numInitialVerts).fill(null).map(() => alloc.readPoint3F());
				let norms = Array(numInitialVerts).fill(null).map(() => alloc.readPoint3F());
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
				mesh.norms = norms;
				mesh.encodedNorms = encodedNorms;
				mesh.initialTransforms = initialTransforms;
				mesh.vertIndices = vertIndices;
				mesh.boneIndices = boneIndices;
				mesh.weights = weights;
				mesh.nodeIndices = nodeIndices;

				alloc.guard();
			}

			return mesh;
		});

		alloc.guard();

		let names = [];
		for (let i = 0; i < numNames; i++) {
			let str = "";

			while (true) {
				let newCharCode = alloc.readU8();
				if (newCharCode === 0) break;

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

	readBitSet() {
		this.index += 4; // dummy
		let numWords = this.readS32();
		let words = [];

		for (let i = 0; i < numWords; i++) {
			words.push(this.readU32());
		}

		return words;
	}

	static cachedFiles = new Map<string, Promise<DtsFile>>();
	
	static loadFile(path: string) {
		if (this.cachedFiles.get(path)) return this.cachedFiles.get(path);

		let promise = new Promise<DtsFile>(async (resolve) => {
			let blob = await ResourceManager.loadResource(path);
			let arrayBuffer = await blob.arrayBuffer();
			let parser = new DtsParser(arrayBuffer);
	
			let result = parser.parse();
			resolve(result);
		});
		this.cachedFiles.set(path, promise);

		return promise;
	}
}