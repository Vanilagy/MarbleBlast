import materialVert from './shaders/material_vert.glsl';
import materialFrag from './shaders/material_frag.glsl';
import THREE from "three";
import { AmbientLight } from "./ambient_light";
import { BufferAttribute } from "./buffer_attribute";
import { DirectionalLight } from "./directional_light";
import { Group } from "./group";
import { Material } from "./material";
import { MaterialIndexData, Mesh } from "./mesh";
import { Renderer } from "./renderer";
import { Program } from './program';
import { Util } from '../util';
import { ParticleManager } from '../particles';

export interface MaterialGroup {
	material: Material,
	indexGroups: MaterialIndexData[],
	defineChunk: string,
	offset: number,
	count: number,
	minDistance?: number
}

export class Scene extends Group {
	renderer: Renderer;
	positionBuffer: BufferAttribute;
	normalBuffer: BufferAttribute;
	tangentBuffer: BufferAttribute;
	uvBuffer: BufferAttribute;
	meshInfoIndexBuffer: BufferAttribute;

	meshInfoBuffer: Float32Array;
	meshInfoTexture: WebGLTexture;
	meshInfoTextureWidth: number;
	meshInfoTextureHeight: number;

	allMeshes: Mesh[];
	opaqueMaterialGroups: MaterialGroup[];
	transparentMaterialGroups: MaterialGroup[];
	opaqueIndexBuffer: WebGLBuffer;
	transparentIndexBuffer: WebGLBuffer;
	transparentIndexBufferData: Uint32Array;
	shadowCasterIndices: number[];
	shadowCasterIndexBuffer: WebGLBuffer;

	ambientLights: AmbientLight[] = [];
	directionalLights: DirectionalLight[] = [];

	ambientLightBuffer: Float32Array;
	directionalLightColorBuffer: Float32Array;
	directionalLightDirectionBuffer: Float32Array;
	directionalLightTransformBuffer: Float32Array;

	particleManager: ParticleManager = null;

	firstUpdate = true;
	compiled = false;
	preparedForRender = false;

	constructor(renderer: Renderer) {
		super();
		this.renderer = renderer;
	}

	addAmbientLight(light: AmbientLight) {
		this.ambientLights.push(light);
	}

	addDirectionalLight(light: DirectionalLight) {
		this.directionalLights.push(light);
	}

