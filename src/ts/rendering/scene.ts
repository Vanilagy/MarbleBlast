import materialVert from './shaders/material_vert.glsl';
import materialFrag from './shaders/material_frag.glsl';
import { AmbientLight } from "./ambient_light";
import { VertexBuffer, VertexBufferGroup } from "./vertex_buffer";
import { DirectionalLight } from "./directional_light";
import { Group } from "./group";
import { Material } from "./material";
import { MaterialIndexData, Mesh } from "./mesh";
import { Renderer } from "./renderer";
import { Program } from './program';
import { Util } from '../util';
import { ParticleManager } from '../particles';
import { Vector3 } from '../math/vector3';
import { Vector2 } from '../math/vector2';
import { Matrix4 } from '../math/matrix4';
import { Camera } from './camera';
import { Object3D } from './object_3d';

/** Groups together different geometry from different meshes which all share the same material, so that they can all be drawn together. */
export interface MaterialGroup {
	material: Material,
	indexGroups: MaterialIndexData[],
	defineChunk: string,
	vertexBufferGroup: VertexBufferGroup,
	indexBuffer: WebGLBuffer,
	meshInfoTexture: MeshInfoTexture,
	/** Offset into the index buffer. */
	offset: number,
	/** How many vertices to draw. */
	count: number,
	/** Minimum distance of any mesh in this group to the camera; will be updated on the fly. */
	minDistance?: number
}

/** Mesh info is stored in a data texture for random access in shaders. This interface encapsulates all data about a mesh info data texture. */
export interface MeshInfoTexture {
	buffer: Float32Array,
	texture: WebGLTexture,
	width: number,
	height: number
}

/** A scene is responsible for holding the description of a renderable world and preparing it for efficient rendering. If you wanna know what all this static/dynamic mesh thing is about, check Mesh. */
export class Scene extends Group {
	renderer: Renderer;

	staticPositionBuffer: VertexBuffer;
	staticNormalBuffer: VertexBuffer;
	staticTangentBuffer: VertexBuffer;
	staticUvBuffer: VertexBuffer;
	/** For each vertex, stores the index of the mesh this vertex belongs to, so that it can be properly transformed in the shader. */
	staticMeshInfoIndexBuffer: VertexBuffer;
	staticBufferGroup: VertexBufferGroup;

	maxDynamicVertices: number;
	maxDynamicMeshes: number;

	// Same thingies as for static
	dynamicPositionBuffer: VertexBuffer;
	dynamicNormalBuffer: VertexBuffer;
	dynamicTangentBuffer: VertexBuffer;
	dynamicUvBuffer: VertexBuffer;
	dynamicMeshInfoIndexBuffer: VertexBuffer;
	dynamicBufferGroup: VertexBufferGroup;

	staticMeshInfoTexture: MeshInfoTexture;
	dynamicMeshInfoTexture: MeshInfoTexture;

	staticMeshes: Mesh[] = [];
	dynamicMeshes: Mesh[] = [];
	staticOpaqueMaterialGroups: MaterialGroup[];
	dynamicOpaqueMaterialGroups: MaterialGroup[];
	transparentMaterialGroups: MaterialGroup[]; // Used for both static and dynamic
	staticOpaqueIndexBuffer: WebGLBuffer;
	dynamicOpaqueIndexBuffer: WebGLBuffer;
	transparentIndexBuffer: WebGLBuffer;
	transparentIndexBufferData: Uint32Array;
	staticShadowCasterIndices: number[];
	staticShadowCasterIndexBuffer: WebGLBuffer;
	dynamicShadowCasterIndices: number[];
	dynamicShadowCasterIndexBuffer: WebGLBuffer;
	allDefineChunks = new Set<string>();

	ambientLights: AmbientLight[] = [];
	directionalLights: DirectionalLight[] = [];

	ambientLightBuffer: Float32Array;
	directionalLightColorBuffer: Float32Array;
	directionalLightDirectionBuffer: Float32Array;
	directionalLightTransformBuffer: Float32Array;

	particleManager: ParticleManager = null;

	firstUpdate = true;
	compiled = false;
	needsDynamicMeshRecompilation = true;
	preparedForRender = false;

