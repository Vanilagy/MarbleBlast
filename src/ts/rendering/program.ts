import { BufferAttribute } from "./buffer_attribute";
import { Renderer } from "./renderer";

export class Program {
	renderer: Renderer;
	glProgram: WebGLProgram;
	boundBuffers = new Set<BufferAttribute>();
	uniformLocations = new Map<string, WebGLUniformLocation>();

	constructor(renderer: Renderer, vertexSource: string, fragmentSource: string) {
		this.renderer = renderer;

		let { gl } = renderer;

		let vertexShader = gl.createShader(gl.VERTEX_SHADER);
		let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

		gl.shaderSource(vertexShader, vertexSource);
		gl.compileShader(vertexShader);
		gl.shaderSource(fragmentShader, fragmentSource);
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

		this.glProgram = program;
	}

	use() {
		this.renderer.gl.useProgram(this.glProgram);
	}

	bindBufferAttribute(buf: BufferAttribute) {
		if (this.boundBuffers.has(buf)) return;

		let { gl } = this.renderer;

		let location = gl.getAttribLocation(this.glProgram, buf.name);
		if (location === -1) return;

		gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);
		gl.vertexAttribPointer(location, buf.itemSize, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(location);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.boundBuffers.add(buf);
	}

	getUniformLocation(name: string) {
		if (this.uniformLocations.has(name)) return this.uniformLocations.get(name);

		let { gl } = this.renderer;

		let location = gl.getUniformLocation(this.glProgram, name);
		this.uniformLocations.set(name, location);

		return location;
	}
}