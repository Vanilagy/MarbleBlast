import materialVert from './shaders/material_vert.glsl';
import materialFrag from './shaders/material_frag.glsl';
import THREE from "three";
import { AmbientLight } from "./ambient_light";
import { BufferAttribute } from "./buffer_attribute";
import { CubeTexture } from "./cube_texture";
import { DirectionalLight } from "./directional_light";
import { Group } from "./group";
import { Material } from "./material";
import { Mesh } from "./mesh";
import { Renderer } from "./renderer";
import { Texture } from "./texture";
import { Program } from './program';

interface MaterialGroup {
	material: Material,
	meshes: Mesh[],
	positions: number[],
	normals: number[],
	uvs: number[],
	meshInfoIndices: number[],
	drawCalls: {
		start: number,
		count: number,
		meshInfoGroup: MeshInfoGroup
	}[],
	offset: number,
	defineChunk: string
}

interface MeshInfoGroup {
	meshes: Mesh[],
	buffer: Float32Array
}

export interface DrawCall {
	start: number,
	count: number,
	meshes: Mesh[],
	meshInfoBuffer: Float32Array,
	materialsBuffer: Uint32Array,
	textureId: number,
	materials: Material[],
	textures: Texture[],
	cubeTextures: CubeTexture[],
	meshVertexStarts: number[]
}

export class Scene extends Group {
	renderer: Renderer;
	positionBuffer: BufferAttribute;
	normalBuffer: BufferAttribute;
	tangentBuffer: BufferAttribute;
	uvBuffer: BufferAttribute;
	meshInfoIndexBuffer: BufferAttribute;

	materialGroups: MaterialGroup[];
	meshInfoGroups: MeshInfoGroup[];
	//materialIndexBuffer: BufferAttribute;
	//drawCalls: DrawCall[];
	//textures: WebGLTexture[] = [];
	//indexToDrawCall: number[] = [];
	indexBuffer: WebGLBuffer;
	indexBufferData: Uint32Array;
	shadowCasterIndices: number[];
	shadowCasterIndexBuffer: WebGLBuffer;

	ambientLights: AmbientLight[] = [];
	directionalLights: DirectionalLight[] = [];

	ambientLightBuffer: Float32Array;
	directionalLightColorBuffer: Float32Array;
	directionalLightDirectionBuffer: Float32Array;
	directionalLightTransformBuffer: Float32Array;
	directionalLightShadowMapBuffer: Uint32Array;
	firstUpdate = true;

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

	makeTexture(textures: Texture[]) {
		let maxDim = 0;
		for (let texture of textures) {
			maxDim = Math.max(maxDim, texture.image.naturalWidth, texture.image.naturalHeight);
		}
		//maxDim = 4;

		console.log(textures);

		let data = new Uint8ClampedArray(4 * maxDim**2 * textures.length);
		let canvas = document.createElement('canvas');
		canvas.setAttribute('width', maxDim.toString());
		canvas.setAttribute('height', maxDim.toString());
		let ctx = canvas.getContext('2d');
		
		for (let texture of textures) {
			ctx.clearRect(0, 0, maxDim, maxDim);
			ctx.drawImage(texture.image, 0, 0, maxDim, maxDim);

			let imageData = ctx.getImageData(0, 0, maxDim, maxDim);
			data.set(imageData.data, 4 * maxDim**2 * textures.indexOf(texture));
		}

		let gl = this.renderer.gl;
		let tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
		gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, maxDim, maxDim, textures.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
		gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, this.renderer.extensions.EXT_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 16);

