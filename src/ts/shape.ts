import { DtsFile, MeshType, Quat16, DtsParser } from "./parsing/dts_parser";
import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { IflParser } from "./parsing/ifl_parser";

interface MaterialInfo {
	keyframes: string[]
}

interface SkinMeshData {
	meshIndex: number,
	vertices: THREE.Vector3[],
	vertexNormals: THREE.Vector3[],
	group: THREE.Group
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

export class Shape {
	dtsPath: string;
	dts: DtsFile;
	directoryPath: string;
	group: THREE.Group;
	bodies: OIMO.RigidBody[];
	matNamesOverride: Record<string, string> = {};
	materials: (THREE.MeshLambertMaterial | THREE.MeshBasicMaterial)[];
	materialInfo: WeakMap<THREE.Material, MaterialInfo>;
	nodeTransforms: THREE.Matrix4[] = [];
	skinMeshInfo: SkinMeshData[] = [];
	isItem = false;
	worldPosition = new THREE.Vector3();
	worldOrientation = new THREE.Quaternion();

	async init() {
		this.dts = await DtsParser.loadFile('./assets/data/' + this.dtsPath);
		this.directoryPath = this.dtsPath.slice(0, this.dtsPath.lastIndexOf('/'));

		this.group = new THREE.Group();
		this.bodies = [];
		this.materials = [];
		this.materialInfo = new WeakMap();
		
		this.updateNodeTransforms();

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
			} else {
				let texture = ResourceManager.getTexture(this.directoryPath + '/' + fullName);
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

		for (let i = 0; i < this.dts.nodes.length; i++) {
			let objects = this.dts.objects.filter((object) => object.nodeIndex === i);

			for (let object of objects) {
				if (this.dts.names[object.nameIndex].startsWith("Col")) {
					let config = new OIMO.RigidBodyConfig();
					config.type = OIMO.RigidBodyType.STATIC;
					let body = new OIMO.RigidBody(config);
	
					for (let j = object.startMeshIndex; j < object.startMeshIndex + object.numMeshes; j++) {
						let mesh = this.dts.meshes[j];
						if (!mesh) continue;
	
						for (let primitive of mesh.primitives) {
							let mat = this.nodeTransforms[i];
							let vertices = mesh.indices.slice(primitive.start, primitive.start + primitive.numElements)
								.map((index) => mesh.verts[index])
								.map((vert) => (new THREE.Vector3(vert.x, vert.y, vert.z)).applyMatrix4(mat))
								.map((vert) => new OIMO.Vec3(vert.x, vert.y, vert.z));
							let geometry = new OIMO.ConvexHullGeometry(vertices);
	
							let shapeConfig = new OIMO.ShapeConfig();
							shapeConfig.geometry = geometry;
							shapeConfig.restitution = 0.4;
							shapeConfig.friction = 1;
							let shape = new OIMO.Shape(shapeConfig);
							body.addShape(shape);
						}
					}
					
					/*
					let translation = dtsFile.defaultTranslations[i];
					let rotation = dtsFile.defaultRotations[i];
	
					body.setPosition(new OIMO.Vec3(translation.x, translation.y, translation.z));
					let quaternion = body.getOrientation();
					quaternion.x = -rotation.x; quaternion.y = -rotation.y; quaternion.z = -rotation.z; quaternion.w = rotation.w;
					quaternion.normalize();
					body.setOrientation(quaternion);*/
	
					this.bodies.push(body);
				} else {
					let nodeGroup = new THREE.Group();
					this.group.add(nodeGroup);
					nodeGroup.matrixAutoUpdate = false;
					nodeGroup.matrix = this.nodeTransforms[i];

					for (let i = object.startMeshIndex; i < object.startMeshIndex + object.numMeshes; i++) {
						let mesh = this.dts.meshes[i];
						if (!mesh) continue;

						let vertices = mesh.verts.map((v) => new THREE.Vector3(v.x, v.y, v.z));
						let vertexNormals = mesh.norms.map((v) => new THREE.Vector3(v.x, v.y, v.z));
						this.addMeshGeometry(mesh, vertices, vertexNormals, nodeGroup);
					}
				}
			}
		}

		for (let i = 0; i < this.dts.meshes.length; i++) {
			let mesh = this.dts.meshes[i];
			if (!mesh || mesh.type !== MeshType.Skin) continue;

			let group = new THREE.Group();

			let vertices = new Array(mesh.verts.length).fill(null).map(() => new THREE.Vector3());
			let vertexNormals = new Array(mesh.norms.length).fill(null).map(() => new THREE.Vector3());
			this.addMeshGeometry(mesh, vertices, vertexNormals, group);

			this.group.add(group);

			this.skinMeshInfo.push({
				meshIndex: i,
				vertices: vertices,
				vertexNormals: vertexNormals,
				group: group
			});
		}

		if (this.bodies.length === 0) {
			let dx = this.dts.bounds.max.x - this.dts.bounds.min.x;
			let dy = this.dts.bounds.max.y - this.dts.bounds.min.y;
			let dz = this.dts.bounds.max.z - this.dts.bounds.min.z;

			let config = new OIMO.RigidBodyConfig();
			config.type = OIMO.RigidBodyType.STATIC;
			let body = new OIMO.RigidBody(config);

			let geometry = new OIMO.BoxGeometry(new OIMO.Vec3(dx/2, dy/2, dz/2));
			let shapeConfig = new OIMO.ShapeConfig();
			shapeConfig.geometry = geometry;
			shapeConfig.restitution = 0.4;
			shapeConfig.friction = 1;
			let shape = new OIMO.Shape(shapeConfig);
			body.addShape(shape);

			this.bodies.push(body);
		}
	}