	constructor(renderer: Renderer, maxDynamicVertices = 2**18, maxDynamicMeshes = 256) {
		super();

		this.renderer = renderer;

		this.maxDynamicVertices = maxDynamicVertices;
		this.maxDynamicMeshes = maxDynamicMeshes;

		// Already create all dynamic vertex buffers but without any data
		this.dynamicPositionBuffer = new VertexBuffer(this.renderer, new Float32Array(3 * maxDynamicVertices), { 'position': 3 });
		this.dynamicNormalBuffer = new VertexBuffer(this.renderer, new Float32Array(3 * maxDynamicVertices), { 'normal': 3 });
		this.dynamicTangentBuffer = new VertexBuffer(this.renderer, new Float32Array(4 * maxDynamicVertices), { 'tangent': 4 } );
		this.dynamicUvBuffer = new VertexBuffer(this.renderer, new Float32Array(2 * maxDynamicVertices), { 'uv': 2 });
		this.dynamicMeshInfoIndexBuffer = new VertexBuffer(this.renderer, new Float32Array(1 * maxDynamicVertices), { 'meshInfoIndex': 1 });

		this.dynamicBufferGroup = new VertexBufferGroup([
			this.dynamicPositionBuffer,
			this.dynamicNormalBuffer,
			this.dynamicTangentBuffer,
			this.dynamicUvBuffer,
			this.dynamicMeshInfoIndexBuffer
		]);
	}

	// Listen out for any changes in the scene graph to see if dynamic objects have changed
	onDescendantChange = (object: Object3D) => {
		object.traverse(x => {
			// Check if removing is a valid operation right now
			if (!(x instanceof Mesh)) return;
			if (!x.dynamic && this.compiled) throw new Error("Cannot add/remove static mesh from scene after scene compilation!");
			if (x.dynamic) this.needsDynamicMeshRecompilation = true;
		});
	};

	addAmbientLight(light: AmbientLight) {
		this.ambientLights.push(light);
	}

	addDirectionalLight(light: DirectionalLight) {
		this.directionalLights.push(light);
	}

