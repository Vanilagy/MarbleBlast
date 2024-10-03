import { DtsFile, MeshType, DtsParser } from "./parsing/dts_parser";
import { ResourceManager } from "./resources";
import { IflParser } from "./parsing/ifl_parser";
import { Util } from "./util";
import { TimeState, Level } from "./level";
import { INTERIOR_DEFAULT_RESTITUTION, INTERIOR_DEFAULT_FRICTION } from "./interior";
import { MissionElement } from "./parsing/mis_parser";
import { Group } from "./rendering/group";
import { Material } from "./rendering/material";
import { Geometry } from "./rendering/geometry";
import { Mesh } from "./rendering/mesh";
import { Texture } from "./rendering/texture";
import { RigidBody, RigidBodyType } from "./physics/rigid_body";
import { CollisionShape, ConvexHullCollisionShape } from "./physics/collision_shape";
import { Collision } from "./physics/collision";
import { Vector3 } from "./math/vector3";
import { Quaternion } from "./math/quaternion";
import { Matrix4 } from "./math/matrix4";
import { Box3 } from "./math/box3";
import { BlendingType } from "./rendering/renderer";

/** A hardcoded list of shapes that should only use envmaps as textures. */
const DROP_TEXTURE_FOR_ENV_MAP = new Set(['shapes/items/superjump.dts', 'shapes/items/antigravity.dts']);

interface MaterialInfo {
	textures: Texture[]
}

/** Data necessary for updating skinned meshes. */
interface SkinMeshData {
	meshIndex: number,
	vertices: Vector3[],
	normals: Vector3[],
	mesh: Mesh
}

interface ColliderInfo {
	generateShape: (scale: Vector3) => CollisionShape,
	body: RigidBody,
	transform: Matrix4
}

/** Data that is shared with other shapes of the same type. */
export interface SharedShapeData {
	materials: Material[],
	geometries: Geometry[],
	geometryMatrixIndices: number[],
	collisionGeometries: Set<Geometry>,
	nodeTransforms: Matrix4[],
	rootGraphNodes: GraphNode[],
	skinnedMeshIndex: number
}

enum MaterialFlags {
	S_Wrap = 1 << 0,
	T_Wrap = 1 << 1,
	Translucent = 1 << 2,
	Additive = 1 << 3,
	Subtractive = 1 << 4,
	SelfIlluminating = 1 << 5,
	NeverEnvMap = 1 << 6,
	NoMipMap = 1 << 7,
	MipMap_ZeroBorder  = 1 << 8,
	IflMaterial = 1 << 27,
	IflFrame = 1 << 28,
	DetailMapOnly = 1 << 29,
	BumpMapOnly = 1 << 30,
	ReflectanceMapOnly = 1 << 31
}

enum TSDrawPrimitive {
	Triangles = 0 << 30,
	Strip = 1 << 30,
	Fan = 2 << 30,
	Indexed = 1 << 29,
	NoMaterial = 1 << 28,
	MaterialMask = ~(TSDrawPrimitive.Strip | TSDrawPrimitive.Fan | TSDrawPrimitive.Triangles | TSDrawPrimitive.Indexed | TSDrawPrimitive.NoMaterial),
	TypeMask = TSDrawPrimitive.Strip | TSDrawPrimitive.Fan | TSDrawPrimitive.Triangles
}

/** Used to model the graph of DTS nodes. */
export interface GraphNode {
	index: number,
	node: DtsFile["nodes"][number],
	children: GraphNode[],
	parent?: GraphNode
}

/** Represents an object created from a DTS file. This is either a static object like the start pad or a sign, or an item like gems or powerups. */
export class Shape {
	/** The unique id of this shape. */
	id: number;
	level: Level;
	srcElement: MissionElement;
	dtsPath: string;
	colliderDtsPath: string;
	dts: DtsFile;
	colliderDts: DtsFile;
	directoryPath: string;
	/** Whether or not this shape is being used as a TSStatic. TSStatic are static, non-moving shapes that basically can't do anything. */
	isTSStatic = false;
	hasBeenRendered = false;

	group: Group;
	meshes: Mesh[] = [];
	bodies: RigidBody[];
	/** Whether the marble can physically collide with this shape. */
	collideable = true;
	/** Not physical colliders, but a list bodies that overlap is checked with. This is used for things like force fields. */
	colliders: ColliderInfo[] = [];
	/** For each shape, the untransformed vertices of their convex hull geometry. */
	shapeVertices = new Map<CollisionShape, Vector3[]>();
	isCurrentlyColliding = false;

	worldPosition = new Vector3();
	worldOrientation = new Quaternion();
	worldScale = new Vector3();
	worldMatrix = new Matrix4();

	/** Can be used to override certain material names. */
	matNamesOverride: Record<string, string | Texture> = {};
	materials: Material[];
	/** Stores information used to animate materials. */
	materialInfo: WeakMap<Material, MaterialInfo>;
	castShadows = false;

