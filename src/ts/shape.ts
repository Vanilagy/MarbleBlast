import { DtsFile, MeshType, DtsParser } from "./parsing/dts_parser";
import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { IflParser } from "./parsing/ifl_parser";
import { Util, MaterialGeometry } from "./util";
import { TimeState, Level } from "./level";
import { INTERIOR_DEFAULT_RESTITUTION, INTERIOR_DEFAULT_FRICTION } from "./interior";
import { AudioManager } from "./audio";
import { MissionElement } from "./parsing/mis_parser";
import { renderer } from "./rendering";

/** A hardcoded list of shapes that should only use envmaps as textures. */
const DROP_TEXTURE_FOR_ENV_MAP = new Set(['shapes/items/superjump.dts', 'shapes/items/antigravity.dts']);

interface MaterialInfo {
	keyframes: string[]
}

/** Data necessary for updating skinned meshes. */
interface SkinMeshData {
	meshIndex: number,
	vertices: THREE.Vector3[],
	normals: THREE.Vector3[],
	indices: number[],
	geometry: THREE.BufferGeometry
}

interface ColliderInfo {
	generateGeometry: (scale: THREE.Vector3) => OIMO.Geometry,
	body: OIMO.RigidBody,
	id: number,
	onInside: () => void,
	transform: THREE.Matrix4
}

/** Data that is shared with other shapes of the same type. */
export interface SharedShapeData {
	materials: (THREE.MeshBasicMaterial | THREE.MeshLambertMaterial)[],
	staticGeometries: THREE.BufferGeometry[],
	dynamicGeometries: THREE.BufferGeometry[],
	dynamicGeometriesMatrixIndices: number[],
	collisionGeometries: Set<THREE.BufferGeometry>,
	nodeTransforms: THREE.Matrix4[],
	rootGraphNodes: GraphNode[],
	instancedMeshes: THREE.InstancedMesh[],
	instanceIndex: number
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
	dts: DtsFile;
	directoryPath: string;
	/** Whether or not this shape is being used as a TSStatic. TSStatic are static, non-moving shapes that basically can't do anything. */
	isTSStatic = false;
	
	group: THREE.Group;
	/** Either the meshes or dummy Object3D's used for instancing. */
	objects: THREE.Object3D[] = [];
	bodies: OIMO.RigidBody[];
	geometries: THREE.BufferGeometry[] = [];
	/** Whether the marble can physically collide with this shape. */
	collideable = true;
	/** Not physical colliders, but a list bodies that overlap is checked with. This is used for things like force fields. */
	colliders: ColliderInfo[] = [];
	/** For each shape, the untransformed vertices of their convex hull geometry. */
	shapeVertices = new Map<OIMO.Shape, THREE.Vector3[]>();

	worldPosition = new THREE.Vector3();
	worldOrientation = new THREE.Quaternion();
	worldScale = new THREE.Vector3();
	worldMatrix = new THREE.Matrix4();

