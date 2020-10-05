import { DtsFile, MeshType, DtsParser } from "./parsing/dts_parser";
import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { IflParser } from "./parsing/ifl_parser";
import { getUniqueId, state } from "./state";
import { Util } from "./util";
import { TimeState, Level } from "./level";
import { INTERIOR_DEFAULT_RESTITUTION, INTERIOR_DEFAULT_FRICTION } from "./interior";
import { AudioManager } from "./audio";

interface MaterialInfo {
	keyframes: string[]
}

interface SkinMeshData {
	meshIndex: number,
	vertices: THREE.Vector3[],
	vertexNormals: THREE.Vector3[],
	group: THREE.Group
}

interface ColliderInfo {
	body: OIMO.RigidBody,
	id: number,
	onInside: () => void,
	transform: THREE.Matrix4
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
	IflMaterial = 1 << 9,
	IflFrame = 1 << 10,
	DetailMapOnly = 1 << 11,
	BumpMapOnly = 1 << 12,
	ReflectanceMapOnly = 1 << 13
}

interface GraphNode {
	index: number,
	node: DtsFile["nodes"][number],
	children: GraphNode[],
	parent?: GraphNode,
	bodies: OIMO.RigidBody[]
}

let GEOM = new THREE.SphereBufferGeometry(0.3);
let MAT = new THREE.MeshLambertMaterial({color: 0xff0000});

export class Shape {
	id: number;
	level: Level;
	dtsPath: string;
	dts: DtsFile;
	directoryPath: string;
	group: THREE.Group;
	bodies: OIMO.RigidBody[];
	bodiesLocalTranslation: WeakMap<OIMO.RigidBody, OIMO.Vec3>;
	matNamesOverride: Record<string, string> = {};
	materials: (THREE.MeshLambertMaterial | THREE.MeshBasicMaterial)[];
	materialInfo: WeakMap<THREE.Material, MaterialInfo>;
	nodeTransforms: THREE.Matrix4[] = [];
	skinMeshInfo: SkinMeshData[] = [];
	collideable = true;
	ambientRotate = false;
	ambientSpinFactor = -1 / 3000 * Math.PI * 2;
	worldPosition = new THREE.Vector3();
	worldOrientation = new THREE.Quaternion();
	worldScale = new THREE.Vector3();
	worldMatrix = new THREE.Matrix4();
	currentOpacity = 1;
	showSequences = true;
	hasNonVisualSequences = false;
	colliders: ColliderInfo[] = [];
	sequenceKeyframeOverride = new WeakMap<DtsFile["sequences"][number], number>();
	lastSequenceKeyframes = new WeakMap<DtsFile["sequences"][number], number>();
	restitution = INTERIOR_DEFAULT_RESTITUTION;
	friction = INTERIOR_DEFAULT_FRICTION;
	sounds: string[] = [];
	rootGraphNodes: GraphNode[] = [];