	compile() {
		let { gl } = this.renderer;
		let materialMap = new Map<string, MaterialGroup>();

		let allMeshes: Mesh[] = [];
		this.traverse(obj => obj instanceof Mesh && allMeshes.push(obj));
		this.allMeshes = allMeshes;

		let positions: number[] = [];
		let normals: number[] = [];
		let tangents: number[] = [];
		let uvs: number[] = [];
		let meshInfoIndices: number[] = [];
		let shadowCasterIndices: number[] = [];

		for (let [index, mesh] of allMeshes.entries()) {
			mesh.vboOffset = meshInfoIndices.length;
			mesh.compileMaterialIndices();

			let verts = mesh.geometry.positions.length / 3;

			Util.pushArray(positions, mesh.geometry.positions);
			Util.pushArray(normals, mesh.geometry.normals);
			Util.pushArray(uvs, mesh.geometry.uvs);
			Util.pushArray(meshInfoIndices, Array(verts).fill(index));

			let hasNormalMap = mesh.materials.some(x => x.normalMap);
			if (hasNormalMap) {
				this.computeTangents(mesh.geometry.positions, mesh.geometry.normals, mesh.geometry.uvs, tangents);
			} else {
				Util.pushArray(tangents, Array(4 * verts).fill(0));
			}

			for (let data of mesh.materialIndices) {
				let material = data.material;
				let defineChunk = material.getDefineChunk();

				if (!this.renderer.materialShaders.has(defineChunk)) {
					let program = new Program(this.renderer, materialVert, materialFrag, defineChunk);
					this.renderer.materialShaders.set(defineChunk, program);
				}

				if (mesh.castShadows) Util.pushArray(shadowCasterIndices, data.indices);

				if (material.transparent) {
					mesh.hasTransparentMaterials = true;
					continue; // We do only opaque stuff
				}

				this.updateMaterialGroup(materialMap, data);
			}
		}

		let opaqueMaterialGroups = [...materialMap].map(x => x[1]);
		opaqueMaterialGroups.sort((a, b) => a.defineChunk.localeCompare(b.defineChunk)).sort((a, b) => a.material.renderOrder - b.material.renderOrder);
		this.opaqueMaterialGroups = opaqueMaterialGroups;

		let indices: number[] = [];

		for (let group of opaqueMaterialGroups) {
			group.offset = indices.length;
			for (let data of group.indexGroups) Util.pushArray(indices, data.indices);
		}

		this.positionBuffer = new BufferAttribute(this.renderer, new Float32Array(positions), { 'position': 3 });
		this.normalBuffer = new BufferAttribute(this.renderer, new Float32Array(normals), { 'normal': 3 });
		this.tangentBuffer = new BufferAttribute(this.renderer, new Float32Array(tangents), { 'tangent': 4 } );
		this.uvBuffer = new BufferAttribute(this.renderer, new Float32Array(uvs), { 'uv': 2 });
		this.meshInfoIndexBuffer = new BufferAttribute(this.renderer, new Float32Array(meshInfoIndices), { 'meshInfoIndex': 1 });

		let maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		let textureWidth = this.meshInfoTextureWidth = Util.ceilPowerOf2(Math.min(4 * allMeshes.length, maxTextureSize));
		let textureHeight = this.meshInfoTextureHeight = Util.ceilPowerOf2(Math.ceil(4 * allMeshes.length / Math.max(maxTextureSize, textureWidth)));
		let internalFormat = (gl instanceof WebGLRenderingContext)? gl.RGBA : gl.RGBA32F;
		this.meshInfoBuffer = new Float32Array(4 * textureWidth * textureHeight); // One mat4 per mesh
		this.meshInfoTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.meshInfoTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, textureWidth, textureHeight, 0, gl.RGBA, gl.FLOAT, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		
		let opaqueIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, opaqueIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
		this.opaqueIndexBuffer = opaqueIndexBuffer;

		this.shadowCasterIndices = shadowCasterIndices;
		this.shadowCasterIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.shadowCasterIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shadowCasterIndices), gl.STATIC_DRAW);

		let totalIndexCount = allMeshes.map(x => x.geometry.indices.length).reduce((a, b) => a + b, 0);
		let transparentIndexBuffer = gl.createBuffer();
		let transparentIndexBufferData = new Uint32Array(totalIndexCount);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, transparentIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, transparentIndexBufferData, gl.DYNAMIC_DRAW);
		this.transparentIndexBuffer = transparentIndexBuffer;
		this.transparentIndexBufferData = transparentIndexBufferData;

		let totalAmbientLight = new THREE.Color(0);
		this.ambientLights.forEach(x => totalAmbientLight.add(x.color));
		this.ambientLightBuffer = new Float32Array(totalAmbientLight.toArray());

		let totalDirectionalLight = new THREE.Color(0);
		let directionalLightDirection = new THREE.Vector3();
		for (let light of this.directionalLights) {
			totalDirectionalLight.add(light.color);
			directionalLightDirection.addScaledVector(light.direction, 1 / this.directionalLights.length);
		}

		this.directionalLightColorBuffer = new Float32Array(totalDirectionalLight.toArray());
		this.directionalLightDirectionBuffer = new Float32Array(directionalLightDirection.toArray());
		this.directionalLightTransformBuffer = new Float32Array(16);

		this.compiled = true;
	}

	updateMaterialGroup(materialMap: Map<string, MaterialGroup>, data: MaterialIndexData) {
		let material = data.material;
		let materialHash = material.getHash();
		let materialGroup = materialMap.get(materialHash);

		if (!materialGroup) {
			materialGroup = {
				material,
				indexGroups: [],
				defineChunk: material.getDefineChunk(),
				offset: 0,
				count: 0,
				minDistance: Infinity
			};
			materialMap.set(materialHash, materialGroup);
		}

		materialGroup.indexGroups.push(data);
		materialGroup.count += data.indices.length;
		
		return materialGroup;
	}

	// Lengyel, Eric. “Computing Tangent Space Basis Vectors for an Arbitrary Mesh”. Terathon Software 3D Graphics Library, 2001. http://www.terathon.com/code/tangent.html
	computeTangents(positions: number[], normals: number[], uvs: number[], tangents: number[]) {
		let verts = positions.length / 3;
		let tris = verts / 3;

		let v1 = new THREE.Vector3();
		let v2 = new THREE.Vector3();
		let v3 = new THREE.Vector3();
		let w1 = new THREE.Vector2();
		let w2 = new THREE.Vector2();
		let w3 = new THREE.Vector2();
		let sdir = new THREE.Vector3();
		let tdir = new THREE.Vector3();
		let normal = new THREE.Vector3();
		let tangent = new THREE.Vector3();

		for (let i = 0; i < tris; i++) {
			v1.set(positions[9*i + 0], positions[9*i + 1], positions[9*i + 2]);
			v2.set(positions[9*i + 3], positions[9*i + 4], positions[9*i + 5]);
			v3.set(positions[9*i + 6], positions[9*i + 7], positions[9*i + 8]);

			w1.set(uvs[6*i + 0], uvs[6*i + 1]);
			w2.set(uvs[6*i + 2], uvs[6*i + 3]);
			w3.set(uvs[6*i + 4], uvs[6*i + 5]);

			let x1 = v2.x - v1.x;
			let x2 = v3.x - v1.x;
			let y1 = v2.y - v1.y;
			let y2 = v3.y - v1.y;
			let z1 = v2.z - v1.z;
			let z2 = v3.z - v1.z;

			let s1 = w2.x - w1.x;
			let s2 = w3.x - w1.x;
			let t1 = w2.y - w1.y;
			let t2 = w3.y - w1.y;

			let r = 1 / (s1 * t2 - s2 * t1);
			sdir.set(
				(t2 * x1 - t1 * x2) * r,
				(t2 * y1 - t1 * y2) * r,
				(t2 * z1 - t1 * z2) * r
			);
			tdir.set(
				(s1 * x2 - s2 * x1) * r,
				(s1 * y2 - s2 * y1) * r,
				(s1 * z2 - s2 * z1) * r
			);

			for (let j = 0; j < 3; j++) {
				normal.set(normals[9*i + 3*j + 0], normals[9*i + 3*j + 1], normals[9*i + 3*j + 2]);
				
				// Gram-Schmidt orthogonalize
				tangent.copy(sdir).addScaledVector(normal, -normal.dot(sdir)).normalize();
				// Calculate handedness
				let w = (normal.cross(sdir).dot(tdir) < 0)? -1 : 1;

				tangents.push(tangent.x, tangent.y, tangent.z, w);
			}
		}
	}

	prepareForRender(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
		let { gl } = this.renderer;

		this.update();
		this.directionalLights[0]?.renderShadowMap(this);

		let temp = new THREE.Vector3();
		let cameraPosition = camera.position;
		let transparentMeshes = this.allMeshes.filter(x => x.hasTransparentMaterials || (x.opacity < 1 && x.opacity > 0));

		// Precompute all distances
		for (let mesh of transparentMeshes) {
			mesh.distanceToCamera = temp.setFromMatrixPosition(mesh.worldTransform).distanceToSquared(cameraPosition);
		}

		let sortedMeshes = transparentMeshes.sort((a, b) => b.distanceToCamera - a.distanceToCamera);
		let materialMap = new Map<string, MaterialGroup>();

		for (let mesh of sortedMeshes) {
			for (let data of mesh.materialIndices) {
				let material = data.material;
				if (!material.transparent && (mesh.opacity === 1 || mesh.opacity === 0)) continue;

				let group = this.updateMaterialGroup(materialMap, data);
				group.minDistance = Math.min(group.minDistance, mesh.distanceToCamera);
			}
		}

		let materialGroups = [...materialMap].map(x => x[1]);
		materialGroups.sort((a, b) => b.minDistance - a.minDistance);
		this.transparentMaterialGroups = materialGroups;

		let offset = 0;
		for (let group of materialGroups) {
			group.offset = offset;
			for (let data of group.indexGroups) {
				this.transparentIndexBufferData.set(data.indexBuffer, offset);
				offset += data.indices.length;
			}
		}
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.transparentIndexBuffer);
		gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.transparentIndexBufferData, 0, offset);

		this.preparedForRender = true;
	}

	update() {
		let { gl } = this.renderer;

		this.updateWorldTransform();

		for (let i = 0; i < this.allMeshes.length; i++) {
			let mesh = this.allMeshes[i];

			if (mesh.needsVertexBufferUpdate) {
				let offset = mesh.vboOffset;
				this.positionBuffer.set(mesh.geometry.positions, offset * 3);
				this.normalBuffer.set(mesh.geometry.normals, offset * 3);
				this.uvBuffer.set(mesh.geometry.uvs, offset * 2);
				mesh.needsVertexBufferUpdate = false;
			}

			if (this.firstUpdate || mesh.needsMeshInfoBufferUpdate) {
				mesh.updateMeshInfoBuffer(this.meshInfoBuffer, 16 * i);
			}
		}

		//gl.deleteTexture(this.meshInfoTexture);
		//this.meshInfoTexture = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, this.meshInfoTexture);
		//gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.meshInfoTextureWidth, this.meshInfoTextureHeight, gl.RGBA, gl.FLOAT, this.meshInfoBuffer);
		//let internalFormat = (gl instanceof WebGLRenderingContext)? gl.RGBA : gl.RGBA32F;
		//gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, this.meshInfoTextureWidth, this.meshInfoTextureHeight, 0, gl.RGBA, gl.FLOAT, this.meshInfoBuffer);

		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.meshInfoTextureWidth, this.meshInfoTextureHeight, gl.RGBA, gl.FLOAT, this.meshInfoBuffer);
		
		this.positionBuffer.update();
		this.normalBuffer.update();
		this.uvBuffer.update();

		this.updateDirectionalLightBuffers();

		this.firstUpdate = false;
	}

	updateDirectionalLightBuffers() {
		let firstLight = this.directionalLights[0];
		if (!firstLight) return;

		if (firstLight.camera) {
			let mat4 = new THREE.Matrix4();
			mat4.multiplyMatrices(firstLight.camera.projectionMatrix, firstLight.camera.matrixWorldInverse);
			this.directionalLightTransformBuffer.set(mat4.elements, 0);
		}
	}

	dispose() {
		let { gl } = this.renderer;

		this.positionBuffer.dispose();
		this.normalBuffer.dispose();
		this.tangentBuffer.dispose();
		this.uvBuffer.dispose();
		this.meshInfoIndexBuffer.dispose();

		gl.deleteTexture(this.meshInfoTexture);

		gl.deleteBuffer(this.opaqueIndexBuffer);
		gl.deleteBuffer(this.transparentIndexBuffer);
		gl.deleteBuffer(this.shadowCasterIndexBuffer);

		this.particleManager.dispose();

		for (let light of this.directionalLights) light.dispose();
	}
}