	/** Stores all nodes from the node tree. */
	graphNodes: GraphNode[];
	/** Stores only the roots of the tree (no parent). */
	rootGraphNodes: GraphNode[] = [];
	/** One transformation matrix per DTS node */
	nodeTransforms: Matrix4[] = [];
	skinMeshInfo: SkinMeshData;

	showSequences = true;
	/** If the element has non-visual sequences, then these should be updated every simulation tick as well. */
	hasNonVisualSequences = false;
	/** Can be used to override the current keyframe of a sequence. */
	sequenceKeyframeOverride = new WeakMap<DtsFile["sequences"][number], number>();
	/** Stores the last-used keyframe of a sequence to reduce computational load. */
	lastSequenceKeyframes = new WeakMap<DtsFile["sequences"][number], number>();

	currentOpacity = 1;
	restitution = INTERIOR_DEFAULT_RESTITUTION;
	friction = INTERIOR_DEFAULT_FRICTION;
	/** Whether or not to continuously spin. */
	ambientRotate = false;
	ambientSpinFactor = -1 / 3000 * Math.PI * 2;
	/** Whether or not collision meshes will receive shadows. */
	receiveShadows = true;
	materialPostprocessor: (mat: Material) => void = null;

	/** Same shapes with a different shareId cannot share data. */
	shareId = 0;
	/** Whether or not to share the same node transforms with other shapes of the same type. */
	shareNodeTransforms = true;
	/** Whether or not to share the same materials with other shapes of the same type. */
	shareMaterials = true;
	/** A shape is a master if it was the first shape to run init() amongst those that share data with it. */
	isMaster = false;

	sounds: string[] = [];

	/** Shapes with identical share hash can share data. */
	getShareHash() {
		return this.dtsPath + ' ' + this.constructor.name + ' ' + this.shareId;
	}

	getFullNamesOf(path: string) {
		if (this.level) {
			// This falls back to the main base path when it can't find the file in the mission itself
			return this.level.mission.getFullNamesOf(path, true);
		} else {
			return ResourceManager.getFullNamesOf(path);
		}
	}

	getTexture(path: string) {
		if (this.level) {
			// This falls back to the main base path when it can't find the texture in the mission itself
			return this.level.mission.getTexture(path, true);
		} else {
			return ResourceManager.getTexture(path);
		}
	}

