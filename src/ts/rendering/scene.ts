import THREE from "three";
import { BufferAttribute } from "./buffer_attribute";
import { CubeTexture } from "./cube_texture";
import { Group } from "./group";
import { Material } from "./material";
import { Mesh } from "./mesh";
import { Renderer } from "./renderer";
import { Texture } from "./texture";

export interface DrawCall {
	start: number,
	count: number,
	meshes: Mesh[],
	transformsBuffer: Float32Array,
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
	uvBuffer: BufferAttribute;
	transformIndexBuffer: BufferAttribute;
	materialIndexBuffer: BufferAttribute;
	drawCalls: DrawCall[];
	textures: WebGLTexture[] = [];
	indexToDrawCall: number[] = [];
	indexBuffer: WebGLBuffer;
	indexBufferData: Uint32Array;

	ambientLight = new THREE.Color(0);
	directionalLights: {
		color: THREE.Color,
		direction: THREE.Vector3
	}[] = [];

	ambientLightBuffer: Float32Array;
	directionalLightColorBuffer: Float32Array;
	directionalLightDirectionBuffer: Float32Array;

	constructor(renderer: Renderer) {
		super();
		this.renderer = renderer;
	}

	addAmbientLight(color: THREE.Color) {
		this.ambientLight.add(color);
	}

	addDirectionalLight(color: THREE.Color, direction: THREE.Vector3) {
		this.directionalLights.push({ color, direction });
	}

	makeTexture(textures: Texture[]) {
		let maxDim = 0;
		for (let texture of textures) {
			maxDim = Math.max(maxDim, texture.image.naturalWidth, texture.image.naturalHeight);
		}

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
		let positions: number[] = [];
		let normals: number[] = [];
		let uvs: number[] = [];
		let transformIndices: number[] = [];
		let materialIndices: number[] = [];

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
					transformsBuffer: new Float32Array(currentMeshes.length * 16),
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

			for (let mat of mesh.materials) {
				if (!currentMaterials.includes(mat)) newMaterials.push(mat);
				for (let tex of mat.availableTextures) if (!currentTextures.includes(tex)) newTextures.push(tex);
				if (mat.cubeMap && !currentCubeTextures.includes(mat.cubeMap)) newCubeTextures.push(mat.cubeMap);
			}
			
			if (currentTextures.length + newTextures.length > maxArrayTextureLayers) commitTexture();
			if (currentCubeTextures.length + newCubeTextures.length > 4) commitDrawCall();
			if ((currentMeshes.length + 1) * 4 > uniformCounts.transformVectors) commitDrawCall();
			if ((currentMeshes.length + 1) * 1 > uniformCounts.materialVectors) commitDrawCall();

			currentMaterials.push(...newMaterials);
			currentTextures.push(...newTextures);
			currentCubeTextures.push(...newCubeTextures);

			let tris = mesh.geometry.positions.length / 3;
			currentCount += tris;
			currentMeshes.push(mesh);
			currentMeshVertexStarts.push(positions.length/3);

			pushArray(positions, mesh.geometry.positions);
			pushArray(normals, mesh.geometry.normals);
			pushArray(uvs, mesh.geometry.uvs);
			pushArray(transformIndices, new Array(tris).fill(currentMeshes.indexOf(mesh)));
			pushArray(materialIndices, mesh.geometry.materials.map(x => currentMaterials.indexOf(mesh.materials[x])));
			pushArray(this.indexToDrawCall, new Array(tris).fill(drawCalls.length));
		}
		commitDrawCall();
		commitTexture();

		//console.log(textureIds.filter((_, i) => textureIds[i] !== textureIds[i+1]))
		console.log(drawCalls);

		this.positionBuffer = new BufferAttribute(this.renderer, 'position', new Float32Array(positions), 3);
		this.normalBuffer = new BufferAttribute(this.renderer, 'normal', new Float32Array(normals), 3);
		this.uvBuffer = new BufferAttribute(this.renderer, 'uv', new Float32Array(uvs), 2);
		this.transformIndexBuffer = new BufferAttribute(this.renderer, 'transformIndex', new Float32Array(transformIndices), 1);
		this.materialIndexBuffer = new BufferAttribute(this.renderer, 'materialIndex', new Float32Array(materialIndices), 1);

		this.ambientLightBuffer = new Float32Array(this.ambientLight.toArray());
		this.directionalLightColorBuffer = new Float32Array([
			...(this.directionalLights[0]?.color ?? new THREE.Color(0)).toArray(),
			...(this.directionalLights[1]?.color ?? new THREE.Color(0)).toArray()
		]);
		this.directionalLightDirectionBuffer = new Float32Array([
			...(this.directionalLights[0]?.direction ?? new THREE.Vector3()).toArray(),
			...(this.directionalLights[1]?.direction ?? new THREE.Vector3()).toArray()
		]);

		this.indexBufferData = new Uint32Array(transformIndices.length);
		this.indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexBufferData, gl.DYNAMIC_DRAW);
	}
}