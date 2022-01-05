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

/** Groups together different geometry from different meshes which all share the same material, so that they can all be drawn together. */
export interface MaterialGroup {
	material: Material,
	indexGroups: MaterialIndexData[],
	defineChunk: string,
	/** Offset into the index buffer. */
	offset: number,
	/** How many vertices to draw. */
	count: number,
	/** Minimum distance of any mesh in this group to the camera; will be updated on the fly. */
	minDistance?: number
}

/** A scene is responsible for holding the description of a renderable world and preparing it for efficient rendering. */
export class Scene extends Group {
	renderer: Renderer;

	positionBuffer: VertexBuffer;
	normalBuffer: VertexBuffer;
	tangentBuffer: VertexBuffer;
	uvBuffer: VertexBuffer;
	/** For each vertex, stores the index of the mesh this vertex belongs to, so that it can be properly transformed in the shader. */
	meshInfoIndexBuffer: VertexBuffer;
	bufferGroup: VertexBufferGroup;

	meshInfoBuffer: Float32Array;
	/** The texture holding the mesh info for all meshes. This is simply used a random-access buffer, not a texture to be drawn as pixels on a screen. */
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

	/**
	 * Compiles the scene and all its meshes into neatly-packed buffers and draw calls for efficient rendering. After a scene has been
	 * compiled, no meshes can be added to or removed from it. In a general 3D engine this would be a very hard limitation, however it
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
		let materialMap = new Map<string, MaterialGroup>();

		let allMeshes: Mesh[] = [];
		this.traverse(obj => obj instanceof Mesh && allMeshes.push(obj));
		this.allMeshes = allMeshes;

		// Create the arrays that will form VBO data
		let positions: number[] = [];
		let normals: number[] = [];
		let tangents: number[] = [];
		let uvs: number[] = [];
		let meshInfoIndices: number[] = [];
		let shadowCasterIndices: number[] = [];

		for (let [index, mesh] of allMeshes.entries()) {
			mesh.geometry.validate();
			mesh.vboOffset = meshInfoIndices.length;
			mesh.compileMaterialIndices();

			let verts = mesh.geometry.positions.length / 3;

			Util.pushArray(positions, mesh.geometry.positions);
			Util.pushArray(normals, mesh.geometry.normals);
			Util.pushArray(uvs, mesh.geometry.uvs);
			Util.pushArray(meshInfoIndices, Array(verts).fill(index));

			let hasNormalMap = mesh.materials.some(x => x.normalMap);
			if (hasNormalMap) {
				// Normal map calculations require us to do operations in so-called "tangent space", for which we need an extra tangent vector in addition to the normal
				this.computeTangents(mesh.geometry.positions, mesh.geometry.normals, mesh.geometry.uvs, tangents);
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

				this.updateMaterialGroup(materialMap, data);
			}
		}

		let opaqueMaterialGroups = [...materialMap].map(x => x[1]);
		// Group material groups by define chunk to minimize the amount of calls to gl.useProgram. Then, make sure materials with the lowest render order go first.
		opaqueMaterialGroups.sort((a, b) => a.defineChunk.localeCompare(b.defineChunk)).sort((a, b) => a.material.renderOrder - b.material.renderOrder);
		this.opaqueMaterialGroups = opaqueMaterialGroups;

		// Will form the data for our index buffer
		let indices: number[] = [];

		for (let group of opaqueMaterialGroups) {
			group.offset = indices.length;
			for (let data of group.indexGroups) Util.pushArray(indices, data.indices);
		}

		// Create all vertex buffers
		this.positionBuffer = new VertexBuffer(this.renderer, new Float32Array(positions), { 'position': 3 });
		this.normalBuffer = new VertexBuffer(this.renderer, new Float32Array(normals), { 'normal': 3 });
		this.tangentBuffer = new VertexBuffer(this.renderer, new Float32Array(tangents), { 'tangent': 4 } );
		this.uvBuffer = new VertexBuffer(this.renderer, new Float32Array(uvs), { 'uv': 2 });
		this.meshInfoIndexBuffer = new VertexBuffer(this.renderer, new Float32Array(meshInfoIndices), { 'meshInfoIndex': 1 });

		// Group the vertex buffers so they can be put into a single VAO
		this.bufferGroup = new VertexBufferGroup([this.positionBuffer, this.normalBuffer, this.tangentBuffer, this.uvBuffer, this.meshInfoIndexBuffer]);

		// Now, create our data texture to hold mesh information
		let maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		let textureWidth = this.meshInfoTextureWidth = Util.ceilPowerOf2(Math.min(4 * allMeshes.length, maxTextureSize)); // (WebGL1) textures need to have power-of-two dimension
		let textureHeight = this.meshInfoTextureHeight = Util.ceilPowerOf2(Math.ceil(4 * allMeshes.length / Math.max(maxTextureSize, textureWidth)));
		let internalFormat = (gl instanceof WebGLRenderingContext)? gl.RGBA : gl.RGBA32F;
		this.meshInfoBuffer = new Float32Array(4 * textureWidth * textureHeight); // One mat4 per mesh
		this.meshInfoTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.meshInfoTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, textureWidth, textureHeight, 0, gl.RGBA, gl.FLOAT, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // LINEAR would make no sense here
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

		// Now, allocate the index buffers
		let opaqueIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, opaqueIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
		this.opaqueIndexBuffer = opaqueIndexBuffer;

		this.shadowCasterIndices = shadowCasterIndices;
		this.shadowCasterIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.shadowCasterIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(shadowCasterIndices), gl.STATIC_DRAW);

		// Allocate the index buffer for transparent objects. Since technically, every mesh could become transparent at some point, we need to make this buffer big enough to fit all meshes.
		let totalIndexCount = allMeshes.map(x => x.geometry.indices.length).reduce((a, b) => a + b, 0);
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

	/** Updates (or creates) a material group and adds index data to it. */
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

