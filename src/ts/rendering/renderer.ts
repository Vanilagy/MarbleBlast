import THREE from "three";

const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute float meshId;
attribute float textureId;

uniform mat4 transforms[200];
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

varying float vTextureId;
varying vec2 vUv;

void main() {
	vec4 transformed = transforms[int(meshId)] * vec4(position, 1.0);
	transformed = viewMatrix * transformed;
	transformed = projectionMatrix * transformed;

	gl_Position = transformed;
	//gl_Position = vec4(position, 1.0);

	vTextureId = textureId;
	vUv = uv;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying float vTextureId;
varying vec2 vUv;

uniform sampler2D bitch;

/*
#define numTextures 16
vec4 getSampleFromArray(sampler2D textures[16], int ndx, vec2 uv) {
    vec4 color = vec4(0);
    for (int i = 0; i < numTextures; ++i) {
		//if (i != ndx) continue;
      vec4 c = texture2D(samplers[i], uv);
	  if (i == ndx) color += c;
    }
    return color;
}
*/

void main() {
	int texId = int(vTextureId);
	if (texId != -1) { 
		int texIndex = int(vTextureId);
		//vec4 sampled = getSampleFromArray(samplers, texIndex, vUv);
		//gl_FragColor = sampled;
		gl_FragColor = texture2D(bitch, vUv);
	} else {
		gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
	}
}
`;

export class Renderer {
	options: { canvas: HTMLCanvasElement };
	gl: WebGLRenderingContext;
	program: WebGLProgram;

	constructor(options: { canvas: HTMLCanvasElement }) {
		this.options = options;
		this.gl = options.canvas.getContext('webgl2');
		if (!this.gl) this.gl = options.canvas.getContext('webgl');

		let gl = this.gl;
		let vertexShader = gl.createShader(gl.VERTEX_SHADER);
		let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

		gl.shaderSource(vertexShader, VERTEX_SHADER);
		gl.compileShader(vertexShader);
		gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
		gl.compileShader(fragmentShader);

		if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
			alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(vertexShader));
			return null;
		  }

		  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
			alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(fragmentShader));
			return null;
		  }

		let program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
			return null;
		  }

		this.program = program;
	}

	setSize(width: number, height: number) {
		this.options.canvas.setAttribute('width', width.toString());
		this.options.canvas.setAttribute('height', height.toString());
		this.gl.viewport(0, 0, width, height);
	}

	render(scene: Scene, camera: Camera) {
		let { gl } = this;

		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clearDepth(1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		let positionLoc = gl.getAttribLocation(this.program, 'position');
		let normalLoc = gl.getAttribLocation(this.program, 'normal');
		let uvLoc = gl.getAttribLocation(this.program, 'uv');
		let meshIdLoc = gl.getAttribLocation(this.program, 'meshId');
		let textureIdLoc = gl.getAttribLocation(this.program, 'textureId');

		gl.useProgram(this.program);

		gl.bindBuffer(gl.ARRAY_BUFFER, scene.positionBuffer);
		if (positionLoc >= 0) gl.vertexAttribPointer(
			positionLoc,
			3,
			gl.FLOAT,
			false,
			0,
			0
		);
		gl.enableVertexAttribArray(positionLoc);

		gl.bindBuffer(gl.ARRAY_BUFFER, scene.normalBuffer);
		if (normalLoc >= 0) gl.vertexAttribPointer(
			normalLoc,
			3,
			gl.FLOAT,
			false,
			0,
			0
		);

		gl.bindBuffer(gl.ARRAY_BUFFER, scene.uvBuffer);
		if (uvLoc >= 0) gl.vertexAttribPointer(
			uvLoc,
			2,
			gl.FLOAT,
			false,
			0,
			0
		);
		gl.enableVertexAttribArray(uvLoc);

		gl.bindBuffer(gl.ARRAY_BUFFER, scene.meshIdBuffer);
		if (meshIdLoc >= 0) gl.vertexAttribPointer(
			meshIdLoc,
			1,
			gl.FLOAT,
			false,
			0,
			0
		);
		gl.enableVertexAttribArray(meshIdLoc);

		gl.bindBuffer(gl.ARRAY_BUFFER, scene.textureIdBuffer);
		if (textureIdLoc >= 0) gl.vertexAttribPointer(
			textureIdLoc,
			1,
			gl.FLOAT,
			false,
			0,
			0
		);
		gl.enableVertexAttribArray(textureIdLoc);

		let transformsLoc = gl.getUniformLocation(this.program, 'transforms');
		//gl.uniformMatrix4fv(loc, false, new Float32Array(scene.meshes.map(x => x.transform.elements).flat()));

		let loc = gl.getUniformLocation(this.program, 'viewMatrix');
		gl.uniformMatrix4fv(loc, false, new Float32Array(new THREE.Matrix4().getInverse(camera.viewMatrix).elements));

		loc = gl.getUniformLocation(this.program, 'projectionMatrix');
		gl.uniformMatrix4fv(loc, false, new Float32Array(camera.projectionMatrix.elements));

		//loc = gl.getUniformLocation(this.program, 'samplers');
		//gl.uniform1iv(loc, new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
		loc = gl.getUniformLocation(this.program, 'bitch');
		gl.uniform1i(loc, 0);

		for (let drawCall of scene.drawCalls) {
			for (let texture of drawCall.textures) {
				if (!texture) continue;

				gl.activeTexture((gl as any)['TEXTURE' + drawCall.textures.indexOf(texture)]);
				gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
			}

			gl.uniformMatrix4fv(transformsLoc, false, drawCall.transformsBuffer);
			gl.drawArrays(gl.TRIANGLES, drawCall.start, drawCall.count);
		}
	}

	createMaterial() {

	}

	createTexture() {

	}
}

class Material {
	map: Texture = null;

	constructor() {

	}
}

export class Texture {
	glTexture: WebGLTexture;

	constructor(renderer: Renderer, url: string) {
		let { gl } = renderer;

		console.log(url)

		this.glTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.glTexture);

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
		
		let image = new Image();
		image.src = url;
		image.onload = () => {
			console.log("Did it")
			gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.generateMipmap(gl.TEXTURE_2D);

			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		};
	}
}

interface DrawCall {
	start: number,
	count: number,
	textures: Texture[],
	transforms: THREE.Matrix4[],
	transformsBuffer?: Float32Array
}

export class Scene {
	renderer: Renderer;
	meshes: Mesh[] = [];
	positionBuffer: WebGLBuffer;
	normalBuffer: WebGLBuffer;
	uvBuffer: WebGLBuffer;
	meshIdBuffer: WebGLBuffer;
	textureIdBuffer: WebGLBuffer;
	drawCalls: DrawCall[];

	constructor(renderer: Renderer) {
		this.renderer = renderer;
	}

	add(mesh: Mesh) {
		this.meshes.push(mesh);

	}

	static pushArray<T>(target: T[], toPush: T[]) {
		for (let elem of toPush) target.push(elem);
	}

	compile() {
		let positions: number[] = [];
		let normals: number[] = [];
		let uvs: number[] = [];
		let meshIds: number[] = [];
		let textureIds: number[] = [];

		let { gl } = this.renderer;

		let textures = new Set(this.meshes.map(x => x.material.map));
		let sortedByTexture = [...textures].map(x => this.meshes.filter(y => y.material.map === x)).flat();

		let maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
		let maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number;
		let minVectors = 8;

		let drawCalls: DrawCall[] = [];
		let drawCall: DrawCall = null;
		const commitDrawCall = () => {
			let nextStart = 0;

			if (drawCall && drawCall.count > 0) {
				drawCall.transformsBuffer = new Float32Array(drawCall.transforms.map(x => x.elements).flat());
				console.log(drawCall);
				drawCalls.push(drawCall);
				nextStart = drawCall.start + drawCall.count;
			}

			drawCall = {
				start: nextStart,
				count: 0,
				textures: [],
				transforms: []
			};
		};
		commitDrawCall();
		this.drawCalls = drawCalls;

		for (let mesh of sortedByTexture) {
			if (mesh.material.map) drawCall.textures.push(mesh.material.map);
			if (drawCall.textures.length > maxTextureUnits) {
				drawCall.textures.pop();
				commitDrawCall();
				drawCall.textures.push(mesh.material.map);
			}

			drawCall.transforms.push(mesh.transform);
			if (drawCall.transforms.length * 4 > maxVertexUniformVectors - minVectors) {
				drawCall.transforms.pop();
				commitDrawCall();
				drawCall.transforms.push(mesh.transform);
			}

			let tris = mesh.geometry.positions.length / 3;
			Scene.pushArray(positions, mesh.geometry.positions);
			Scene.pushArray(normals, mesh.geometry.normals);  //normals.push(...mesh.geometry.normals);
			Scene.pushArray(uvs, mesh.geometry.uvs); //uvs.push(...mesh.geometry.uvs);
			Scene.pushArray(meshIds, new Array(tris).fill(drawCall.transforms.indexOf(mesh.transform)));
			Scene.pushArray(textureIds, new Array(tris).fill(drawCall.textures.indexOf(mesh.material.map)));
			drawCall.count += tris;
		}
		commitDrawCall();

		console.log(textureIds);

		let positionBuffer = gl.createBuffer();
		let normalBuffer = gl.createBuffer();
		let uvBuffer = gl.createBuffer();
		let meshIdBuffer = gl.createBuffer();
		let textureIdBuffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, meshIdBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meshIds), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, textureIdBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureIds), gl.STATIC_DRAW);

		this.positionBuffer = positionBuffer;
		this.normalBuffer = normalBuffer;
		this.uvBuffer = uvBuffer;
		this.meshIdBuffer = meshIdBuffer;
		this.textureIdBuffer = textureIdBuffer;
	}
}

export class Mesh {
	geometry: Geometry;
	material: Material;
	transform = new THREE.Matrix4();
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	scale: THREE.Vector3;

	constructor(geometry: Geometry, material: Material = new Material()) {
		this.geometry = geometry;
		this.material = material;
	}
}

export class Geometry {
	positions: number[] = [];
	normals: number[] = [];
	uvs: number[] = [];

	constructor() {

	}

	addTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, aNormal: THREE.Vector3, bNormal: THREE.Vector3, cNormal: THREE.Vector3, aUv: THREE.Vector2, bUv: THREE.Vector2, cUv: THREE.Vector2) {
		this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
		this.normals.push(aNormal.x, aNormal.y, aNormal.z, bNormal.x, bNormal.y, bNormal.z, cNormal.x, cNormal.y, cNormal.z);
		this.uvs.push(aUv.x, aUv.y, bUv.x, bUv.y, cUv.x, cUv.y);
	}
}

export class Camera {
	viewMatrix = new THREE.Matrix4();
	projectionMatrix = new THREE.Matrix4();
}