	addMeshGeometry(dtsMesh: DtsFile["meshes"][number], vertices: THREE.Vector3[], vertexNormals: THREE.Vector3[], group: THREE.Group) {
		let geometry = new THREE.Geometry();
		geometry.vertices = vertices;

		for (let primitive of dtsMesh.primitives) {
			let k = 0;
			for (let i = primitive.start; i < primitive.start + primitive.numElements - 2; i++) {
				let i1 = dtsMesh.indices[i];
				let i2 = dtsMesh.indices[i+1];
				let i3 = dtsMesh.indices[i+2];

				if (k % 2 === 0) [i1, i3] = [i3, i1];
				let face = new THREE.Face3(i1, i2, i3);
				face.materialIndex = primitive.matIndex;
				geometry.faces.push(face);

				let uvs = [i1, i2, i3].map((x) => new THREE.Vector2(dtsMesh.tverts[x].x, dtsMesh.tverts[x].y));
				geometry.faceVertexUvs[0].push(uvs);

				face.vertexNormals = [vertexNormals[i1], vertexNormals[i2], vertexNormals[i3]];

				k++;
			}

			geometry.computeFaceNormals();
			geometry.computeVertexNormals();	
		}

		let threeMesh = new THREE.Mesh(geometry, this.materials);
		group.add(threeMesh);
	}

	updateNodeTransforms(quaternions?: THREE.Quaternion[]) {
		if (this.nodeTransforms.length === 0) {
			for (let i = 0; i < this.dts.nodes.length; i++) this.nodeTransforms.push(new THREE.Matrix4());
		}
		if (!quaternions) {
			quaternions = this.dts.defaultRotations.map((rot) => {
				let quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
				quaternion.normalize();
				quaternion.conjugate();

				return quaternion;
			});
		}

		let queue = this.dts.nodes.slice();
		let utilityMatrix = new THREE.Matrix4();

		while (queue.length > 0) {
			let node = queue.shift();
			let mat = this.nodeTransforms[node.index];

			if (node.parentIndex === -1) {
				mat.identity();
			} else if (!queue.includes(this.dts.nodes[node.parentIndex])) {
				mat.copy(this.nodeTransforms[node.parentIndex]);
			} else {
				queue.push(node);
				continue;
			}
	
			let translation = this.dts.defaultTranslations[node.index];
			
			utilityMatrix.identity();
			utilityMatrix.compose(new THREE.Vector3(translation.x, translation.y, translation.z), quaternions[node.index], new THREE.Vector3(1, 1, 1));

			mat.multiplyMatrices(mat, utilityMatrix);
		}
	}

