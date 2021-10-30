import THREE from "three";

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute float meshId;

uniform mat4 transforms[2];
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

void main() {
	vec4 transformed = transforms[int(meshId)] * vec4(position, 1.0);
	transformed = viewMatrix * transformed;
	transformed = projectionMatrix * transformed;

	gl_Position = transformed;
	//gl_Position = vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
void main() {
	gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
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

		gl.bindBuffer(gl.ARRAY_BUFFER, scene.meshIdBuffer);
		if (meshIdLoc >= 0) gl.vertexAttribPointer(
			meshIdLoc,
			1,
			gl.FLOAT,
			false,
			0,
			0
		);

		let loc = gl.getUniformLocation(this.program, 'transforms');
		gl.uniformMatrix4fv(loc, false, new Float32Array(scene.meshes.map(x => x.transform.elements).flat()));

		loc = gl.getUniformLocation(this.program, 'viewMatrix');
		gl.uniformMatrix4fv(loc, false, new Float32Array(new THREE.Matrix4().getInverse(camera.viewMatrix).elements));

		loc = gl.getUniformLocation(this.program, 'projectionMatrix');
		gl.uniformMatrix4fv(loc, false, new Float32Array(camera.projectionMatrix.elements));

		gl.drawArrays(gl.TRIANGLES, 0, scene.triCount * 3);
	}
}

export class Scene {
	renderer: Renderer;
	meshes: Mesh[] = [];
	positionBuffer: WebGLBuffer;
	normalBuffer: WebGLBuffer;
	uvBuffer: WebGLBuffer;
	meshIdBuffer: WebGLBuffer;
	triCount = 0;

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

		for (let mesh of this.meshes) {
			Scene.pushArray(positions, mesh.geometry.positions);
			//normals.push(...mesh.geometry.normals);
			//uvs.push(...mesh.geometry.uvs);
			Scene.pushArray(meshIds, new Array(mesh.geometry.positions.length / 3).fill(this.meshes.indexOf(mesh)));
			this.triCount += mesh.geometry.positions.length / 3;
		}

		let { gl } = this.renderer;
		let positionBuffer = gl.createBuffer();
		let normalBuffer = gl.createBuffer();
		let uvBuffer = gl.createBuffer();
		let meshIdBuffer = gl.createBuffer();

		if (false) positions = [
			0.0, 0.0, 0.0,
			0.0, 1.0, 0.0,
			1.0, 0.0, 0.0
		];

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, meshIdBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meshIds), gl.STATIC_DRAW);

		this.positionBuffer = positionBuffer;
		this.normalBuffer = normalBuffer;
		this.uvBuffer = uvBuffer;
		this.meshIdBuffer = meshIdBuffer;
		//this.triCount = 1;
	}
}

export class Mesh {
	geometry: Geometry;
	transform = new THREE.Matrix4();
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
	scale: THREE.Vector3;

	constructor(geometry: Geometry) {
		this.geometry = geometry;
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