	/**
	 * Compiles the scene and all its static meshes into neatly-packed buffers and draw calls for efficient rendering. After a scene has been
	 * compiled, no static meshes can be added to or removed from it. In a general 3D engine this would be a very hard limitation, however it
	 * it perfect for Marble Blast, as the number of objects is constant at all times. We can exploit this fact to do some heavy-lifting
	 * ahead-of-time to save on draw calls and massively reduce rendering CPU overhead, a common problem for WebGL applications.
	 *
	 * During the compilation, all meshes will be scanned for the materials they use, and data is arranged in such a way that a single draw
	 * call is enough to draw all geometry of a single material, eliminating the need for per-mesh draw calls. There is, however, some data
	 * about meshes that cannot be precomputed as it is dynamic; mainly their transform and opacity. We therefore store this data in a
	 * floating-point texture that the vertex shader will dynamically read from. Whenever meshes change, we only need to update this texture
	 * once and we're set.
	 *
	 * As is usual with 3D renderers, transparent objects need to get different treatment as they have to be rendered using the painter's
	 * algorithm (back-to-front) for correct layering. Scene compilation also checks materials for transparency and separates opaque and
	 * transparent objects. Transparent objects, however, cannot be neatly precompiled and preplanned as opaque objects do.
	 */
	compile() {
		let { gl } = this.renderer;

		let allStaticMeshes: Mesh[] = [];
		this.traverse(obj => obj instanceof Mesh && !obj.dynamic && allStaticMeshes.push(obj));
		this.staticMeshes = allStaticMeshes;

		let {
			positions,
			normals,
			tangents,
			uvs,
			meshInfoIndices,
			shadowCasterIndices,
			indices,
			opaqueMaterialGroups
		} = this.compileMeshes(allStaticMeshes);

		this.staticOpaqueMaterialGroups = opaqueMaterialGroups;

		// Create all vertex buffers for static meshes
		this.staticPositionBuffer = new VertexBuffer(this.renderer, new Float32Array(positions), { 'position': 3 });
		this.staticNormalBuffer = new VertexBuffer(this.renderer, new Float32Array(normals), { 'normal': 3 });
		this.staticTangentBuffer = new VertexBuffer(this.renderer, new Float32Array(tangents), { 'tangent': 4 } );
		this.staticUvBuffer = new VertexBuffer(this.renderer, new Float32Array(uvs), { 'uv': 2 });
		this.staticMeshInfoIndexBuffer = new VertexBuffer(this.renderer, new Float32Array(meshInfoIndices), { 'meshInfoIndex': 1 });

		// Group the vertex buffers so they can be put into a single VAO
		this.staticBufferGroup = new VertexBufferGroup([
			this.staticPositionBuffer,
			this.staticNormalBuffer,
			this.staticTangentBuffer,
			this.staticUvBuffer,
			this.staticMeshInfoIndexBuffer
		]);

		// Now, create our data textures to hold mesh information
		this.staticMeshInfoTexture = this.createMeshInfoTexture(allStaticMeshes.length);
		this.dynamicMeshInfoTexture = this.createMeshInfoTexture(this.maxDynamicMeshes);

		// Now, allocate the index buffers
		let opaqueIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, opaqueIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
		this.staticOpaqueIndexBuffer = opaqueIndexBuffer;

		this.staticShadowCasterIndices = shadowCasterIndices;
		this.staticShadowCasterIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.staticShadowCasterIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shadowCasterIndices), gl.STATIC_DRAW);

		// Buffers for dynamic meshes, data will be written at another point
		this.dynamicOpaqueIndexBuffer = gl.createBuffer();
		this.dynamicShadowCasterIndexBuffer = gl.createBuffer();

		// Set some values in the material groups
		for (let group of this.staticOpaqueMaterialGroups) {
			group.vertexBufferGroup = this.staticBufferGroup;
			group.indexBuffer = opaqueIndexBuffer;
			group.meshInfoTexture = this.staticMeshInfoTexture;
		}

		// Allocate the index buffer for transparent objects. Since technically, every mesh could become transparent at some point, we need to make this buffer big enough to fit all meshes.
		let totalIndexCount = allStaticMeshes.map(x => x.geometry.indices.length).reduce((a, b) => a + b, 0);
		totalIndexCount += this.maxDynamicVertices;
		let transparentIndexBuffer = gl.createBuffer();
		let transparentIndexBufferData = new Uint32Array(totalIndexCount);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, transparentIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, transparentIndexBufferData, gl.DYNAMIC_DRAW);
		this.transparentIndexBuffer = transparentIndexBuffer;
		this.transparentIndexBufferData = transparentIndexBufferData;

		// Now, let's prepare the lights.

		// Ambient light is simple: Simply condense all ambient lights into one by adding up their colors.
		let totalAmbientLight = new Vector3();
		this.ambientLights.forEach(x => totalAmbientLight.add(x.color));
		this.ambientLightBuffer = new Float32Array(totalAmbientLight.toArray());

		// For directional lights, there's no correct solution for more than one light, so we just average the direction vectors and sum the colors.
		let totalDirectionalLight = new Vector3();
		let directionalLightDirection = new Vector3();
		for (let light of this.directionalLights) {
			totalDirectionalLight.add(light.color);
			directionalLightDirection.addScaledVector(light.direction, 1 / this.directionalLights.length);
		}

		this.directionalLightColorBuffer = new Float32Array(totalDirectionalLight.toArray());
		this.directionalLightDirectionBuffer = new Float32Array(directionalLightDirection.toArray());
		this.directionalLightTransformBuffer = new Float32Array(16);

		this.compiled = true;
	}

	createMeshInfoTexture(meshCount: number): MeshInfoTexture {
		let { gl } = this.renderer;

		let maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		let textureWidth = Util.ceilPowerOf2(Math.min(4 * meshCount, maxTextureSize)); // (WebGL1) textures need to have power-of-two dimension
		let textureHeight = Util.ceilPowerOf2(Math.ceil(4 * meshCount / Math.max(maxTextureSize, textureWidth)));
		let internalFormat = (gl instanceof WebGLRenderingContext)? gl.RGBA : gl.RGBA32F;

		let buffer = new Float32Array(4 * textureWidth * textureHeight); // One mat4 per mesh
		let texture = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, textureWidth, textureHeight, 0, gl.RGBA, gl.FLOAT, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // LINEAR would make no sense here
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

		return { buffer, texture, width: textureWidth, height: textureHeight };
	}

	compileMeshes(meshes: Mesh[]) {
		let materialMap = new Map<string, MaterialGroup>();

		// Create the arrays that will form VBO data
		let positions: number[] = [];
		let normals: number[] = [];
		let tangents: number[] = [];
		let uvs: number[] = [];
		let meshInfoIndices: number[] = [];
		let shadowCasterIndices: number[] = [];

		for (let [index, mesh] of meshes.entries()) {
			let vertsAddedSoFar = meshInfoIndices.length;

			mesh.geometry.validate();
			mesh.vboOffset = vertsAddedSoFar;
			mesh.compileMaterialIndices();

			let verts = mesh.geometry.positions.length / 3;

			Util.pushArray(positions, mesh.geometry.positions);
			Util.pushArray(normals, mesh.geometry.normals);
			Util.pushArray(uvs, mesh.geometry.uvs);
			Util.pushArray(meshInfoIndices, Array(verts).fill(index));

			let hasNormalMap = mesh.materials.some(x => x.normalMap);
			if (hasNormalMap) {
				// Normal map calculations require us to do operations in so-called "tangent space", for which we need an extra tangent vector in addition to the normal
				Scene.computeTangents(mesh.geometry.positions, mesh.geometry.normals, mesh.geometry.uvs, tangents);
			} else {
				// No normal maps are used, no reason to compute any tangents
				Util.pushArray(tangents, Array(4 * verts).fill(0));
			}

			for (let data of mesh.materialIndices) {
				let material = data.material;
				let defineChunk = material.getDefineChunk();
				this.allDefineChunks.add(defineChunk);

				if (!this.renderer.materialShaders.has(defineChunk)) {
					// New material, create a shader for it
					let program = new Program(this.renderer, materialVert, materialFrag, defineChunk);
					this.renderer.materialShaders.set(defineChunk, program);
				}

				if (mesh.castShadows) Util.pushArray(shadowCasterIndices, data.indices);

				if (material.transparent || material.opacity < 1) {
					mesh.hasTransparentMaterials = true;
					continue; // We do only opaque stuff here
				}

				Scene.updateMaterialGroup(materialMap, data);
			}
		}

		let opaqueMaterialGroups = [...materialMap].map(x => x[1]);
		// Group material groups by define chunk to minimize the amount of calls to gl.useProgram. Then, make sure materials with the lowest render order go first.
		opaqueMaterialGroups.sort((a, b) => a.defineChunk.localeCompare(b.defineChunk)).sort((a, b) => a.material.renderOrder - b.material.renderOrder);

		// Will form the data for our index buffer
		let indices: number[] = [];

		for (let group of opaqueMaterialGroups) {
			group.offset = indices.length;
			for (let data of group.indexGroups) Util.pushArray(indices, data.indices);
		}

		return {
			positions,
			normals,
			tangents,
			uvs,
			meshInfoIndices,
			shadowCasterIndices,
			indices,
			opaqueMaterialGroups
		};
	}

	recompileDynamicMeshes() {
		let { gl } = this.renderer;

		let allDynamicMeshes: Mesh[] = [];
		this.traverse(x => x instanceof Mesh && x.dynamic && allDynamicMeshes.push(x));
		this.dynamicMeshes = allDynamicMeshes;

		if (allDynamicMeshes.length > this.maxDynamicMeshes)
			throw new Error(`Can't have more than ${this.maxDynamicMeshes} dynamic meshes!`);

		let {
			positions,
			normals,
			tangents,
			uvs,
			meshInfoIndices,
			shadowCasterIndices,
			indices,
			opaqueMaterialGroups
		} = this.compileMeshes(allDynamicMeshes);

		for (let group of opaqueMaterialGroups) {
			group.vertexBufferGroup = this.dynamicBufferGroup;
			group.indexBuffer = this.dynamicOpaqueIndexBuffer;
			group.meshInfoTexture = this.dynamicMeshInfoTexture;
		}

		this.dynamicOpaqueMaterialGroups = opaqueMaterialGroups;

		this.dynamicPositionBuffer.set(positions);
		this.dynamicNormalBuffer.set(normals);
		this.dynamicTangentBuffer.set(tangents);
		this.dynamicUvBuffer.set(uvs);
		this.dynamicMeshInfoIndexBuffer.set(meshInfoIndices);

		this.dynamicPositionBuffer.update();
		this.dynamicNormalBuffer.update();
		this.dynamicTangentBuffer.update();
		this.dynamicUvBuffer.update();
		this.dynamicMeshInfoIndexBuffer.update();

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.dynamicOpaqueIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.DYNAMIC_DRAW);

		this.dynamicShadowCasterIndices = shadowCasterIndices;
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.dynamicShadowCasterIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shadowCasterIndices), gl.DYNAMIC_DRAW);

		this.needsDynamicMeshRecompilation = false;
	}

	/** Updates (or creates) a material group and adds index data to it. */
	static updateMaterialGroup(materialMap: Map<string, MaterialGroup>, data: MaterialIndexData) {
		let material = data.material;
		let materialHash = material.getHash();
		let materialGroup = materialMap.get(materialHash);

		if (!materialGroup) {
			materialGroup = {
				material,
				indexGroups: [],
				defineChunk: material.getDefineChunk(),

				// These two *have* to be set later on
				vertexBufferGroup: null,
				indexBuffer: null,
				meshInfoTexture: null,

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

	// Lengyel, Eric. “Computing Tangent Space Basis Vectors for an Arbitrary Mesh”. Terathon Software 3D Graphics Library, 2001. http://www.terathon.com/code/tangent.html https://www.cs.upc.edu/~virtual/G/1.%20Teoria/06.%20Textures/Tangent%20Space%20Calculation.pdf
	static computeTangents(positions: number[], normals: number[], uvs: number[], tangents: number[]) {
		let verts = positions.length / 3;
		let tris = verts / 3;

		let v1 = new Vector3();
		let v2 = new Vector3();
		let v3 = new Vector3();
		let w1 = new Vector2();
		let w2 = new Vector2();
		let w3 = new Vector2();
		let sdir = new Vector3();
		let tdir = new Vector3();
		let normal = new Vector3();
		let tangent = new Vector3();

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

	/**
	 * Prepares a scene for rendering by updating shadow maps and preparing transparent objects. Has to be called before each render.
	 * This is kept separate from `render` because a scene can be rendered multiple times per frame (for cubemaps, for example). It
	 * would be a waste to prepare the scene for each of those renders as the state hasn't changed.
	 */
	prepareForRender(camera: Camera) {
		let { gl } = this.renderer;

		if (this.needsDynamicMeshRecompilation) this.recompileDynamicMeshes();

		this.update();
		this.directionalLights[0]?.renderShadowMap(this);

		let temp = new Vector3();
		let cameraPosition = camera.position;

		let allMeshes = [...this.staticMeshes, ...this.dynamicMeshes];
		let transparentMeshes = allMeshes.filter(x => x.hasTransparentMaterials || (x.opacity < 1 && x.opacity > 0)); // Find out which meshes are transparent so we don't sort opaque stuff too

		// Compute the distances to the camera
		for (let mesh of transparentMeshes) {
			mesh.distanceToCamera = temp.setFromMatrixPosition(mesh.worldTransform).distanceToSquared(cameraPosition);
		}

		// Sort transparent meshes using the painter's algorithm, furthest first
		let sortedMeshes = transparentMeshes.sort((a, b) => b.distanceToCamera - a.distanceToCamera);
		let staticMaterialMap = new Map<string, MaterialGroup>();
		let dynamicMaterialMap = new Map<string, MaterialGroup>();

		// Create the material groups for the transparent objects
		for (let mesh of sortedMeshes) {
			for (let data of mesh.materialIndices) {
				let material = data.material;
				let effectiveOpacity = mesh.opacity * material.opacity;

				if ((!material.transparent && effectiveOpacity === 1) || effectiveOpacity === 0) continue;

				let group = Scene.updateMaterialGroup(mesh.dynamic? dynamicMaterialMap : staticMaterialMap, data);
				group.minDistance = Math.min(group.minDistance, mesh.distanceToCamera);
			}
		}

		// Set some buffer pointers
		for (let [, group] of staticMaterialMap) {
			group.vertexBufferGroup = this.staticBufferGroup;
			group.indexBuffer = this.transparentIndexBuffer;
			group.meshInfoTexture = this.staticMeshInfoTexture;
		}
		for (let [, group] of dynamicMaterialMap) {
			group.vertexBufferGroup = this.dynamicBufferGroup;
			group.indexBuffer = this.transparentIndexBuffer;
			group.meshInfoTexture = this.dynamicMeshInfoTexture;
		}

		// We also need to sort the individual material groups by distance to get more accurate results. This is because
		// what we're doing is actually inaccurate, since we're drawing all geometry of a single material at once, which
		// works fine for opaque objects where order doesn't matter, but falls apart for transparent objects where correct
		// depth sorting is paramount. To reduce errors as much as possible, make sure we draw the materials with the furthest
		// minimum distance to the camera first.
		let materialGroups = [...staticMaterialMap, ...dynamicMaterialMap].map(x => x[1]);
		materialGroups.sort((a, b) => b.minDistance - a.minDistance);
		this.transparentMaterialGroups = materialGroups;

		// Populate the index buffer
		let offset = 0;
		for (let group of materialGroups) {
			group.offset = offset;
			for (let data of group.indexGroups) {
				this.transparentIndexBufferData.set(data.indexBuffer, offset); // We're using .set here which should cause a fast memcpy in the JS engine
				offset += data.indices.length;
			}
		}
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.transparentIndexBuffer);
		gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.transparentIndexBufferData, 0, offset);

		this.preparedForRender = true;
	}

	/** Updates this scene and its meshes. */
	update() {
		let { gl } = this.renderer;

		// Update the world transform of all meshes that need an update
		this.updateWorldTransform();

		// Check all static meshes
		for (let i = 0; i < this.staticMeshes.length; i++) {
			let mesh = this.staticMeshes[i];

			if (mesh.needsVertexBufferUpdate) {
				// Geomtry has changed, we need to update the VBOs
				let offset = mesh.vboOffset;

				this.staticPositionBuffer.set(mesh.geometry.positions, offset * 3);
				this.staticNormalBuffer.set(mesh.geometry.normals, offset * 3);
				this.staticUvBuffer.set(mesh.geometry.uvs, offset * 2);

				mesh.needsVertexBufferUpdate = false;
			}

			if (this.firstUpdate || mesh.needsMeshInfoBufferUpdate) {
				mesh.updateMeshInfoBuffer(this.staticMeshInfoTexture.buffer, 16 * i);
			}
		}

		// Check all dynamic meshes
		for (let i = 0; i < this.dynamicMeshes.length; i++) {
			let mesh = this.dynamicMeshes[i];

			if (mesh.needsVertexBufferUpdate) {
				// Geomtry has changed, we need to update the VBOs
				let offset = mesh.vboOffset;

				this.dynamicPositionBuffer.set(mesh.geometry.positions, offset * 3);
				this.dynamicNormalBuffer.set(mesh.geometry.normals, offset * 3);
				this.dynamicUvBuffer.set(mesh.geometry.uvs, offset * 2);

				mesh.needsVertexBufferUpdate = false;
			}

			if (this.firstUpdate || mesh.needsMeshInfoBufferUpdate) {
				mesh.updateMeshInfoBuffer(this.dynamicMeshInfoTexture.buffer, 16 * i);
			}
		}

		// Update the mesh info data textures
		gl.bindTexture(gl.TEXTURE_2D, this.staticMeshInfoTexture.texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.staticMeshInfoTexture.width, this.staticMeshInfoTexture.height, gl.RGBA, gl.FLOAT, this.staticMeshInfoTexture.buffer);

		gl.bindTexture(gl.TEXTURE_2D, this.dynamicMeshInfoTexture.texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.dynamicMeshInfoTexture.width, this.dynamicMeshInfoTexture.height, gl.RGBA, gl.FLOAT, this.dynamicMeshInfoTexture.buffer);

		// Write the updated VBOs to the GPU. If nothing changed, these calls won't do anything.
		this.staticPositionBuffer.update();
		this.staticNormalBuffer.update();
		this.staticUvBuffer.update();

		this.dynamicPositionBuffer.update();
		this.dynamicNormalBuffer.update();
		this.dynamicUvBuffer.update();

		// We also need to update the shadow camera transform
		this.updateDirectionalLights();

		this.firstUpdate = false;
	}

	updateDirectionalLights() {
		let firstLight = this.directionalLights[0];
		if (!firstLight) return;

		if (firstLight.camera) {
			let mat4 = new Matrix4();
			mat4.multiplyMatrices(firstLight.camera.projectionMatrix, firstLight.camera.matrixWorldInverse);
			this.directionalLightTransformBuffer.set(mat4.elements, 0);
		}
	}

	/** Disposes all GPU resources used by this scene. */
	dispose() {
		let { gl } = this.renderer;

		this.staticPositionBuffer.dispose();
		this.staticNormalBuffer.dispose();
		this.staticTangentBuffer.dispose();
		this.staticUvBuffer.dispose();
		this.staticMeshInfoIndexBuffer.dispose();

		gl.deleteTexture(this.staticMeshInfoTexture.texture);
		gl.deleteTexture(this.dynamicMeshInfoTexture.texture);

		gl.deleteBuffer(this.staticOpaqueIndexBuffer);
		gl.deleteBuffer(this.transparentIndexBuffer);
		gl.deleteBuffer(this.staticShadowCasterIndexBuffer);

		this.particleManager.dispose();

		for (let light of this.directionalLights) light.dispose();
	}
}