	render(time: number) {
		for (let sequence of this.dts.sequences) {
			let rot = sequence.rotationMatters[0];
			let affectedCount = 0;
			let completion = time / (sequence.duration * 1000);

			if (rot > 0) {
				let actualKeyframe = (completion * sequence.numKeyframes) % sequence.numKeyframes;
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
				this.updateNodeTransforms(quaternions);
			}
		}

		for (let info of this.skinMeshInfo) {
			let mesh = this.dts.meshes[info.meshIndex];

			for (let i = 0; i < info.vertices.length; i++) {
				info.vertices[i].set(0, 0, 0);
				info.vertexNormals[i].set(0, 0, 0);
			}

			let boneTransformations: THREE.Matrix4[] = [];
			for (let i = 0; i < mesh.nodeIndices.length; i++) {
				let mat = new THREE.Matrix4();
				mat.elements = mesh.initialTransforms[i].slice(0);
				mat.transpose();
				mat.multiplyMatrices(this.nodeTransforms[mesh.nodeIndices[i]], mat);

				boneTransformations.push(mat);
			}

			for (let i = 0; i < mesh.vertIndices.length; i++) {
				let vertex = mesh.verts[mesh.vertIndices[i]];
				let normal = mesh.norms[mesh.vertIndices[i]];
				let vec = new THREE.Vector3(vertex.x, vertex.y, vertex.z);
				let vec2 = new THREE.Vector3(normal.x, normal.y, normal.z);
				let mat = boneTransformations[mesh.boneIndices[i]];

				vec.applyMatrix4(mat);
				vec.multiplyScalar(mesh.weights[i]);
				vec2.applyMatrix4(mat);
				vec2.multiplyScalar(mesh.weights[i]);

				info.vertices[mesh.vertIndices[i]].add(vec);
				info.vertexNormals[mesh.vertIndices[i]].add(vec2);
			}

			for (let bruh of info.group.children) {
				let mesh = bruh as THREE.Mesh;
				let geometry = mesh.geometry as THREE.Geometry;
				geometry.verticesNeedUpdate = true;

				geometry.computeFaceNormals();
			}
		}

		for (let i = 0; i < this.materials.length; i++) {
			let info = this.materialInfo.get(this.materials[i]);
			if (!info) continue;

			let iflSequence = this.dts.sequences.find((seq) => seq.iflMatters[0] > 0);
			if (!iflSequence) continue;

			let completion = time / (iflSequence.duration * 1000);
			let keyframe = Math.floor(completion * info.keyframes.length) % info.keyframes.length;
			let currentFile = info.keyframes[keyframe];

			let flags = this.dts.matFlags[i];
			let texture = ResourceManager.getTexture(this.directoryPath + '/' + currentFile);
			if (flags & MaterialFlags.S_Wrap) texture.wrapS = THREE.RepeatWrapping;
			if (flags & MaterialFlags.T_Wrap) texture.wrapT = THREE.RepeatWrapping;

			this.materials[i].map = texture;
		}

		if (this.isItem) {
			let spinAnimation = new THREE.Quaternion();
			let up = new THREE.Vector3(0, 0, 1);
			spinAnimation.setFromAxisAngle(up, -time / 3000 * Math.PI * 2);

			let orientation = this.worldOrientation.clone();
			spinAnimation.multiplyQuaternions(orientation, spinAnimation);

			this.group.quaternion.copy(spinAnimation);
		}
	}

	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion) {
		this.worldPosition = position;
		this.worldOrientation = orientation;

		this.group.position.copy(position);
		this.group.quaternion.copy(orientation);

		for (let body of this.bodies) {
			body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
			body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
		}
	}
}