		this.update();
		this.directionalLights[0]?.renderShadowMap(this);

		let temp = new Vector3();
		let cameraPosition = camera.position;
		let transparentMeshes = this.allMeshes.filter(x => x.hasTransparentMaterials || (x.opacity < 1 && x.opacity > 0)); // Find out which meshes are transparent so we don't sort opaque stuff too

		// Compute the distances to the camera
		for (let mesh of transparentMeshes) {
			mesh.distanceToCamera = temp.setFromMatrixPosition(mesh.worldTransform).distanceToSquared(cameraPosition);
		}

		// Sort transparent meshes using the painter's algorithm, furthest first
		let sortedMeshes = transparentMeshes.sort((a, b) => b.distanceToCamera - a.distanceToCamera);
		let materialMap = new Map<string, MaterialGroup>();

		// Create the material groups for the transparent objects
		for (let mesh of sortedMeshes) {
			for (let data of mesh.materialIndices) {
				let material = data.material;
				let effectiveOpacity = mesh.opacity * material.opacity;

				if ((!material.transparent && effectiveOpacity === 1) || effectiveOpacity === 0) continue;

				let group = this.updateMaterialGroup(materialMap, data);
				group.minDistance = Math.min(group.minDistance, mesh.distanceToCamera);
			}
		}

		// We also need to sort the individual material groups by distance to get more accurate results. This is because
		// what we're doing is actually inaccurate, since we're drawing all geometry of a single material at once, which
		// works fine for opaque objects where order doesn't matter, but falls apart for transparent objects where correct
		// depth sorting is paramount. To reduce errors as much as possible, make sure we draw the materials with the furthest
		// minimum distance to the camera first.
		let materialGroups = [...materialMap].map(x => x[1]);
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

		for (let i = 0; i < this.allMeshes.length; i++) {
			let mesh = this.allMeshes[i];

			if (mesh.needsVertexBufferUpdate) {
				// Geomtry has changed, we need to update the VBOs
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

		// Update the mesh info data texture
		gl.bindTexture(gl.TEXTURE_2D, this.meshInfoTexture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.meshInfoTextureWidth, this.meshInfoTextureHeight, gl.RGBA, gl.FLOAT, this.meshInfoBuffer);

		// Write the updated VBOs to the GPU. If nothing changed, these calls won't do anything.
		this.positionBuffer.update();
		this.normalBuffer.update();
		this.uvBuffer.update();

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