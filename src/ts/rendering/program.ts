import { BufferAttribute } from "./buffer_attribute";
import { Renderer } from "./renderer";

export class Program {
	renderer: Renderer;
	vertexShader: WebGLShader;
	fragmentShader: WebGLShader;
	glProgram: WebGLProgram;
	uniformLocations = new Map<string, WebGLUniformLocation>();
	attributeLocations = new Map<string, number>();
	compileStatusChecked = false;

	constructor(renderer: Renderer, vertexSource: string, fragmentSource: string, defineChunk = "") {
		this.renderer = renderer;

		let { gl } = renderer;

		if (!(gl instanceof WebGLRenderingContext)) {
			[vertexSource, fragmentSource] = this.convertFromGLSL100ToGLSL300(vertexSource, fragmentSource);
		}

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

		this.glProgram = program;
	}

	convertFromGLSL100ToGLSL300(vertSrc: string, fragSrc: string): [string, string] {
		vertSrc = '#version 300 es\n' + vertSrc;
		fragSrc = '#version 300 es\n' + fragSrc;

		vertSrc = vertSrc.replace(/\nattribute /g, '\nin ');
		vertSrc = vertSrc.replace(/\nvarying /g, '\nout ');

		fragSrc = fragSrc.replace(/\nvarying /g, '\nin ');
		fragSrc = fragSrc.replace('\nvoid main()', 'out vec4 FragColor;\nvoid main()');
		fragSrc = fragSrc.replace(/gl_FragColor/g, 'FragColor');
		fragSrc = fragSrc.replace(/gl_FragDepthEXT/g, 'gl_FragDepth');

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

	use() {
		if (this.renderer.currentProgram === this) return;
		if  (!this.compileStatusChecked) this.checkCompileStatus();

		this.renderer.currentProgram?.unuse();
		
		this.renderer.gl.useProgram(this.glProgram);
		this.renderer.currentProgram = this;

		let { gl } = this.renderer;
		for (let [, loc] of this.attributeLocations) gl.enableVertexAttribArray(loc);
	}

	unuse() {
		let { gl } = this.renderer;
		for (let [, loc] of this.attributeLocations) gl.disableVertexAttribArray(loc);
	}

	bindBufferAttribute(buf: BufferAttribute) {
		let { gl } = this.renderer;

		gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);

		let offset = 0;
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

			gl.vertexAttribPointer(
				location,
				itemSize,
				gl.FLOAT,
				false,
				Float32Array.BYTES_PER_ELEMENT * buf.stride,
				Float32Array.BYTES_PER_ELEMENT * thisOffset
			);
			gl.enableVertexAttribArray(location);
		}
	}

	getUniformLocation(name: string) {
		if (this.uniformLocations.has(name)) return this.uniformLocations.get(name);

		let { gl } = this.renderer;

		let location = gl.getUniformLocation(this.glProgram, name);
		this.uniformLocations.set(name, location);

		return location;
	}
}