	async init(level?: Level, srcElement: MissionElement = null) {
		this.id = srcElement?._id ?? 0;
		this.level = level;
		this.srcElement = srcElement;
		this.colliderDtsPath ??= this.dtsPath;
		this.dts = await ((this.level)? this.level.mission.getDts(this.dtsPath) : DtsParser.loadFile(ResourceManager.mainDataPath + this.dtsPath));
		this.colliderDts = (this.dtsPath === this.colliderDtsPath)? this.dts : await ((this.level)? this.level.mission.getDts(this.colliderDtsPath) : DtsParser.loadFile(ResourceManager.mainDataPath + this.colliderDtsPath));
		this.directoryPath = this.dtsPath.slice(0, this.dtsPath.lastIndexOf('/'));
		this.group = new Group();
		this.bodies = [];
		this.materials = [];
		this.materialInfo = new WeakMap();

		// Check if there's already shared data from another shape of the same type
		let sharedDataPromise = this.level?.sharedShapeData.get(this.getShareHash());
		let sharedData: SharedShapeData;

		if (sharedDataPromise) {
			// If so, (maybe) wait for that data to complete initiation (might already be done)
			sharedData = await sharedDataPromise;
		} else {
			// If we're here, we're the first shape of this type, so let's prepare the shared data
			let resolveFunc: (data: SharedShapeData) => any;
			if (this.level) {
				sharedDataPromise = new Promise<SharedShapeData>((resolve) => resolveFunc = resolve);
				this.level.sharedShapeData.set(this.getShareHash(), sharedDataPromise);
			}

			for (let i = 0; i < this.dts.nodes.length; i++) this.nodeTransforms.push(new Matrix4());

			await this.computeMaterials();

			// Build the node tree
			let graphNodes: GraphNode[] = [];
			for (let i = 0; i < this.dts.nodes.length; i++) {
				let graphNode: GraphNode = {
					index: i,
					node: this.dts.nodes[i],
					children: [],
					parent: null
				};
				graphNodes.push(graphNode);
			}
			for (let i = 0; i < this.dts.nodes.length; i++) {
				let node = this.dts.nodes[i];
				if (node.parentIndex !== -1) {
					graphNodes[i].parent = graphNodes[node.parentIndex];
					graphNodes[node.parentIndex].children.push(graphNodes[i]);
				}
			}
			this.graphNodes = graphNodes;
			this.rootGraphNodes = graphNodes.filter((node) => !node.parent);
			this.updateNodeTransforms();

			let geometries: Geometry[] = [];
			let geometryMatrixIndices: number[] = []; // The index into nodeTransforms
			let collisionGeometries = new Set<Geometry>();

			// Go through all nodes and objects and create the geometry
			for (let i = 0; i < this.dts.nodes.length; i++) {
				let objects = this.dts.objects.filter((object) => object.nodeIndex === i);

				for (let object of objects) {
					// Torque requires collision objects to start with "Col", so we use that here
					let isCollisionObject = this.dts.names[object.nameIndex].toLowerCase().startsWith("col");

					if (!isCollisionObject || this.collideable) {
						for (let j = object.startMeshIndex; j < object.startMeshIndex + object.numMeshes; j++) {
							let mesh = this.dts.meshes[j];
							if (!mesh) continue;
							if (mesh.parentMesh >= 0) continue; // If the node has a parent, skip it. Why? Don't know. Made teleport pad look correct.
							if (mesh.verts.length === 0) continue; // No need

							// The reason we precompute position/normal here is because skinned meshes need vector instances they can modify each frame.
							let vertices = mesh.verts.map((v) => new Vector3(v.x, v.y, v.z));
							let vertexNormals = mesh.norms.map((v) => new Vector3(v.x, v.y, v.z));

							let geometry = this.generateGeometryFromMesh(mesh, vertices, vertexNormals);
							geometries.push(geometry);
							geometryMatrixIndices.push(i);

							// Flag it
							if (isCollisionObject) collisionGeometries.add(geometry);
						}
					}
				}
			}

			// Search for a skinned mesh (only in use for the tornado)
			let skinnedMeshIndex: number = null;
			for (let i = 0; i < this.dts.meshes.length; i++) {
				let dtsMesh = this.dts.meshes[i];
				if (!dtsMesh || dtsMesh.type !== MeshType.Skin) continue;

				// Create arrays of zero vectors as they will get changed later anyway
				let vertices = new Array(dtsMesh.verts.length).fill(null).map(() => new Vector3());
				let vertexNormals = new Array(dtsMesh.norms.length).fill(null).map(() => new Vector3());
				let geometry = this.generateGeometryFromMesh(dtsMesh, vertices, vertexNormals);
				geometries.push(geometry); // Even though the mesh is animated, it doesn't count as dynamic because it's not part of any node and therefore cannot follow its transforms.
				geometryMatrixIndices.push(null);

				skinnedMeshIndex = i;
				break; // This is technically not correct. A shape could have many skinned meshes, but the tornado only has one, so we gucci.
			}

			sharedData = {
				materials: this.materials,
				rootGraphNodes: this.rootGraphNodes,
				nodeTransforms: this.nodeTransforms,
				geometries,
				geometryMatrixIndices,
				collisionGeometries,
				skinnedMeshIndex
			};
			this.isMaster = true;

			resolveFunc?.(sharedData);
		}

		if (!this.isMaster) {
			// Copy some data from the shared data
			this.nodeTransforms = sharedData.nodeTransforms;
			if (!this.shareNodeTransforms) this.nodeTransforms = this.nodeTransforms.map(x => x.clone());
			if (this.shareMaterials) this.materials = sharedData.materials;
			else await this.computeMaterials();
			this.rootGraphNodes = sharedData.rootGraphNodes; // The node graph is necessarily identical
		}

		// Create the meshes for all geometries
		for (let [i, geometry] of sharedData.geometries.entries()) {
			let materials = this.materials;
			if (sharedData.collisionGeometries.has(geometry)) {
				// Create a special material that just receives shadows
				let shadowMaterial = new Material();
				shadowMaterial.isShadow = true;
				shadowMaterial.transparent = true;
				shadowMaterial.depthWrite = false;

				materials = [shadowMaterial];
				geometry.materials.fill(0);
			}

			let mesh = new Mesh(geometry, materials);
			let transform = this.nodeTransforms[sharedData.geometryMatrixIndices[i]];
			if (transform) mesh.transform = transform;
			if (this.castShadows) mesh.castShadows = true;
			this.group.add(mesh);
			this.meshes.push(mesh);

			if (sharedData.skinnedMeshIndex !== null && !this.skinMeshInfo) {
				// Will be used for animating the skin later
				this.skinMeshInfo = {
					meshIndex: sharedData.skinnedMeshIndex,
					vertices: this.dts.meshes[sharedData.skinnedMeshIndex].verts.map(_ => new Vector3()),
					normals: this.dts.meshes[sharedData.skinnedMeshIndex].norms.map(_ => new Vector3()),
					mesh: mesh
				};
			}
		}

		// Now, create an actual collision body for each collision object (will be initiated with geometry later)
		for (let i = 0; i < this.colliderDts.nodes.length; i++) {
			let objects = this.colliderDts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				let isCollisionObject = this.colliderDts.names[object.nameIndex].toLowerCase().startsWith("col");
				if (isCollisionObject) {
					let body = new RigidBody();
					body.type = RigidBodyType.Static;
					body.userData = { nodeIndex: i };

					this.bodies.push(body);
				}
			}
		}

		// If there are no collision objects, add a single body which will later be filled with bounding box geometry.
		if (this.bodies.length === 0 && !this.isTSStatic) {
			let body = new RigidBody();
			body.type = RigidBodyType.Static;
			this.bodies.push(body);
		}

