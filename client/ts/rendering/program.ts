import { VertexBuffer, VertexBufferGroup } from "./vertex_buffer";
import { Renderer } from "./renderer";

/** Represents a WebGL program composed of a vertex and fragment shader. */
export class Program {
	renderer: Renderer;
	vertexShader: WebGLShader;
	fragmentShader: WebGLShader;
	glProgram: WebGLProgram;
	/** For each vertex buffer group, store a VAO for faster binding later. */
	vertexArrayObjects = new Map<VertexBufferGroup, WebGLVertexArrayObject>();
	uniformLocations = new Map<string, WebGLUniformLocation>();
	attributeLocations = new Map<string, number>();
	compileStatusChecked = false;

	constructor(renderer: Renderer, vertexSource: string, fragmentSource: string, defineChunk = "") {
		this.renderer = renderer;

		let { gl } = renderer;

		if (!(gl instanceof WebGLRenderingContext)) {
			// We need to convert the shader to version 300 in order to use fancy WebGL2 features
			[vertexSource, fragmentSource] = this.convertFromGLSL100ToGLSL300(vertexSource, fragmentSource);
		}

		// Inject definitions into both shaders
		let useLogDepthBuf = !(gl instanceof WebGLRenderingContext) || !!renderer.extensions.EXT_frag_depth;
		let definitions = `
			${useLogDepthBuf? '#define LOG_DEPTH_BUF' : ''}
			${(gl instanceof WebGLRenderingContext)? '#define IS_WEBGL1' : ''}
			${defineChunk}
		`;
		vertexSource = vertexSource.replace('#include <definitions>', definitions);
		fragmentSource = fragmentSource.replace('#include <definitions>', definitions);

		this.vertexShader = gl.createShader(gl.VERTEX_SHADER);
		this.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

		gl.shaderSource(this.vertexShader, vertexSource);
		gl.shaderSource(this.fragmentShader, fragmentSource);
		gl.compileShader(this.vertexShader);
		gl.compileShader(this.fragmentShader);

		let program = gl.createProgram();
		gl.attachShader(program, this.vertexShader);
		gl.attachShader(program, this.fragmentShader);
		gl.linkProgram(program);

		// We don't check compile/link status here because it's a synchronous operation that blocks until compilation completes. It's much more efficient to check it later.

		this.glProgram = program;
	}

	convertFromGLSL100ToGLSL300(vertSrc: string, fragSrc: string): [string, string] {
		vertSrc = '#version 300 es\n' + vertSrc;
		fragSrc = '#version 300 es\n' + fragSrc;

		vertSrc = vertSrc.replace(/\nattribute /g, '\nin ');
		vertSrc = vertSrc.replace(/\nvarying /g, '\nout ');

		fragSrc = fragSrc.replace(/\nvarying /g, '\nin ');
		fragSrc = fragSrc.replace('\nvoid main()', 'out vec4 FragColor;\nvoid main()'); // There is no gl_FragColor, so we make our own one
		fragSrc = fragSrc.replace(/gl_FragColor/g, 'FragColor');
		fragSrc = fragSrc.replace(/gl_FragDepthEXT/g, 'gl_FragDepth');

		// Create alises for the sampler functions
		let definitions = `
			#define texture2D texture
			#define textureCube texture
			#include <definitions>
		`;
		vertSrc = vertSrc.replace('#include <definitions>', definitions);
		fragSrc = fragSrc.replace('#include <definitions>', definitions);

		return [ vertSrc, fragSrc ];
	}

	checkCompileStatus() {
		let { gl } = this.renderer;

		this.compileStatusChecked = true;

		if (!gl.getShaderParameter(this.vertexShader, gl.COMPILE_STATUS)) {
			console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(this.vertexShader));
			return;
		}

		if (!gl.getShaderParameter(this.fragmentShader, gl.COMPILE_STATUS)) {
			console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(this.fragmentShader));
			return;
		}

		if (!gl.getProgramParameter(this.glProgram, gl.LINK_STATUS)) {
			console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(this.glProgram));
			return;
		}
	}

	/** Enables this program and properly cleans up the previously-enabled program. */
	use() {
		if (this.renderer.currentProgram === this) return;
		if  (!this.compileStatusChecked) this.checkCompileStatus();

		this.renderer.currentProgram?.unuse();

		this.renderer.gl.useProgram(this.glProgram);
		this.renderer.currentProgram = this;
	}

	unuse() {
		let { gl } = this.renderer;

		this.renderer.bindVertexArray(null); // Disable the VAO first so that VBO changes aren't stored into it
		for (let [, loc] of this.attributeLocations) gl.disableVertexAttribArray(loc);
	}

	/** Binds a group of VBOs and stores the state in a VAO for faster reuse later. */
	bindVertexBufferGroup(group: VertexBufferGroup) {
		if (this.vertexArrayObjects.has(group)) {
			// We've already seen this vertex group, just bind the VAO
			this.renderer.bindVertexArray(this.vertexArrayObjects.get(group));
			return;
		}

		let { gl } = this.renderer;

		let vao = this.renderer.createVertexArray();
		this.renderer.bindVertexArray(vao);

		for (let buffer of group.buffers) this.bindVertexBuffer(buffer);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); // VAOs also store the currently-bound element array buffer, and since we want a clean VAO, just bind null here

		this.vertexArrayObjects.set(group, vao);
	}

	/** Binds a single vertex buffer and all attributes associated with it. */
	bindVertexBuffer(buf: VertexBuffer) {
		let { gl } = this.renderer;

		gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);

		let offset = 0;
		// Simply loop over all attributes and create vertex attribute pointers for them
		for (let attribute in buf.attributes) {
			let itemSize = buf.attributes[attribute];
			let thisOffset = offset;
			offset += itemSize;

			let location = this.attributeLocations.get(attribute);
			if (location === undefined) {
				location = gl.getAttribLocation(this.glProgram, attribute);
				if (location >= 0) this.attributeLocations.set(attribute, location);
			}
			if (location === -1) continue;

			gl.enableVertexAttribArray(location);
			gl.vertexAttribPointer(
				location,
				itemSize,
				gl.FLOAT,
				false,
				Float32Array.BYTES_PER_ELEMENT * buf.stride,
				Float32Array.BYTES_PER_ELEMENT * thisOffset
			);
		}
	}

	getUniformLocation(name: string) {
		if (this.uniformLocations.has(name)) return this.uniformLocations.get(name);

		let { gl } = this.renderer;

		let location = gl.getUniformLocation(this.glProgram, name);
		this.uniformLocations.set(name, location);

		return location;
	}

	cleanUp() {
		// We only need to trash the VAO
		this.renderer.bindVertexArray(null);
		for (let [, vao] of this.vertexArrayObjects) this.renderer.deleteVertexArray(vao);
		this.vertexArrayObjects.clear();
	}
}