	async init(level?: Level) {
		this.id = getUniqueId();
		this.level = level;
		this.dts = await DtsParser.loadFile('./assets/data/' + this.dtsPath);
		this.directoryPath = this.dtsPath.slice(0, this.dtsPath.lastIndexOf('/'));

		this.group = new THREE.Group();
		this.bodies = [];
		this.materials = [];
		this.materialInfo = new WeakMap();
		this.bodiesLocalTranslation = new WeakMap();

		console.log(this.dts);
		
		for (let i = 0; i < this.dts.nodes.length; i++) this.nodeTransforms.push(new THREE.Matrix4());

		for (let i = 0; i < this.dts.matNames.length; i++) {
			let matName = this.matNamesOverride[this.dts.matNames[i]] ||  this.dts.matNames[i];
			let flags = this.dts.matFlags[i];
			let fullName = ResourceManager.getFullNameOf(this.directoryPath + '/' + matName).filter((x) => !x.endsWith('.dts'))[0];

			let material = (flags & MaterialFlags.SelfIlluminating) ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
			this.materials.push(material);

			if (!fullName) {
				
			} else if (fullName.endsWith('.ifl')) {
				let keyframes = await IflParser.loadFile('./assets/data/' + this.directoryPath + '/' + fullName);
				this.materialInfo.set(material, { keyframes });

				let promises: Promise<any>[] = [];
				for (let frame of new Set(keyframes)) {
					promises.push(ResourceManager.getTexture(this.directoryPath + '/' + frame));
				}
				await Promise.all(promises);
			} else {
				let texture = await ResourceManager.getTexture(this.directoryPath + '/' + fullName, (flags & MaterialFlags.Translucent) === 0);
				if (flags & MaterialFlags.S_Wrap) texture.wrapS = THREE.RepeatWrapping;
				if (flags & MaterialFlags.T_Wrap) texture.wrapT = THREE.RepeatWrapping;
				material.map = texture;
			}

			if (flags & MaterialFlags.Translucent) {
				material.transparent = true;
				material.depthWrite = false;
			}
			if (flags & MaterialFlags.Additive) material.blending = THREE.AdditiveBlending;
			if (flags & MaterialFlags.Subtractive) material.blending = THREE.SubtractiveBlending;
		}

		let graphNodes: GraphNode[] = [];
		for (let i = 0; i < this.dts.nodes.length; i++) {
			let graphNode: GraphNode = {
				index: i,
				node: this.dts.nodes[i],
				children: [],
				parent: null,
				bodies: []
			};
			graphNodes.push(graphNode);

			let objects = this.dts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				let isCollisionObject = this.dts.names[object.nameIndex].startsWith("Col");
				if (isCollisionObject) {
					let config = new OIMO.RigidBodyConfig();
					config.type = OIMO.RigidBodyType.STATIC;
					let body = new OIMO.RigidBody(config);
					body.userData = { nodeIndex: i };

					this.bodies.push(body);
					graphNode.bodies.push(body);
				}

				if (!isCollisionObject || this.collideable) {
					let nodeGroup = new THREE.Group();
					this.group.add(nodeGroup);
					nodeGroup.matrixAutoUpdate = false;
					nodeGroup.matrix = this.nodeTransforms[i];
	
					for (let i = object.startMeshIndex; i < object.startMeshIndex + object.numMeshes; i++) {
						let mesh = this.dts.meshes[i];
						if (!mesh) continue;
	
						let vertices = mesh.verts.map((v) => new THREE.Vector3(v.x, v.y, v.z));
						let vertexNormals = mesh.norms.map((v) => new THREE.Vector3(v.x, v.y, v.z));
						this.addMeshGeometry(mesh, vertices, vertexNormals, nodeGroup, isCollisionObject);
					}
				}
			}
		}

		for (let i = 0; i < this.dts.nodes.length; i++) {
			let node = this.dts.nodes[i];
			if (node.parentIndex !== -1) {
				graphNodes[i].parent = graphNodes[node.parentIndex];
				graphNodes[node.parentIndex].children.push(graphNodes[i]);
			}
		}
		this.rootGraphNodes = graphNodes.filter((node) => !node.parent);
		this.updateNodeTransforms();

		for (let i = 0; i < this.dts.meshes.length; i++) {
			let mesh = this.dts.meshes[i];
			if (!mesh || mesh.type !== MeshType.Skin) continue;

			let group = new THREE.Group();

			let vertices = new Array(mesh.verts.length).fill(null).map(() => new THREE.Vector3());
			let vertexNormals = new Array(mesh.norms.length).fill(null).map(() => new THREE.Vector3());
			this.addMeshGeometry(mesh, vertices, vertexNormals, group, false);

			this.group.add(group);

			this.skinMeshInfo.push({
				meshIndex: i,
				vertices: vertices,
				vertexNormals: vertexNormals,
				group: group
			});
		}

		if (this.bodies.length === 0) {
			let config = new OIMO.RigidBodyConfig();
			config.type = OIMO.RigidBodyType.STATIC;
			let body = new OIMO.RigidBody(config);
			this.bodies.push(body);
		}

		for (let sound of this.sounds) {
			await AudioManager.loadBuffer(sound);
		}