		return tex;
	}

	async compile() {
		let materialMap = new Map<Material, MaterialGroup>();
		let uniformCounts = this.renderer.getUniformsCounts();

		let allMeshes: Mesh[] = [];
		this.traverse(obj => obj instanceof Mesh && allMeshes.push(obj));

		for (let mesh of allMeshes) {
			for (let material of mesh.materials) {
				if (!materialMap.has(material)) materialMap.set(material, {
					material,
					meshes: [],
					positions: [],
					normals: [],
					uvs:[],
					meshInfoIndices: [],
					drawCalls: [],
					offset: 0,
					defineChunk: material.buildDefineChunk()
				});

				let group = materialMap.get(material);
				group.meshes.push(mesh);
			}
		}

		let materialGroups = [...materialMap].map(x => x[1]);
		materialGroups.sort((a, b) => a.defineChunk.localeCompare(b.defineChunk));
		this.materialGroups = materialGroups;

		for (let group of materialGroups) {
			if (this.renderer.materialShaders.has(group.defineChunk)) continue;

			let program = new Program(this.renderer, materialVert, materialFrag, group.defineChunk);
			this.renderer.materialShaders.set(group.defineChunk, program);
		}

		let orderedMeshes = [...new Set(materialGroups.map(group => group.meshes).flat())];
		let meshInfoGroups: MeshInfoGroup[] = [];
		let currentMeshInfoGroup: MeshInfoGroup;
		let meshToMeshInfoGroup = new Map<Mesh, MeshInfoGroup>();

		const finalizeMeshInfoGroup = () => {
			if (currentMeshInfoGroup?.meshes.length) {
				currentMeshInfoGroup.buffer = new Float32Array(16 * currentMeshInfoGroup.meshes.length);
				meshInfoGroups.push(currentMeshInfoGroup);
			}

			currentMeshInfoGroup = {
				meshes: [],
				buffer: null
			};
		};
		finalizeMeshInfoGroup();

		for (let mesh of orderedMeshes) {
			currentMeshInfoGroup.meshes.push(mesh);
			meshToMeshInfoGroup.set(mesh, currentMeshInfoGroup);

			if (currentMeshInfoGroup.meshes.length >= uniformCounts.meshInfoVectors/4)
				finalizeMeshInfoGroup();
		}
		finalizeMeshInfoGroup();
		this.meshInfoGroups = meshInfoGroups;

		for (let mesh of orderedMeshes) {
			let verts = mesh.geometry.positions.length/3;
			let meshInfoGroup = meshToMeshInfoGroup.get(mesh);
			let meshInfoIndex = meshInfoGroup.meshes.indexOf(mesh);

			for (let i = 0; i < verts; i++) {
				let { positions, normals, uvs } = mesh.geometry;
				let material = mesh.materials[mesh.geometry.materials[i]];
				let materialGroup = materialMap.get(material);

				if (materialGroup.drawCalls.length === 0) {
					materialGroup.drawCalls.push({ meshInfoGroup, start: 0, count: 0 });
				} else {
					let last = materialGroup.drawCalls[materialGroup.drawCalls.length - 1];
					if (last.meshInfoGroup !== meshInfoGroup) {
						materialGroup.drawCalls.push({ meshInfoGroup, start: last.start + last.count, count: 0 });
					}
				}
				let drawCall = materialGroup.drawCalls[materialGroup.drawCalls.length - 1];

				materialGroup.positions.push(positions[3*i + 0], positions[3*i + 1], positions[3*i + 2]);
				materialGroup.normals.push(normals[3*i + 0], normals[3*i + 1], normals[3*i + 2]);
				materialGroup.uvs.push(uvs[2*i + 0], uvs[2*i + 1]);
				materialGroup.meshInfoIndices.push(meshInfoIndex);
				drawCall.count++;
			}
		}

		let offset = 0;
		for (let group of materialGroups) {
			group.offset = offset;
			offset += group.positions.length / 3;
		}

		let positions = materialGroups.map(x => x.positions).flat();
		let normals = materialGroups.map(x => x.normals).flat();
		let uvs = materialGroups.map(x => x.uvs).flat();
		let meshInfoIndices = materialGroups.map(x => x.meshInfoIndices).flat();

		this.positionBuffer = new BufferAttribute(this.renderer, 'position', new Float32Array(positions), 3);
		this.normalBuffer = new BufferAttribute(this.renderer, 'normal', new Float32Array(normals), 3);
		this.uvBuffer = new BufferAttribute(this.renderer, 'uv', new Float32Array(uvs), 2);
		this.meshInfoIndexBuffer = new BufferAttribute(this.renderer, 'meshInfoIndex', new Float32Array(meshInfoIndices), 1);

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

		console.log(materialGroups, meshInfoGroups)


		/*

		let positions: number[] = [];
		let normals: number[] = [];
		let uvs: number[] = [];
		let meshInfoIndices: number[] = [];
		let materialIndices: number[] = [];
		let shadowCasterIndices: number[] = [];

		let { gl } = this.renderer;

		let allMeshes: Mesh[] = [];
		this.traverse(obj => obj instanceof Mesh && allMeshes.push(obj));

		let maxArrayTextureLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number;
		let uniformCounts = this.renderer.getUniformsCounts();

		let drawCalls: DrawCall[] = [];
		let currentStart = 0;
		let currentCount = 0;
		let currentTextureIndex = 0;
		let currentTextures: Texture[] = [];
		let currentMeshes: Mesh[] = [];
		let currentMeshVertexStarts: number[] = [];
		let currentMaterials: Material[] = [];
		let currentCubeTextures: CubeTexture[] = [];

		const commitDrawCall = () => {
			if (currentCount > 0) {
				let drawCall: DrawCall = {
					start: currentStart,
					count: currentCount,
					meshes: currentMeshes,
					meshInfoBuffer: new Float32Array(currentMeshes.length * 16),
					materialsBuffer: new Uint32Array(currentMaterials.length * 4),
					textureId: currentTextureIndex,
					materials: currentMaterials,
					textures: currentTextures.slice(),
					cubeTextures: currentCubeTextures,
					meshVertexStarts: currentMeshVertexStarts
				};
				drawCalls.push(drawCall);
			}

			currentStart += currentCount;
			currentCount = 0;
			currentMeshes = [];
			currentMaterials = [];
			currentCubeTextures = [];
			currentTextureIndex = this.textures.length;
		};

		const commitTexture = async () => {
			let tex = this.makeTexture(currentTextures);
			this.textures.push(tex);
			currentTextures = [];
			commitDrawCall();
		};

		this.drawCalls = drawCalls;

		const pushArray = <T>(target: T[], toPush: T[]) => {
			for (let elem of toPush) target.push(elem);
		};

		console.log(allMeshes)

		for (let i = 0; i < allMeshes.length; i++) {
			let mesh = allMeshes[i];
			let newMaterials: Material[] = [];
			let newTextures: Texture[] = [];
			let newCubeTextures: CubeTexture[] = [];

			mesh.geometry.validate();

			for (let mat of mesh.materials) {
				if (!currentMaterials.includes(mat)) newMaterials.push(mat);
				for (let tex of mat.availableTextures) if (!currentTextures.includes(tex)) newTextures.push(tex);
				if (mat.envMap && !currentCubeTextures.includes(mat.envMap)) newCubeTextures.push(mat.envMap);
			}
			
			if (currentTextures.length + newTextures.length > maxArrayTextureLayers) commitTexture();
			if (currentCubeTextures.length + newCubeTextures.length > CUBE_MAPS_PER_DRAW_CALL) commitDrawCall();
			if ((currentMeshes.length + 1) * 4 > uniformCounts.transformVectors) commitDrawCall();
			if ((currentMeshes.length + 1) * 1 > uniformCounts.materialVectors) commitDrawCall();

			currentMaterials.push(...newMaterials);
			currentTextures.push(...newTextures);
			currentCubeTextures.push(...newCubeTextures);

			let verts = mesh.geometry.positions.length / 3;
			currentCount += verts;
			currentMeshes.push(mesh);
			currentMeshVertexStarts.push(positions.length/3);

			if (mesh.castShadows) pushArray(shadowCasterIndices, new Array(verts).fill(null).map((_, i) => positions.length/3 + i));

			pushArray(positions, mesh.geometry.positions);
			pushArray(normals, mesh.geometry.normals);
			pushArray(uvs, mesh.geometry.uvs);
			pushArray(meshInfoIndices, new Array(verts).fill(currentMeshes.indexOf(mesh)));
			pushArray(materialIndices, mesh.geometry.materials.map(x => currentMaterials.indexOf(mesh.materials[x])));
			pushArray(this.indexToDrawCall, new Array(verts).fill(drawCalls.length));
		}
		commitDrawCall();
		commitTexture();

		console.log(drawCalls);

		let tangents = this.computeTangents(positions, normals, uvs);

		this.positionBuffer = new BufferAttribute(this.renderer, 'position', new Float32Array(positions), 3);
		this.normalBuffer = new BufferAttribute(this.renderer, 'normal', new Float32Array(normals), 3);
		this.tangentBuffer = new BufferAttribute(this.renderer, 'tangent', new Float32Array(tangents), 4);
		this.uvBuffer = new BufferAttribute(this.renderer, 'uv', new Float32Array(uvs), 2);
		this.meshInfoIndexBuffer = new BufferAttribute(this.renderer, 'meshInfoIndex', new Float32Array(meshInfoIndices), 1);
		this.materialIndexBuffer = new BufferAttribute(this.renderer, 'materialIndex', new Float32Array(materialIndices), 1);

		let totalAmbientLight = new THREE.Color(0);
		this.ambientLights.forEach(x => totalAmbientLight.add(x.color));
		this.ambientLightBuffer = new Float32Array(totalAmbientLight.toArray());

		const shadowMapStartIndex = 1 + CUBE_MAPS_PER_DRAW_CALL;
		this.directionalLightColorBuffer = new Float32Array(3 * DIRECTIONAL_LIGHT_COUNT);
		this.directionalLightDirectionBuffer = new Float32Array(3 * DIRECTIONAL_LIGHT_COUNT);
		this.directionalLightTransformBuffer = new Float32Array(16 * DIRECTIONAL_LIGHT_COUNT);
		this.directionalLightShadowMapBuffer = new Uint32Array(new Array(DIRECTIONAL_LIGHT_COUNT).fill(shadowMapStartIndex));

		this.indexBufferData = new Uint32Array(meshInfoIndices.length);
		this.indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexBufferData, gl.DYNAMIC_DRAW);

		this.shadowCasterIndices = shadowCasterIndices;
		this.shadowCasterIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.shadowCasterIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shadowCasterIndices), gl.STATIC_DRAW);
		*/
	}

	// https://www.cs.upc.edu/~virtual/G/1.%20Teoria/06.%20Textures/Tangent%20Space%20Calculation.pdf
	computeTangents(positions: number[], normals: number[], uvs: number[]) {
		let tangents: number[] = [];

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

		return tangents;
	}

	update() {
		this.updateWorldTransform();

		for (let group of this.meshInfoGroups) {
			for (let i = 0; i < group.meshes.length; i++) {
				let mesh = group.meshes[i];

				if (mesh.needsVertexBufferUpdate) {
					let offset = drawCall.meshVertexStarts[i];
					this.positionBuffer.set(mesh.geometry.positions, offset);
					this.normalBuffer.set(mesh.geometry.normals, offset);
					this.uvBuffer.set(mesh.geometry.uvs, offset);
					mesh.needsVertexBufferUpdate = false;
				}

				if (this.firstUpdate || mesh.needsMeshInfoBufferUpdate) {
					mesh.updateMeshInfoBuffer(group.buffer, 16 * i);
				}
			}
		}

		/*
		for (let drawCall of this.drawCalls) {
			for (let i = 0; i < drawCall.meshes.length; i++) {
				let mesh = drawCall.meshes[i];

				if (this.firstUpdate || mesh.needsVertexBufferUpdate) {
					let offset = drawCall.meshVertexStarts[i];
					this.positionBuffer.set(mesh.geometry.positions, offset);
					this.normalBuffer.set(mesh.geometry.normals, offset);
					this.uvBuffer.set(mesh.geometry.uvs, offset);
				}

				if (this.firstUpdate || mesh.needsMeshInfoBufferUpdate) {
					mesh.updateMeshInfoBuffer(drawCall.meshInfoBuffer, 16 * i);
				}
			}
			for (let i = 0; i < drawCall.materials.length; i++) {
				let material = drawCall.materials[i];
				if (!this.firstUpdate && !material.needsMaterialBufferUpdate) continue;

				drawCall.materialsBuffer.set(material.encode(drawCall.textures, drawCall.cubeTextures), 4 * i);
				material.needsMaterialBufferUpdate = false;
			}
		}
		*/
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
}