		// Init collision handlers
		for (let body of this.bodies) {
			body.onBeforeIntegrate = () => {
				if (this.isCurrentlyColliding && body.collisions.length === 0) {
					this.isCurrentlyColliding = false;
					this.onMarbleLeave();
				}
			};

			body.onBeforeCollisionResponse = (t: number) => {
				if (!this.isCurrentlyColliding) this.onMarbleEnter(t);
				this.onMarbleInside(t);

				this.isCurrentlyColliding = true;
			};

			body.onAfterCollisionResponse = () => {
				let chosenCollision = body.collisions[0]; // Just pick the first one, for now. There's not really a better way of choosing which one to pick, right?
				this.onMarbleContact(chosenCollision);
			};
		}

		// Preload all sounds
		await level?.audio.loadBuffers(this.sounds);

		if (this.level) this.level.loadingState.loaded++;
	}

	/** Creates the materials for this shape. */
	async computeMaterials() {
		let environmentMaterial: Material = null;

		for (let i = 0; i < this.dts.matNames.length; i++) {
			let matName = this.matNamesOverride[this.dts.matNames[i]] || this.dts.matNames[i]; // Check the override
			let flags = this.dts.matFlags[i];
			let fullNames = this.getFullNamesOf(this.directoryPath + '/' + matName).filter((x) => !x.endsWith('.dts'));
			let fullName = fullNames.find(x => x.endsWith('.ifl')) || fullNames[0]; // Prefer .ifls

			if (this.isTSStatic && environmentMaterial && DROP_TEXTURE_FOR_ENV_MAP.has(this.dtsPath)) {
				// Simply use the env material again
				this.materials.push(environmentMaterial);
				continue;
			}

			let material = new Material();
			if ((flags & MaterialFlags.SelfIlluminating) || environmentMaterial) material.emissive = true;

			this.materials.push(material);

			if (matName instanceof Texture) {
				material.diffuseMap = matName;
			} else if (!fullName || (this.isTSStatic && (flags & MaterialFlags.ReflectanceMapOnly))) {
				// Usually do nothing. It's an plain white material without a texture.
				// Ah EXCEPT if we're a TSStatic.
				if (this.isTSStatic) {
					material.emissive = true;
					if (flags & MaterialFlags.ReflectanceMapOnly) environmentMaterial = material;
				}
			} else if (fullName.endsWith('.ifl')) {
				// Parse the .ifl file
				let iflPath = this.directoryPath + '/' + fullName;
				let keyframes = this.level? await this.level.mission.getIfl(iflPath) : await IflParser.loadFile(ResourceManager.mainDataPath + iflPath);

				let fullNameCache = new Map<string, string>(); // To speed things up a bit for repeated entries
				keyframes = keyframes.map(x => {
					if (fullNameCache.has(x)) return fullNameCache.get(x);

					let fullName = this.getFullNamesOf(this.directoryPath + '/' + x).filter((x) => !x.endsWith('.dts'))[0] ?? x;
					fullNameCache.set(x, fullName);

					return fullName;
				});
				let uniqueKeyframes = [...new Set(keyframes)];

				// Load all frames of the material animation
				let promises: Promise<Texture>[] = [];
				for (let frame of uniqueKeyframes) {
					promises.push(this.getTexture(this.directoryPath + '/' + frame));
				}
				let textures = await Promise.all(promises);

				this.materialInfo.set(material, {
					textures: keyframes.map(x => textures[uniqueKeyframes.indexOf(x)])
				});

				material.diffuseMap = textures[0]; // So that we compile the material in the right type of shader
				material.differentiator = this.isTSStatic + ResourceManager.mainDataPath + iflPath;
			} else {
				let texture = await this.getTexture(this.directoryPath + '/' + fullName);
				material.diffuseMap = texture;
			}

			// Set some properties based on the flags
			if (flags & MaterialFlags.Translucent) {
				material.transparent = true;
				material.depthWrite = false;
			}
			if (flags & MaterialFlags.Additive) material.blending = BlendingType.Additive;
			if (flags & MaterialFlags.Subtractive) material.blending = BlendingType.Subtractve;
			if (this.isTSStatic && !(flags & MaterialFlags.NeverEnvMap)) {
				material.reflectivity = this.dts.matNames.length === 1? 1 : environmentMaterial? 0.5 : 0.333;
				material.envMap = this.level.envMap;
			}

			this.materialPostprocessor?.(material);
		}

		// If there are no materials, atleast add one environment one
		if (this.materials.length === 0) {
			let mat = new Material();
			mat.emissive = true;
			mat.envMap = this.level.envMap;
			mat.reflectivity = 1;
			this.materials.push(mat);
		}
	}

	/** Generates geometry info from a given DTS mesh. */
	generateGeometryFromMesh(dtsMesh: DtsFile["meshes"][number], vertices: Vector3[], vertexNormals: Vector3[]) {
		let geometry = new Geometry();

		for (let i = 0; i < vertices.length; i++) {
			let vertex = vertices[i];
			let uv = dtsMesh.tverts[i];
			let normal = vertexNormals[i];

			geometry.positions.push(vertex.x, vertex.y, vertex.z);
			geometry.normals.push(normal.x, normal.y, normal.z);
			geometry.uvs.push(uv.x, uv.y);
		}

		let ab = new Vector3();
		let ac = new Vector3();
		const addTriangleFromIndices = (i1: number, i2: number, i3: number, materialIndex: number) => {
			// We first perform a check: If the computed face normal points in the opposite direction of all vertex normals, we need to invert the winding order of the vertices.
			ab.set(vertices[i2].x - vertices[i1].x, vertices[i2].y - vertices[i1].y, vertices[i2].z - vertices[i1].z);
			ac.set(vertices[i3].x - vertices[i1].x, vertices[i3].y - vertices[i1].y, vertices[i3].z - vertices[i1].z);
			let normal = ab.cross(ac).normalize();
			let dot1 = normal.dot(vertexNormals[i1]);
			let dot2 = normal.dot(vertexNormals[i2]);
			let dot3 = normal.dot(vertexNormals[i3]);
			if (!this.dtsPath.includes('helicopter.dts')) if (dot1 < 0 && dot2 < 0 && dot3 < 0) [i1, i3] = [i3, i1];
			// ^ temp hardcoded fix
			// update: not so temp

			geometry.indices.push(i1, i2, i3);
			geometry.materials.push(materialIndex, materialIndex, materialIndex);
		};

		for (let primitive of dtsMesh.primitives) {
			let materialIndex = primitive.matIndex & TSDrawPrimitive.MaterialMask;
			let drawType = primitive.matIndex & TSDrawPrimitive.TypeMask;

			if (drawType === TSDrawPrimitive.Triangles) {
				for (let i = primitive.start; i < primitive.start + primitive.numElements; i += 3) {
					let i1 = dtsMesh.indices[i];
					let i2 = dtsMesh.indices[i+1];
					let i3 = dtsMesh.indices[i+2];

					addTriangleFromIndices(i1, i2, i3, materialIndex);
				}
			} else if (drawType === TSDrawPrimitive.Strip) {
				let k = 0; // Keep track of current face for correct vertex winding order
				for (let i = primitive.start; i < primitive.start + primitive.numElements - 2; i++) {
					let i1 = dtsMesh.indices[i];
					let i2 = dtsMesh.indices[i+1];
					let i3 = dtsMesh.indices[i+2];

					if (k % 2 === 0) {
						// Swap the first and last index to maintain correct winding order
						let temp = i1;
						i1 = i3;
						i3 = temp;
					}

					addTriangleFromIndices(i1, i2, i3, materialIndex);

					k++;
				}
			} else if (drawType === TSDrawPrimitive.Fan) {
				for (let i = primitive.start; i < primitive.start + primitive.numElements - 2; i++) {
					let i1 = dtsMesh.indices[primitive.start]; // Triangle fan starts at the start
					let i2 = dtsMesh.indices[i+1];
					let i3 = dtsMesh.indices[i+2];

					addTriangleFromIndices(i1, i2, i3, materialIndex);
				}
			}
		}

		return geometry;
	}

	/** Generates collision objects for this shape. Geometry will be generated later. */
	generateCollisionObjects() {
		let bodyIndex = 0;
		let dts = this.colliderDts;

		for (let i = 0; i < dts.nodes.length; i++) {
			let objects = dts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				if (!dts.names[object.nameIndex].toLowerCase().startsWith("col")) continue;

				let body = this.bodies[bodyIndex];
				bodyIndex++;

				for (let j = object.startMeshIndex; j < object.startMeshIndex + object.numMeshes; j++) {
					let mesh = dts.meshes[j];
					if (!mesh) continue;

					for (let primitive of mesh.primitives) {
						// Create the collision shape but with all zero vectors for now
						let shape = new ConvexHullCollisionShape(Array(primitive.numElements).fill(null).map(_ => new Vector3()));
						shape.restitution = this.restitution;
						shape.friction = this.friction;
						if (!this.collideable) shape.collisionDetectionMask = 0b10; // Collide with the big aux marble

						body.addCollisionShape(shape);

						// Remember the actual untransformed vertices for this geometry
						let vertices = mesh.indices.slice(primitive.start, primitive.start + primitive.numElements)
							.map((index) => mesh.verts[index])
							.map((vert) => new Vector3(vert.x, vert.y, vert.z));
						this.shapeVertices.set(shape, vertices);
					}
				}
			}
		}

		if (bodyIndex === 0 && !this.isTSStatic) {
			// Create collision geometry based on the bounding box
			let body = this.bodies[0];

			let bounds = new Box3();
			bounds.min.set(dts.bounds.min.x, dts.bounds.min.y, dts.bounds.min.z);
			bounds.max.set(dts.bounds.max.x, dts.bounds.max.y, dts.bounds.max.z);

			// Create an empty collision shape for now
			let shape = new ConvexHullCollisionShape(Array(8).fill(null).map(_ => new Vector3()));
			shape.restitution = this.restitution;
			shape.friction = this.friction;
			if (!this.collideable) shape.collisionDetectionMask = 0b10; // Collide with the big aux marble

			body.addCollisionShape(shape);

			// All 8 vertices of the bounding cuboid
			let vertices = Util.getBoxVertices(bounds);
			this.shapeVertices.set(shape, vertices);
		}
	}

	/** Recursively updates node transformations in the node tree.
	 * @param quaternions One quaternion for each node.
	 * @param translations One translation for each node.
	 * @param scales One scale for each node.
	 * @param bitfield Specifies which nodes have changed.
	 */
	updateNodeTransforms(quaternions?: Quaternion[], translations?: Vector3[], scales?: Vector3[], bitfield = 0xffffffff) {
		if (!quaternions) {
			// Create the default array of quaternions
			quaternions = this.dts.nodes.map((node, index) => {
				let rotation = this.dts.defaultRotations[index];
				let quaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
				quaternion.normalize();
				quaternion.conjugate();

				return quaternion;
			});
		}

		if (!translations) {
			// Create the default array of translations
			translations = this.dts.nodes.map((node, index) => {
				let translation = this.dts.defaultTranslations[index];
				return new Vector3(translation.x, translation.y, translation.z);
			});
		}

		if (!scales) {
			// Create the default array of scales
			scales = this.dts.nodes.map(() => {
				return new Vector3().setScalar(1);
			});
		}

		let utilityMatrix = new Matrix4();

		const traverse = (node: GraphNode, needsUpdate: boolean) => {
			if (((1 << node.index) & bitfield) !== 0) needsUpdate = true;

			if (needsUpdate) {
				// Recompute the matrix
				let mat = this.nodeTransforms[node.index];

				if (!node.parent) {
					mat.identity();
				} else {
					mat.copy(this.nodeTransforms[node.parent.index]);
				}

				utilityMatrix.compose(translations[node.index], quaternions[node.index], scales[node.index]);
				mat.multiplyMatrices(mat, utilityMatrix);
			}

			// Call all children
			for (let i = 0; i < node.children.length; i++) traverse(node.children[i], needsUpdate);
		};

		// Start with the roots
		for (let i = 0; i < this.rootGraphNodes.length; i++) {
			let rootNode = this.rootGraphNodes[i];
			traverse(rootNode, false);
		}
	}

	/** Updates the geometries of the bodies matching the bitfield based on node transforms. */
	updateCollisionGeometry(bitfield: number) {
		for (let i = 0; i < this.bodies.length; i++) {
			let body = this.bodies[i];
			let mat: Matrix4;

			if (body.userData?.nodeIndex !== undefined) {
				if (((1 << body.userData.nodeIndex) & bitfield) === 0) continue;
				mat = this.worldMatrix.clone();
				mat.multiplyMatrices(this.worldMatrix, this.nodeTransforms[body.userData.nodeIndex]);
			} else {
				mat = this.worldMatrix;
			}

			// For all shapes...
			for (let shape of (body.shapes as ConvexHullCollisionShape[])) {
				let vertices = this.shapeVertices.get(shape);

				// Assign the transformed vectors to the vertices of the geometry
				for (let i = 0; i < vertices.length; i++) {
					shape.points[i].copy(vertices[i]).applyMatrix4(mat);
				}

				shape.computeLocalBoundingBox();
			}

			body.syncShapes();
		}
	}

	tick(time: TimeState, onlyVisual = false) {
		// If onlyVisual is set, collision bodies need not be updated.

		if (!this.showSequences) return;
		if (!onlyVisual && !this.hasNonVisualSequences) return;

		if (!this.shareNodeTransforms || this.isMaster) for (let sequence of this.dts.sequences) {
			let rot = sequence.rotationMatters[0] ?? 0;
			let trans = sequence.translationMatters[0] ?? 0;
			let scale = sequence.scaleMatters[0] ?? 0;
			let affectedCount = 0;
			let completion = time.timeSinceLoad / (sequence.duration * 1000);
			let quaternions: Quaternion[];
			let translations: Vector3[];
			let scales: Vector3[];

			// Possibly get the keyframe from the overrides
			let actualKeyframe = this.sequenceKeyframeOverride.get(sequence) ?? (completion * sequence.numKeyframes) % sequence.numKeyframes;
			if (this.lastSequenceKeyframes.get(sequence) === actualKeyframe) continue;
			this.lastSequenceKeyframes.set(sequence, actualKeyframe);

			let keyframeLow = Math.floor(actualKeyframe);
			let keyframeHigh = Math.ceil(actualKeyframe) % sequence.numKeyframes;
			let t = (actualKeyframe - keyframeLow) % 1; // The completion between two keyframes

			// Handle rotation sequences
			if (rot > 0) quaternions = this.dts.nodes.map((node, index) => {
				let affected = ((1 << index) & rot) !== 0;

				if (affected) {
					let rot1 = this.dts.nodeRotations[sequence.numKeyframes * affectedCount + keyframeLow];
					let rot2 = this.dts.nodeRotations[sequence.numKeyframes * affectedCount + keyframeHigh];

					let quaternion1 = new Quaternion(rot1.x, rot1.y, rot1.z, rot1.w);
					quaternion1.normalize();
					quaternion1.conjugate();

					let quaternion2 = new Quaternion(rot2.x, rot2.y, rot2.z, rot2.w);
					quaternion2.normalize();
					quaternion2.conjugate();

					// Interpolate between the two quaternions
					quaternion1.slerp(quaternion2, t);

					affectedCount++;
					return quaternion1;
				} else {
					// The rotation for this node is not animated and therefore we return the default rotation.
					let rotation = this.dts.defaultRotations[index];
					let quaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
					quaternion.normalize();
					quaternion.conjugate();

					return quaternion;
				}
			});

			// Handle translation sequences
			affectedCount = 0;
			if (trans > 0) translations = this.dts.nodes.map((node, index) => {
				let affected = ((1 << index) & trans) !== 0;

				if (affected) {
					let trans1 = this.dts.nodeTranslations[sequence.numKeyframes * affectedCount + keyframeLow];
					let trans2 = this.dts.nodeTranslations[sequence.numKeyframes * affectedCount + keyframeHigh];

					affectedCount++;

					// Interpolate between the two translations
					return new Vector3(Util.lerp(trans1.x, trans2.x, t), Util.lerp(trans1.y, trans2.y, t), Util.lerp(trans1.z, trans2.z, t));
				} else {
					// The translation for this node is not animated and therefore we return the default translation.
					let translation = this.dts.defaultTranslations[index];
					return new Vector3(translation.x, translation.y, translation.z);
				}
			});

			// Handle scale sequences
			affectedCount = 0;
			if (scale > 0) scales = this.dts.nodes.map((node, index) => {
				let affected = ((1 << index) & scale) !== 0;

				if (affected) {
					let scale1 = this.dts.nodeAlignedScales[sequence.numKeyframes * affectedCount + keyframeLow];
					let scale2 = this.dts.nodeAlignedScales[sequence.numKeyframes * affectedCount + keyframeHigh];

					affectedCount++;

					// Interpolate between the two scales
					return new Vector3(Util.lerp(scale1.x, scale2.x, t), Util.lerp(scale1.y, scale2.y, t), Util.lerp(scale1.z, scale2.z, t));
				} else {
					// The scale for this node is not animated and therefore we return the default scale.
					return new Vector3().setScalar(1); // Apparently always this
				}
			});

			if (rot | trans | scale) {
				this.updateNodeTransforms(quaternions, translations, scales, rot | trans | scale);
				if (!onlyVisual) this.updateCollisionGeometry(rot | trans | scale);
			}
		}

		for (let mesh of this.meshes) {
			mesh.changedTransform();
		}
	}

	render(time: TimeState) {
		if (this.isTSStatic && this.hasBeenRendered) return; // Render TSStatic's only once, since after that they don't change

		this.tick(time, true); // Execute an only-visual tick

		if (this.skinMeshInfo && this.isMaster) {
			// Update the skin mesh.
			let info = this.skinMeshInfo;
			let mesh = this.dts.meshes[info.meshIndex];

			// Zero all vectors at first
			for (let i = 0; i < info.vertices.length; i++) {
				info.vertices[i].set(0, 0, 0);
				info.normals[i].set(0, 0, 0);
			}

			// Compute the transformation matrix for each bone
			let boneTransformations: Matrix4[] = [];
			let boneTransformationsTransposed: Matrix4[] = [];
			for (let i = 0; i < mesh.nodeIndices.length; i++) {
				let mat = new Matrix4();
				mat.elements = mesh.initialTransforms[i].slice();
				mat.transpose();
				mat.multiplyMatrices(this.nodeTransforms[mesh.nodeIndices[i]], mat);

				boneTransformations.push(mat);
				boneTransformationsTransposed.push(mat.clone().transpose());
			}

			// Now fill the vertex and normal vector values
			let vec = new Vector3();
			let vec2 = new Vector3();
			for (let i = 0; i < mesh.vertIndices.length; i++) {
				let vIndex = mesh.vertIndices[i];
				let vertex = mesh.verts[vIndex];
				let normal = mesh.norms[vIndex];

				vec.set(vertex.x, vertex.y, vertex.z);
				vec2.set(normal.x, normal.y, normal.z);
				let mat = boneTransformations[mesh.boneIndices[i]];

				vec.applyMatrix4(mat);
				vec.multiplyScalar(mesh.weights[i]);
				Util.m_matF_x_vectorF(mat, vec2);
				vec2.multiplyScalar(mesh.weights[i]);

				info.vertices[vIndex].add(vec);
				info.normals[vIndex].add(vec2);
			}

			// Normalize the normals
			for (let i = 0; i < info.normals.length; i++) {
				let norm = info.normals[i];
				let len2 = norm.dot(norm);

				// This condition is also present in the Torque 3D source
				if (len2 > 0.01) norm.normalize();
			}

			// Update the values in the buffer attributes
			let geometry = info.mesh.geometry;
			for (let i = 0; i < info.vertices.length; i++) {
				let vertex = info.vertices[i];
				let normal = info.normals[i];

				geometry.positions[3*i + 0] = vertex.x;
				geometry.positions[3*i + 1] = vertex.y;
				geometry.positions[3*i + 2] = vertex.z;
				geometry.normals[3*i + 0] = normal.x;
				geometry.normals[3*i + 1] = normal.y;
				geometry.normals[3*i + 2] = normal.z;
			}
		}

		if (this.skinMeshInfo) this.skinMeshInfo.mesh.needsVertexBufferUpdate = true;

		// Handle animated materials
		if (!this.shareMaterials || this.isMaster) for (let i = 0; i < this.materials.length; i++) {
			let info = this.materialInfo.get(this.materials[i]);
			if (!info) continue;

			let iflSequence = this.dts.sequences.find((seq) => seq.iflMatters[0] > 0);
			if (!iflSequence || !this.showSequences) continue;

			let completion = time.timeSinceLoad / (iflSequence.duration * 1000);
			let keyframe = Math.floor(completion * info.textures.length) % info.textures.length;
			let texture = info.textures[keyframe];

			this.materials[i].diffuseMap = texture;
		}

		// Spin the shape round 'n' round
		if (this.ambientRotate) {
			let spinAnimation = new Quaternion();
			let up = new Vector3(0, 0, 1);
			spinAnimation.setFromAxisAngle(up, time.timeSinceLoad * this.ambientSpinFactor);

			let orientation = this.worldOrientation.clone();
			spinAnimation.multiplyQuaternions(orientation, spinAnimation);

			this.group.orientation.copy(spinAnimation);
			this.group.recomputeTransform();
		}

		this.hasBeenRendered = true;
	}

	/** Updates the transform of the shape's objects and bodies. */
	setTransform(position: Vector3, orientation: Quaternion, scale: Vector3) {
		let scaleUpdated = scale.clone().sub(this.worldScale).length() !== 0;

		this.worldPosition = position;
		this.worldOrientation = orientation;
		this.worldScale = scale;
		this.worldMatrix.compose(position, orientation, scale);

		this.group.position.copy(position);
		this.group.orientation.copy(orientation);
		this.group.scale.copy(scale);
		this.group.recomputeTransform();

		let colliderMatrix = new Matrix4();
		colliderMatrix.compose(this.worldPosition, this.worldOrientation, new Vector3(1, 1, 1));

		// Update the colliders
		for (let collider of this.colliders) {
			let mat = collider.transform.clone();
			mat.multiplyMatrices(colliderMatrix, mat);

			let position = new Vector3();
			let orientation = new Quaternion();
			mat.decompose(position, orientation, new Vector3());

			collider.body.position.copy(position);
			collider.body.orientation.copy(orientation);

			while (collider.body.shapes.length) collider.body.removeCollisionShape(collider.body.shapes[0]); // Remove all shapes

			// Create the new shape
			let shape = collider.generateShape(this.worldScale);
			shape.collisionDetectionMask = 0b100; // Collide with the small aux marble
			collider.body.addCollisionShape(shape);
		}

		if (scaleUpdated) this.generateCollisionObjects(); // We need to recompute the geometry if the scale changed; this will always be called at least once in the first call
		this.updateCollisionGeometry(0xffffffff); // Update collision geometry
	}

	/** Sets the opacity of the shape. Since there's no quick and easy way of doing this, this method recursively sets it for all materials. */
	setOpacity(opacity: number) {
		if (opacity === this.currentOpacity) return;

		this.currentOpacity = opacity;
		this.group.setOpacity(opacity);
	}

	/** Adds a collider shape. Whenever the marble overlaps with the shape, a callback is fired. */
	addCollider(generateShape: (scale: Vector3) => CollisionShape, onInside: (t: number, dt: number) => void, localTransform: Matrix4) {
		let body = new RigidBody();
		body.type = RigidBodyType.Static;

		this.colliders.push({
			generateShape: generateShape,
			body: body,
			transform: localTransform
		});

		body.onAfterCollisionResponse = onInside;
	}

	/** Enable or disable collision. */
	setCollisionEnabled(enabled: boolean) {
		for (let body of this.bodies) {
			body.enabled = enabled;
		}
	}

	reset() {
		this.isCurrentlyColliding = false;
	}

	/* eslint-disable  @typescript-eslint/no-unused-vars */
	onMarbleContact(collision: Collision) {}
	onMarbleInside(t: number) {}
	onMarbleEnter(t: number) {}
	onMarbleLeave() {}
	async onLevelStart() {}
}