		if (this.level) this.level.loadingState.loaded++;
	}

	addMeshGeometry(dtsMesh: DtsFile["meshes"][number], vertices: THREE.Vector3[], vertexNormals: THREE.Vector3[], group: THREE.Group, isCollisionMesh: boolean) {
		let geometry = new THREE.BufferGeometry();
		let materialGeometry = this.dts.matNames.map(() => {
			return {
				vertices: [] as number[],
				normals: [] as number[],
				uvs: [] as number[]
			};
		});

		for (let primitive of dtsMesh.primitives) {
			let k = 0;
			let geometryData = materialGeometry[primitive.matIndex];

			for (let i = primitive.start; i < primitive.start + primitive.numElements - 2; i++) {
				let i1 = dtsMesh.indices[i];
				let i2 = dtsMesh.indices[i+1];
				let i3 = dtsMesh.indices[i+2];

				if (k % 2 === 0) {
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

				k++;
			}
		}

		geometry.setAttribute('position', new THREE.Float32BufferAttribute(Util.concatArrays(materialGeometry.map((x) => x.vertices)), 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Util.concatArrays(materialGeometry.map((x) => x.normals)), 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Util.concatArrays(materialGeometry.map((x) => x.uvs)), 2));

		let current = 0;
		for (let i = 0; i < materialGeometry.length; i++) {
			if (materialGeometry[i].vertices.length === 0) continue;

			geometry.addGroup(current, materialGeometry[i].vertices.length / 3, i);
			current += materialGeometry[i].vertices.length / 3;
		}

		let material: THREE.Material | THREE.Material[];
		if (isCollisionMesh)return // material = new THREE.ShadowMaterial({ opacity: 0.25, depthWrite: false });
		else material = this.materials;

		let threeMesh = new THREE.Mesh(GEOM ?? geometry, new THREE.MeshLambertMaterial({color: 0xff0000}) ?? material);
		if (isCollisionMesh) threeMesh.receiveShadow = true;

		group.add(threeMesh);
	}

	generateCollisionGeometry() {
		let bodyIndex = 0;

		for (let i = 0; i < this.dts.nodes.length; i++) {
			let objects = this.dts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				if (!this.dts.names[object.nameIndex].startsWith("Col")) continue;

				let body = this.bodies[bodyIndex++];
				while (body.getNumShapes() > 0) body.removeShape(body.getShapeList()); // Remove all previous shapes

				for (let j = object.startMeshIndex; j < object.startMeshIndex + object.numMeshes; j++) {
					let mesh = this.dts.meshes[j];
					if (!mesh) continue;

					for (let primitive of mesh.primitives) {
						let vertices = mesh.indices.slice(primitive.start, primitive.start + primitive.numElements)
							.map((index) => mesh.verts[index])
							.map((vert) => new OIMO.Vec3(vert.x * this.worldScale.x, vert.y * this.worldScale.y, vert.z * this.worldScale.z));
						let geometry = new OIMO.ConvexHullGeometry(vertices);

						let shapeConfig = new OIMO.ShapeConfig();
						shapeConfig.geometry = geometry;
						shapeConfig.restitution = this.restitution;
						shapeConfig.friction = this.friction;
						let shape = new OIMO.Shape(shapeConfig);
						shape.userData = this.id;

						body.addShape(shape);
					}
				}
			}
		}

		if (bodyIndex === 0) {
			let body = this.bodies[0];
			while (body.getNumShapes() > 0) body.removeShape(body.getShapeList()); // Remove all previous shapes

			let dx = (this.dts.bounds.max.x - this.dts.bounds.min.x) * this.worldScale.x;
			let dy = (this.dts.bounds.max.y - this.dts.bounds.min.y) * this.worldScale.y;
			let dz = (this.dts.bounds.max.z - this.dts.bounds.min.z) * this.worldScale.z;

			let geometry = new OIMO.BoxGeometry(new OIMO.Vec3(dx/2, dy/2, dz/2));
			let shapeConfig = new OIMO.ShapeConfig();
			shapeConfig.geometry = geometry;
			shapeConfig.restitution = this.restitution;
			shapeConfig.friction = this.friction;
			let shape = new OIMO.Shape(shapeConfig);
			shape.userData = this.id;
			body.addShape(shape);

			this.bodiesLocalTranslation.set(body, new OIMO.Vec3(
				Util.avg(this.dts.bounds.max.x, this.dts.bounds.min.x),
				Util.avg(this.dts.bounds.max.y, this.dts.bounds.min.y),
				Util.avg(this.dts.bounds.max.z, this.dts.bounds.min.z)
			));
		}
	}

	updateNodeTransforms(quaternions?: THREE.Quaternion[], bitfield = 0xffffffff) {
		if (!quaternions) {
			quaternions = this.dts.nodes.map((node, index) => {
				let rotation = this.dts.defaultRotations[index];
				let quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
				quaternion.normalize();
				quaternion.conjugate();
	
				return quaternion;
			});
		}

		let utilityMatrix = new THREE.Matrix4();

		const traverse = (node: GraphNode, needsUpdate: boolean) => {
			if (((1 << node.index) & bitfield) !== 0) needsUpdate = true;

			if (needsUpdate) {
				let mat = this.nodeTransforms[node.index];

				if (!node.parent) {
					mat.identity();
				} else {
					mat.copy(this.nodeTransforms[node.parent.index]);
				}

				let translation = this.dts.defaultTranslations[node.index];
			
				utilityMatrix.compose(new THREE.Vector3(translation.x, translation.y, translation.z), quaternions[node.index], new THREE.Vector3(1, 1, 1));
				mat.multiplyMatrices(mat, utilityMatrix);
			}

			for (let i = 0; i < node.children.length; i++) traverse(node.children[i], needsUpdate);
		};

		for (let i = 0; i < this.rootGraphNodes.length; i++) {
			let rootNode = this.rootGraphNodes[i];
			traverse(rootNode, false);
		}
	}

	updateBodyTransforms(bitfield: number) {
		for (let i = 0; i < this.bodies.length; i++) {
			let body = this.bodies[i];
			let mat: THREE.Matrix4;

			if (body.userData?.nodeIndex !== undefined) {
				if (((1 << body.userData.nodeIndex) & bitfield) === 0) continue;
				mat = this.nodeTransforms[body.userData.nodeIndex].clone();
				mat.multiplyMatrices(this.worldMatrix, mat);
			} else {
				mat = this.worldMatrix;
			}

			let position = new THREE.Vector3();
			let orientation = new THREE.Quaternion();
			mat.decompose(position, orientation, new THREE.Vector3());

			let localTranslation = this.bodiesLocalTranslation.get(body);
			if (!localTranslation) localTranslation = new OIMO.Vec3();

			body.setPosition(new OIMO.Vec3(position.x + localTranslation.x, position.y + localTranslation.y, position.z + localTranslation.z));
			body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
		}
	}

	tick(time: TimeState, onlyVisual = false) {
		for (let sequence of this.dts.sequences) {
			if (!this.showSequences) break;
			if (!onlyVisual && !this.hasNonVisualSequences) break;

			let rot = sequence.rotationMatters[0];
			let affectedCount = 0;
			let completion = time.timeSinceLoad / (sequence.duration * 1000);

			if (rot > 0) {
				let actualKeyframe = this.sequenceKeyframeOverride.get(sequence) ?? (completion * sequence.numKeyframes) % sequence.numKeyframes;
				if (this.lastSequenceKeyframes.get(sequence) === actualKeyframe) continue;
				this.lastSequenceKeyframes.set(sequence, actualKeyframe);

				let keyframeLow = Math.floor(actualKeyframe);
				let keyframeHigh = Math.ceil(actualKeyframe) % sequence.numKeyframes;
				let t = (actualKeyframe - keyframeLow) % 1;

				let quaternions = this.dts.nodes.map((node, index) => {
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
						
						quaternion1.slerp(quaternion2, t);

						affectedCount++;
						return quaternion1;
					} else {
						let rotation = this.dts.defaultRotations[index];
						let quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
						quaternion.normalize();
						quaternion.conjugate();

						return quaternion;
					}
				});

				this.updateNodeTransforms(quaternions, rot);
				if (!onlyVisual) this.updateBodyTransforms(rot);
			}
		}
	}

	render(time: TimeState) {
		return
		this.tick(time, true);

		for (let info of this.skinMeshInfo) {
			let mesh = this.dts.meshes[info.meshIndex];

			for (let i = 0; i < info.vertices.length; i++) {
				info.vertices[i].set(0, 0, 0);
				info.vertexNormals[i].set(0, 0, 0);
			}

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

			for (let i = 0; i < mesh.vertIndices.length; i++) {
				let vIndex = mesh.vertIndices[i];
				let vertex = mesh.verts[vIndex];
				let normal = mesh.norms[vIndex];

				let vec = new THREE.Vector3(vertex.x, vertex.y, vertex.z);
				let vec2 = new THREE.Vector3(normal.x, normal.y, normal.z);
				let mat = boneTransformations[mesh.boneIndices[i]];

				vec.applyMatrix4(mat);
				vec.multiplyScalar(mesh.weights[i]);
				Util.m_matF_x_vectorF(mat, vec2);
				vec2.multiplyScalar(mesh.weights[i]);

				info.vertices[vIndex].add(vec);
				info.vertexNormals[vIndex].add(vec2);
			}

			for (let i = 0; i < info.vertexNormals.length; i++) {
				let norm = info.vertexNormals[i];
				let len2 = norm.dot(norm);

				if (len2 > 0.01) norm.normalize();
			}

			for (let child of info.group.children) {
				let mesh = child as THREE.Mesh;
				let geometry = mesh.geometry as THREE.Geometry;
				geometry.verticesNeedUpdate = true;
				geometry.normalsNeedUpdate = true;
			}
		}

		for (let i = 0; i < this.materials.length; i++) {
			let info = this.materialInfo.get(this.materials[i]);
			if (!info) continue;

			let iflSequence = this.dts.sequences.find((seq) => seq.iflMatters[0] > 0);
			if (!iflSequence || !this.showSequences) continue;

			let completion = time.timeSinceLoad / (iflSequence.duration * 1000);
			let keyframe = Math.floor(completion * info.keyframes.length) % info.keyframes.length;
			let currentFile = info.keyframes[keyframe];

			let flags = this.dts.matFlags[i];
			let texture = ResourceManager.getTextureFromCache(this.directoryPath + '/' + currentFile);
			if (flags & MaterialFlags.S_Wrap) texture.wrapS = THREE.RepeatWrapping;
			if (flags & MaterialFlags.T_Wrap) texture.wrapT = THREE.RepeatWrapping;

			this.materials[i].map = texture;
		}

		if (this.ambientRotate) {
			let spinAnimation = new THREE.Quaternion();
			let up = new THREE.Vector3(0, 0, 1);
			spinAnimation.setFromAxisAngle(up, time.timeSinceLoad * this.ambientSpinFactor);

			let orientation = this.worldOrientation.clone();
			spinAnimation.multiplyQuaternions(orientation, spinAnimation);

			this.group.quaternion.copy(spinAnimation);
		}
	}

	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion, scale: THREE.Vector3) {
		let scaleUpdated = scale.clone().sub(this.worldScale).length() !== 0;

		this.worldPosition = position;
		this.worldOrientation = orientation;
		this.worldScale = scale;
		this.worldMatrix.compose(position, orientation, scale);

		this.group.position.copy(position);
		this.group.quaternion.copy(orientation);
		this.group.scale.copy(scale);

		for (let collider of this.colliders) {
			let mat = collider.transform.clone();
			mat.multiplyMatrices(this.worldMatrix, mat);

			let position = new THREE.Vector3();
			let orientation = new THREE.Quaternion();
			mat.decompose(position, orientation, new THREE.Vector3());

			collider.body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
			collider.body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
		}

		if (scaleUpdated) this.generateCollisionGeometry();
		this.updateBodyTransforms(0xffffffff);
	}

	setOpacity(opacity: number) {
		if (opacity === this.currentOpacity) return;

		const updateMaterial = (material: THREE.Material) => {
			material.transparent = true;
			
			if (material instanceof THREE.ShadowMaterial) {
				material.opacity = opacity * 0.25;
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
		this.currentOpacity = opacity;
	}

	addCollider(geometry: OIMO.Geometry, onInside: () => void, localTransform: THREE.Matrix4) {
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = geometry;
		let shape = new OIMO.Shape(shapeConfig);
		shape.userData = getUniqueId();
		let config = new OIMO.RigidBodyConfig();
		config.type = OIMO.RigidBodyType.STATIC;
		let body = new OIMO.RigidBody(config);
		body.addShape(shape);

		this.colliders.push({
			body: body,
			id: shape.userData,
			onInside: onInside,
			transform: localTransform
		});
	}

	onColliderInside(id: number) {
		let collider = this.colliders.find((collider) => collider.id === id);
		collider.onInside();
	}

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

	onMarbleContact(contact: OIMO.Contact, time: TimeState) {}
	onMarbleInside(time: TimeState) {}
	onMarbleEnter(time: TimeState) {}
	onMarbleLeave(time: TimeState) {}
	reset() {}
	async onLevelStart() {}
}