	/** Can be used to override certain material names. */
	matNamesOverride: Record<string, string> = {};
	materials: (THREE.MeshLambertMaterial | THREE.MeshBasicMaterial)[];
	/** Used for collision objects. */
	shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.25, depthWrite: false });
	/** Stores information used to animate materials. */
	materialInfo: WeakMap<THREE.Material, MaterialInfo>;
	castShadow = false;

	/** Stores all nodes from the node tree. */
	graphNodes: GraphNode[];
	/** Stores only the roots of the tree (no parent). */
	rootGraphNodes: GraphNode[] = [];
	/** One transformation matrix per DTS node */
	nodeTransforms: THREE.Matrix4[] = [];
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

	/** Same shapes with the same shareId will share data. */
	shareId: number = 0;
	/** Data shared with other shapes of the same type. */
	sharedData: SharedShapeData;
	/** Whether or not to share the same node transforms with other shapes of the same type. */
	shareNodeTransforms = true;
	/** Whether or not to share the same materials with other shapes of the same type. */
	shareMaterials = true;
	/** Whether or not to use instancing. Instancing drastically improves rendering performance but configuration per instance becomes very limited. */
	useInstancing = false;
	instancedMeshes: THREE.InstancedMesh[] = [];
	/** The assigned instance index of this shape. */
	instanceIndex = 0;

	sounds: string[] = [];

	async init(level?: Level, srcElement: MissionElement = null) {
		if (!Util.supportsInstancing(renderer)) this.useInstancing = false;

		this.id = srcElement?._id ?? 0;
		this.level = level;
		this.srcElement = srcElement;
		this.dts = await ((this.level)? this.level.mission.getDts(this.dtsPath) : DtsParser.loadFile(ResourceManager.mainDataPath + this.dtsPath));
		this.directoryPath = this.dtsPath.slice(0, this.dtsPath.lastIndexOf('/'));

		this.group = new THREE.Group();
		this.bodies = [];
		this.materials = [];
		this.materialInfo = new WeakMap();

		let staticGeometries: THREE.BufferGeometry[] = [];
		let dynamicGeometries: THREE.BufferGeometry[] = [];
		let dynamicGeometriesMatrices: THREE.Matrix4[] = [];
		let collisionGeometries = new Set<THREE.BufferGeometry>();

		// Check if there's already shared data from another shape of the same type
		let sharedDataPromise = this.level?.sharedShapeData.get(this.dtsPath + ' ' + this.constructor.name + ' ' + this.shareId.toString());
		if (sharedDataPromise) {
			// If so, wait for that shape to complete initiation...
			this.sharedData = await sharedDataPromise;

			// ...then copy values.
			this.nodeTransforms = this.sharedData.nodeTransforms;
			if (!this.shareNodeTransforms) this.nodeTransforms = this.nodeTransforms.map(x => x.clone());
			if (this.shareMaterials) this.materials = this.sharedData.materials;
			else await this.computeMaterials();
			// These geometries can be reused without a problem
			staticGeometries = this.sharedData.staticGeometries;
			dynamicGeometries = this.sharedData.dynamicGeometries;
			collisionGeometries = this.sharedData.collisionGeometries;
			dynamicGeometriesMatrices = this.sharedData.dynamicGeometriesMatrixIndices.map(x => this.nodeTransforms[x]);
			// The node graph is also necessarily identical
			this.rootGraphNodes = this.sharedData.rootGraphNodes;
			// Instancing:
			this.instancedMeshes = this.sharedData.instancedMeshes;
			this.instanceIndex = ++this.sharedData.instanceIndex; // Assigns itself a new unique instance index by pre-incrementing the counter
		} else {
			// If we're here, we're the first shape of this type, so let's prepare the shared data
			let resolveFunc: (data: SharedShapeData) => any;
			if (this.level) {
				let sharedDataPromise = new Promise<SharedShapeData>((resolve) => resolveFunc = resolve);
				this.level.sharedShapeData.set(this.dtsPath + ' ' + this.constructor.name + ' ' + this.shareId.toString(), sharedDataPromise);
			}

			for (let i = 0; i < this.dts.nodes.length; i++) this.nodeTransforms.push(new THREE.Matrix4());

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
	
			let affectedBySequences = this.dts.sequences[0]? (this.dts.sequences[0].rotationMatters[0] ?? 0) | (this.dts.sequences[0].translationMatters[0] ?? 0) : 0;
			/** Stores the material geometries of all static parts of this shape. These will be merged a single geometry for performance. */
			let staticMaterialGeometries: MaterialGeometry[] = [];
			/** Stores the material geometries of all dynamic (moving) parts. */
			let dynamicMaterialGeometries: MaterialGeometry[] = [];
			/** Stores which material geometry is collision geometry. */
			let collisionMaterialGeometries = new Set<MaterialGeometry>();
			
			// Go through all nodes and objects and create the geometry
			for (let i = 0; i < this.dts.nodes.length; i++) {
				let objects = this.dts.objects.filter((object) => object.nodeIndex === i);
				let sequenceAffected = ((1 << i) & affectedBySequences) !== 0;
	
				for (let object of objects) {
					// Torque requires collision objects to start with "Col", so we use that here
					let isCollisionObject = this.dts.names[object.nameIndex].toLowerCase().startsWith("col");
	
					if (!isCollisionObject || this.collideable) {
						let mat = this.nodeTransforms[i];
		
						for (let i = object.startMeshIndex; i < object.startMeshIndex + object.numMeshes; i++) {
							let mesh = this.dts.meshes[i];
							if (!mesh) continue;
							if (mesh.parentMesh >= 0) continue; // If the node has a parent, skip it. Why? Don't know. Made teleport pad look correct.
		
							let vertices = mesh.verts.map((v) => new THREE.Vector3(v.x, v.y, v.z));
							let vertexNormals = mesh.norms.map((v) => new THREE.Vector3(v.x, v.y, v.z));
	
							// We can pre-apply the transformation matrices here since they won't ever change (it's static, after all)
							if (!sequenceAffected) vertices.forEach((vert) => vert.applyMatrix4(mat));
							if (!sequenceAffected) vertexNormals.forEach((norm) => Util.m_matF_x_vectorF(mat, norm));
	
							let geometry = this.generateMaterialGeometry(mesh, vertices, vertexNormals);
							if (!sequenceAffected) {
								staticMaterialGeometries.push(geometry);
							} else {
								dynamicMaterialGeometries.push(geometry);
								dynamicGeometriesMatrices.push(mat);
							}

							// Flag it
							if (isCollisionObject) collisionMaterialGeometries.add(geometry);
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
				let vertices = new Array(dtsMesh.verts.length).fill(null).map(() => new THREE.Vector3());
				let vertexNormals = new Array(dtsMesh.norms.length).fill(null).map(() => new THREE.Vector3());
				let materialGeometry = this.generateMaterialGeometry(dtsMesh, vertices, vertexNormals);
				staticMaterialGeometries.push(materialGeometry); // Even though the mesh is animated, it doesn't count as dynamic because it's not part of any node and therefore cannot follow its transforms.

				skinnedMeshIndex = i;
				break; // This is technically not correct. A shape could have many skinned meshes, but the tornado only has one, so we gucci.
			}

			let staticNonCollision = staticMaterialGeometries.filter(x => !collisionMaterialGeometries.has(x));
			let staticCollision = staticMaterialGeometries.filter(x => collisionMaterialGeometries.has(x));

			if (staticNonCollision.length > 0) {
				// Merge all non-collision static geometries into one thing
				let merged = Util.mergeMaterialGeometries(staticNonCollision);
				let geometry = Util.createGeometryFromMaterialGeometry(merged);
				staticGeometries.push(geometry);
				this.geometries.push(geometry);

				if (skinnedMeshIndex !== null) {
					// Will be used for animating the skin later
					this.skinMeshInfo = {
						meshIndex: skinnedMeshIndex,
						vertices: this.dts.meshes[skinnedMeshIndex].verts.map(x => new THREE.Vector3()),
						normals: this.dts.meshes[skinnedMeshIndex].norms.map(x => new THREE.Vector3()),
						indices: Util.concatArrays(merged.map(x => x.indices)),
						geometry: geometry
					};
				}
			}

			if (staticCollision.length > 0) {
				// Create the collision mesh geometry
				let geometry = Util.createGeometryFromMaterialGeometry(Util.mergeMaterialGeometries(staticCollision));
				staticGeometries.push(geometry);
				collisionGeometries.add(geometry);
				this.geometries.push(geometry);
			}

			for (let materialGeom of dynamicMaterialGeometries) {
				// Create one geometry for each dynamic material geometry; we cannot merge here.
				let geometry = Util.createGeometryFromMaterialGeometry(materialGeom);
				dynamicGeometries.push(geometry);
				if (collisionMaterialGeometries.has(materialGeom)) collisionGeometries.add(geometry);
				this.geometries.push(geometry);
			}

			if (this.level && this.useInstancing) {
				// Count how many shapes of the same type there are.
				let instanceCount = this.level?.shapes.filter(x => x.constructor === this.constructor && x.shareId === this.shareId).length ?? 0;
	
				// We know there will be one mesh per static geometry and dynamic geometry, so we create the appropriate amount of InstancedMeshes here.
				for (let geometry of staticGeometries.concat(dynamicGeometries)) {
					let instancedMesh = new THREE.InstancedMesh(geometry, collisionGeometries.has(geometry)? this.shadowMaterial : this.materials, instanceCount);
					if (collisionGeometries.has(geometry)) instancedMesh.receiveShadow = this.receiveShadows;
					if (this.castShadow) instancedMesh.castShadow = true;
					instancedMesh.matrixAutoUpdate = false;
	
					this.level.scene.add(instancedMesh);
					this.instancedMeshes.push(instancedMesh);
				}
			}

			if (resolveFunc) resolveFunc({
				materials: this.materials,
				staticGeometries: staticGeometries,
				dynamicGeometries: dynamicGeometries,
				dynamicGeometriesMatrixIndices: dynamicGeometriesMatrices.map(x => this.nodeTransforms.indexOf(x)),
				collisionGeometries: collisionGeometries,
				nodeTransforms: this.nodeTransforms,
				rootGraphNodes: this.rootGraphNodes,
				instancedMeshes: this.instancedMeshes,
				instanceIndex: 0
			});
		}

		// Generate the static meshes
		for (let geometry of staticGeometries) {
			let obj: THREE.Object3D;

			if (this.instancedMeshes.length > 0) {
				// Create a simple dummy object whose only purpose is to hold transformation data for the instanced mesh.
				obj = new THREE.Object3D();
			} else {
				let mesh = new THREE.Mesh(geometry, collisionGeometries.has(geometry)? this.shadowMaterial : this.materials);
				if (collisionGeometries.has(geometry)) mesh.receiveShadow = this.receiveShadows;
				if (this.castShadow) mesh.castShadow = true;
				obj = mesh;
			}

			obj.matrixAutoUpdate = false; // It doesn't even move anymore
			this.group.add(obj);
			this.objects.push(obj);
		}

		// Generate the dynamic meshes
		for (let i = 0; i < dynamicGeometries.length; i++) {
			let obj: THREE.Object3D;

			if (this.instancedMeshes.length > 0) {
				// Create a simple dummy object whose only purpose is to hold transformation data for the instanced mesh.
				obj = new THREE.Object3D();
			} else {
				let geometry = dynamicGeometries[i];
				let mesh = new THREE.Mesh(geometry, collisionGeometries.has(geometry)? this.shadowMaterial : this.materials);
				if (collisionGeometries.has(geometry)) mesh.receiveShadow = this.receiveShadows;
				if (this.castShadow) mesh.castShadow = true;
				obj = mesh;
			}
			
			obj.matrixAutoUpdate = false; // We'll move it manually
			obj.matrix = dynamicGeometriesMatrices[i];
			this.group.add(obj);
			this.objects.push(obj);
		}

		// Now, create an actual collision body for each collision object (will be initiated with geometry later)
		for (let i = 0; i < this.dts.nodes.length; i++) {
			let objects = this.dts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				let isCollisionObject = this.dts.names[object.nameIndex].toLowerCase().startsWith("col");
				if (isCollisionObject) {
					let config = new OIMO.RigidBodyConfig();
					config.type = OIMO.RigidBodyType.STATIC;
					let body = new OIMO.RigidBody(config);
					body.userData = { nodeIndex: i, objectIndex: this.dts.objects.indexOf(object) };

					this.bodies.push(body);
				}
			}
		}

		// If there are no collision objects, add a single body which will later be filled with bounding box geometry.
		if (this.bodies.length === 0 && !this.isTSStatic) {
			let config = new OIMO.RigidBodyConfig();
			config.type = OIMO.RigidBodyType.STATIC;
			let body = new OIMO.RigidBody(config);
			this.bodies.push(body);
		}

		// Preload all sounds
		for (let sound of this.sounds) {
			await AudioManager.loadBuffer(sound);
		}

		if (this.level) this.level.loadingState.loaded++;
	}

	/** Creates the materials for this shape. */
	async computeMaterials() {
		let environmentMaterial: THREE.MeshBasicMaterial = null;

		for (let i = 0; i < this.dts.matNames.length; i++) {
			let matName = this.matNamesOverride[this.dts.matNames[i]] ||  this.dts.matNames[i]; // Check the override
			let flags = this.dts.matFlags[i];
			let fullName = ResourceManager.getFullNamesOf(this.directoryPath + '/' + matName).filter((x) => !x.endsWith('.dts'))[0];

			if (this.isTSStatic && environmentMaterial && DROP_TEXTURE_FOR_ENV_MAP.has(this.dtsPath)) {
				// Simply use the env material again
				this.materials.push(environmentMaterial);
				continue;
			}

			// If the material is self-illuminated, we can get away with a MeshBasicMaterial
			let material = ((flags & MaterialFlags.SelfIlluminating) || environmentMaterial) ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
			this.materials.push(material);

			if (!fullName || (this.isTSStatic && (flags & MaterialFlags.ReflectanceMapOnly))) {
				// Usually do nothing. It's an plain white material without a texture.
				// Ah EXCEPT if we're a TSStatic.
				if (this.isTSStatic) {
					material = new THREE.MeshBasicMaterial({ envMap: this.level.envMap });
					this.materials[this.materials.length - 1] = material;
					if (flags & MaterialFlags.ReflectanceMapOnly) environmentMaterial = material;
				}
			} else if (fullName.endsWith('.ifl')) {
				// Parse the .ifl file
				let keyframes = await IflParser.loadFile(ResourceManager.mainDataPath + this.directoryPath + '/' + fullName);
				this.materialInfo.set(material, { keyframes });

				// Preload all frames of the material animation
				let promises: Promise<any>[] = [];
				for (let frame of new Set(keyframes)) {
					promises.push(ResourceManager.getTexture(this.directoryPath + '/' + frame));
				}
				await Promise.all(promises);
			} else {
				let texture = await ResourceManager.getTexture(this.directoryPath + '/' + fullName, (flags & MaterialFlags.Translucent) === 0); // Make sure to remove the alpha of the texture if it's not flagged as translucent
				if (flags & MaterialFlags.S_Wrap) texture.wrapS = THREE.RepeatWrapping;
				if (flags & MaterialFlags.T_Wrap) texture.wrapT = THREE.RepeatWrapping;
				material.map = texture;
			}

			// Set some properties based on the flags
			if (flags & MaterialFlags.Translucent) {
				material.transparent = true;
				material.depthWrite = false;
			}
			if (flags & MaterialFlags.Additive) material.blending = THREE.AdditiveBlending;
			if (flags & MaterialFlags.Subtractive) material.blending = THREE.SubtractiveBlending;
			if (this.isTSStatic && !(flags & MaterialFlags.NeverEnvMap)) {
				material.combine = THREE.MixOperation;
				material.reflectivity = this.dts.matNames.length === 1? 1 : environmentMaterial? 0.5 : 0.333;
				material.envMap = this.level.envMap;
			}
		}

		// If there are no materials, atleast add one environment one
		if (this.materials.length === 0) {
			let mat = new THREE.MeshBasicMaterial({ envMap: this.level.envMap });
			this.materials.push(mat);
		}
	}

	/** Generates material geometry info from a given DTS mesh. */
	generateMaterialGeometry(dtsMesh: DtsFile["meshes"][number], vertices: THREE.Vector3[], vertexNormals: THREE.Vector3[]) {
		let materialGeometry = this.materials.map(() => {
			return {
				vertices: [] as number[],
				normals: [] as number[],
				uvs: [] as number[],
				indices: [] as number[]
			};
		});

		for (let primitive of dtsMesh.primitives) {
			let k = 0; // Keep track of current face for correct vertex winding order
			let geometryData = materialGeometry[primitive.matIndex];

			for (let i = primitive.start; i < primitive.start + primitive.numElements - 2; i++) {
				let i1 = dtsMesh.indices[i];
				let i2 = dtsMesh.indices[i+1];
				let i3 = dtsMesh.indices[i+2];

				if (k % 2 === 0) {
					// Swap the first and last index to mainting correct winding order
					let temp = i1;
					i1 = i3;
					i3 = temp;
				}

				for (let index of [i1, i2, i3]) {
					let vertex = vertices[index];
					geometryData.vertices.push(vertex.x, vertex.y, vertex.z);
	
					let uv = dtsMesh.tverts[index];
					geometryData.uvs.push(uv.x, uv.y);

					let normal = vertexNormals[index];
					geometryData.normals.push(normal.x, normal.y, normal.z);
				}

				geometryData.indices.push(i1, i2, i3);

				k++;
			}
		}

		return materialGeometry;
	}

	/** Generates collision objects for this shape. Geometry will be generated later. */
	generateCollisionObjects() {
		let bodyIndex = 0;

		for (let i = 0; i < this.dts.nodes.length; i++) {
			let objects = this.dts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				if (!this.dts.names[object.nameIndex].toLowerCase().startsWith("col")) continue;

				let body = this.bodies[bodyIndex++];
				for (let j = object.startMeshIndex; j < object.startMeshIndex + object.numMeshes; j++) {
					let mesh = this.dts.meshes[j];
					if (!mesh) continue;

					for (let primitive of mesh.primitives) {
						// Create the geometry but with all zero vectors for now
						let geometry = new OIMO.ConvexHullGeometry(Array(primitive.numElements).fill(null).map(x => new OIMO.Vec3()));

						let shapeConfig = new OIMO.ShapeConfig();
						shapeConfig.geometry = geometry;
						shapeConfig.restitution = this.restitution;
						shapeConfig.friction = this.friction;
						let shape = new OIMO.Shape(shapeConfig);
						shape.userData = this.id;

						body.addShape(shape);

						// Remember the actual untransformed vertices for this geometry
						let vertices = mesh.indices.slice(primitive.start, primitive.start + primitive.numElements)
							.map((index) => mesh.verts[index])
							.map((vert) => new THREE.Vector3(vert.x, vert.y, vert.z));
						this.shapeVertices.set(shape, vertices);
					}
				}
			}
		}

		if (bodyIndex === 0 && !this.isTSStatic) {
			// Create collision geometry based on the bounding box
			let body = this.bodies[0];

			let o = new OIMO.Vec3(this.dts.bounds.min.x, this.dts.bounds.min.y, this.dts.bounds.min.z);
			let dx = (this.dts.bounds.max.x - this.dts.bounds.min.x);
			let dy = (this.dts.bounds.max.y - this.dts.bounds.min.y);
			let dz = (this.dts.bounds.max.z - this.dts.bounds.min.z);

			// All 8 vertices of the bounding cuboid
			let vertices = [
				o,
				o.add(new OIMO.Vec3(dx, 0, 0)),
				o.add(new OIMO.Vec3(0, dy, 0)),
				o.add(new OIMO.Vec3(0, 0, dz)),
				o.add(new OIMO.Vec3(dx, dy, 0)),
				o.add(new OIMO.Vec3(dx, 0, dz)),
				o.add(new OIMO.Vec3(0, dy, dz)),
				o.add(new OIMO.Vec3(dx, dy, dz))
			].map(x => Util.vecOimoToThree(x));

			// Create an empty geometry for now
			let geometry = new OIMO.ConvexHullGeometry(Array(8).fill(null).map(x => new OIMO.Vec3()));
			let shapeConfig = new OIMO.ShapeConfig();
			shapeConfig.geometry = geometry;
			shapeConfig.restitution = this.restitution;
			shapeConfig.friction = this.friction;
			let shape = new OIMO.Shape(shapeConfig);
			shape.userData = this.id;
			body.addShape(shape);

			this.shapeVertices.set(shape, vertices);
		}
	}

	/** Recursively updates node transformations in the node tree.
	 * @param quaternions One quaternion for each node.
	 * @param translations One translation for each node.
	 * @param bitfield Specifies which nodes have changed.
	 */
	updateNodeTransforms(quaternions?: THREE.Quaternion[], translations?: THREE.Vector3[], bitfield = 0xffffffff) {
		if (!quaternions) {
			// Create the default array of quaternions
			quaternions = this.dts.nodes.map((node, index) => {
				let rotation = this.dts.defaultRotations[index];
				let quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
				quaternion.normalize();
				quaternion.conjugate();
	
				return quaternion;
			});
		}

		if (!translations) {
			// Create the default array of translations
			translations = this.dts.nodes.map((node, index) => {
				let translation = this.dts.defaultTranslations[index];
				return new THREE.Vector3(translation.x, translation.y, translation.z);
			});
		}

		let utilityMatrix = new THREE.Matrix4();

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
			
				utilityMatrix.compose(translations[node.index], quaternions[node.index], new THREE.Vector3(1, 1, 1));
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
			let mat: THREE.Matrix4;
			
			if (body.userData?.nodeIndex !== undefined) {
				if (((1 << body.userData.nodeIndex) & bitfield) === 0) continue;
				mat = this.worldMatrix.clone();
				mat.multiplyMatrices(this.worldMatrix, this.nodeTransforms[body.userData.nodeIndex]);
			} else {
				mat = this.worldMatrix;
			}

			// For all shapes...
			let currentShape = body.getShapeList();
			while (currentShape) {
				// Recompute all vertices by piping them through the matrix.
				let vertices = this.shapeVertices.get(currentShape)
					.map((vec) => vec.clone().applyMatrix4(mat))
					.map((vec) => Util.vecThreeToOimo(vec));

				// Then, assign the value to the vertices of the geometry
				let geometry = currentShape._geom as OIMO.ConvexHullGeometry;
				for (let i = 0; i < vertices.length; i++) {
					geometry._vertices[i].copyFrom(vertices[i]);
				}

				currentShape = currentShape.getNext();
			}

			// We need to call this for OIMO to update (sync) the shape
			body.setPosition(new OIMO.Vec3());
		}
	}

	tick(time: TimeState, onlyVisual = false) {
		// If onlyVisual is set, collision bodies need not be updated.

		if (!this.sharedData || !this.shareNodeTransforms) for (let sequence of this.dts.sequences) {
			if (!this.showSequences) break;
			if (!onlyVisual && !this.hasNonVisualSequences) break;

			let rot = sequence.rotationMatters[0] ?? 0;
			let trans = sequence.translationMatters[0] ?? 0;
			let affectedCount = 0;
			let completion = time.timeSinceLoad / (sequence.duration * 1000);
			let quaternions: THREE.Quaternion[];
			let translations: THREE.Vector3[];

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

					let quaternion1 = new THREE.Quaternion(rot1.x, rot1.y, rot1.z, rot1.w);
					quaternion1.normalize();
					quaternion1.conjugate();

					let quaternion2 = new THREE.Quaternion(rot2.x, rot2.y, rot2.z, rot2.w);
					quaternion2.normalize();
					quaternion2.conjugate();
					
					// Interpolate between the two quaternions
					quaternion1.slerp(quaternion2, t);

					affectedCount++;
					return quaternion1;
				} else {
					// The rotation for this node is not animated and therefore we returns the default rotation.
					let rotation = this.dts.defaultRotations[index];
					let quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
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

					// Interpolate between the two translations
					return new THREE.Vector3(Util.lerp(trans1.x, trans2.x, t), Util.lerp(trans1.y, trans2.y, t), Util.lerp(trans1.z, trans2.z, t));
				} else {
					// The translation for this node is not animated and therefore we returns the default translation.
					let translation = this.dts.defaultTranslations[index];
					return new THREE.Vector3(translation.x, translation.y, translation.z);
				}
			});

			if (rot || trans) {
				this.updateNodeTransforms(quaternions, translations, rot | trans);
				if (!onlyVisual) this.updateCollisionGeometry(rot | trans);
			}
		}
	}

	render(time: TimeState) {
		this.tick(time, true); // Execute an only-visual tick

		if (this.instancedMeshes.length > 0) {
			// If there are instanced meshes, update the corresponding matrices.
			for (let i = 0; i < this.objects.length; i++) {
				let obj = this.objects[i];
				obj.updateMatrixWorld();
				this.instancedMeshes[i].setMatrixAt(this.instanceIndex, obj.matrixWorld);
				this.instancedMeshes[i].instanceMatrix.needsUpdate = true;
			}
		}

		if (!this.sharedData && this.skinMeshInfo) {
			// Update the skin mesh.
			let info = this.skinMeshInfo;
			let mesh = this.dts.meshes[info.meshIndex];

			// Zero all vectors at first
			for (let i = 0; i < info.vertices.length; i++) {
				info.vertices[i].set(0, 0, 0);
				info.normals[i].set(0, 0, 0);
			}

			// Compute the transformation matrix for each bone
			let boneTransformations: THREE.Matrix4[] = [];
			let boneTransformationsTransposed: THREE.Matrix4[] = [];
			for (let i = 0; i < mesh.nodeIndices.length; i++) {
				let mat = new THREE.Matrix4();
				mat.elements = mesh.initialTransforms[i].slice();
				mat.transpose();
				mat.multiplyMatrices(this.nodeTransforms[mesh.nodeIndices[i]], mat);

				boneTransformations.push(mat);
				boneTransformationsTransposed.push(mat.clone().transpose());
			}

			// Now fill the vertex and normal vector values
			let vec = new THREE.Vector3();
			let vec2 = new THREE.Vector3();
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
			let positionAttribute = info.geometry.getAttribute('position');
			let normalAttribute = info.geometry.getAttribute('normal');
			let pos = 0;
			for (let index of info.indices) {
				let vertex = info.vertices[index];
				let normal = info.normals[index];

				positionAttribute.setXYZ(pos, vertex.x, vertex.y, vertex.z);
				normalAttribute.setXYZ(pos, normal.x, normal.y, normal.z);

				pos++;
			}

			// They need an upload to the GPU, so flag them
			positionAttribute.needsUpdate = true;
			normalAttribute.needsUpdate = true;
		}

		// Handle animated materials
		if (!this.sharedData || !this.shareMaterials) for (let i = 0; i < this.materials.length; i++) {
			let info = this.materialInfo.get(this.materials[i]);
			if (!info) continue;

			let iflSequence = this.dts.sequences.find((seq) => seq.iflMatters[0] > 0);
			if (!iflSequence || !this.showSequences) continue;

			let completion = time.timeSinceLoad / (iflSequence.duration * 1000);
			let keyframe = Math.floor(completion * info.keyframes.length) % info.keyframes.length;
			let currentFile = info.keyframes[keyframe];

			// Select the correct texture based on the frame and apply it
			let flags = this.dts.matFlags[i];
			let texture = ResourceManager.getTextureFromCache(this.directoryPath + '/' + currentFile);
			if (flags & MaterialFlags.S_Wrap) texture.wrapS = THREE.RepeatWrapping;
			if (flags & MaterialFlags.T_Wrap) texture.wrapT = THREE.RepeatWrapping;

			this.materials[i].map = texture;
			if (this.isTSStatic) this.materials[i].needsUpdate = true;
		}

		// Spin the shape round 'n' round
		if (this.ambientRotate) {
			let spinAnimation = new THREE.Quaternion();
			let up = new THREE.Vector3(0, 0, 1);
			spinAnimation.setFromAxisAngle(up, time.timeSinceLoad * this.ambientSpinFactor);

			let orientation = this.worldOrientation.clone();
			spinAnimation.multiplyQuaternions(orientation, spinAnimation);

			this.group.quaternion.copy(spinAnimation);
		}
	}

	/** Updates the transform of the shape's objects and bodies. */
	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion, scale: THREE.Vector3) {
		let scaleUpdated = scale.clone().sub(this.worldScale).length() !== 0;

		this.worldPosition = position;
		this.worldOrientation = orientation;
		this.worldScale = scale;
		this.worldMatrix.compose(position, orientation, scale);

		this.group.position.copy(position);
		this.group.quaternion.copy(orientation);
		this.group.scale.copy(scale);

		let colliderMatrix = new THREE.Matrix4();
		colliderMatrix.compose(this.worldPosition, this.worldOrientation, new THREE.Vector3(1, 1, 1));

		// Update the colliders
		for (let collider of this.colliders) {
			let mat = collider.transform.clone();
			mat.multiplyMatrices(colliderMatrix, mat);

			let position = new THREE.Vector3();
			let orientation = new THREE.Quaternion();
			mat.decompose(position, orientation, new THREE.Vector3());

			while (collider.body.getShapeList()) collider.body.removeShape(collider.body.getShapeList()); // Remove all shapes

			// Create the new shape
			let shapeConfig = new OIMO.ShapeConfig();
			shapeConfig.geometry = collider.generateGeometry(this.worldScale);
			let shape = new OIMO.Shape(shapeConfig);
			shape.userData = Util.getRandomId();
			collider.body.addShape(shape);
			collider.id = shape.userData;

			collider.body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
			collider.body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
		}

		if (scaleUpdated) this.generateCollisionObjects(); // We need to recompute the geometry if the scale changed; this will always be called at least once in the first call
		this.updateCollisionGeometry(0xffffffff); // Update collision geometry
	}

	/** Sets the opacity of the shape. Since there's no quick and easy way of doing this, this method recursively sets it for all materials. */
	setOpacity(opacity: number) {
		if (opacity === this.currentOpacity) return;
		this.currentOpacity = opacity;

		if (opacity === 0) {
			this.group.visible = false;
			return;
		} else {
			this.group.visible = true;
		}

		const updateMaterial = (material: THREE.Material) => {
			material.transparent = true;
			
			if (material instanceof THREE.ShadowMaterial) {
				material.opacity = opacity * 0.25; // Make sure the shadow isn't too dark
			} else {
				material.depthWrite = opacity > 0;
				material.opacity = opacity;
			}
		};

		const setOpacityOfChildren = (group: THREE.Group) => {
			for (let child of group.children) {
				if (child.type === 'Group') {
					setOpacityOfChildren(child as THREE.Group);
					continue;
				}

				let mesh = child as THREE.Mesh;
				if (!mesh.material) continue;
	
				if (mesh.material instanceof THREE.Material) updateMaterial(mesh.material);
				else for (let material of (mesh.material as THREE.Material[])) updateMaterial(material);
			}
		};

		setOpacityOfChildren(this.group);
	}

	/** Adds a collider geometry. Whenever the marble overlaps with the geometry, a callback is fired. */
	addCollider(generateGeometry: (scale: THREE.Vector3) => OIMO.Geometry, onInside: () => void, localTransform: THREE.Matrix4) {
		let config = new OIMO.RigidBodyConfig();
		config.type = OIMO.RigidBodyType.STATIC;
		let body = new OIMO.RigidBody(config);

		this.colliders.push({
			generateGeometry: generateGeometry,
			body: body,
			id: null,
			onInside: onInside,
			transform: localTransform
		});
	}

	onColliderInside(id: number) {
		let collider = this.colliders.find((collider) => collider.id === id);
		collider.onInside();
	}

	/** Enable or disable collision. */
	setCollisionEnabled(enabled: boolean) {
		let collisionMask = enabled? 1 : 0;

		for (let body of this.bodies) {
			let shape = body.getShapeList();
			while (shape) {
				shape.setCollisionMask(collisionMask);
				shape = shape.getNext();
			}
		}
	}

	dispose() {
		for (let material of this.materials) material.dispose();
		for (let geometry of this.geometries) geometry.dispose();
	}

	onMarbleContact(time: TimeState, contact?: OIMO.Contact): (boolean | void) {}
	onMarbleInside(time: TimeState) {}
	onMarbleEnter(time: TimeState) {}
	onMarbleLeave(time: TimeState) {}
	reset() {}
	async onLevelStart() {}
}