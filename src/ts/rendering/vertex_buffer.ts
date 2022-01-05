import { Renderer } from "./renderer";

/** Encapsulates a vertex buffer object, its data and its vertex attributes. */
export class VertexBuffer {
	renderer: Renderer;
	buffer: WebGLBuffer;
	data: Float32Array;
	attributes: Record<string, number>; // name: itemSize
	/** The amount of bytes all vertex attributes take up for a single vertex. When zero, indicates a tightly-packed vertex attribute. */
	stride: number;
	/** Keeps track of what needs to be updated to send minimum data to the GPU when doing bufferSubData. */
	updateRange = { start: Infinity, end: 0 };

	constructor(renderer: Renderer, data: Float32Array, attributes: VertexBuffer['attributes']) {
		this.renderer = renderer;
		this.buffer = renderer.gl.createBuffer();
		this.data = data;
		this.attributes = attributes;
		this.stride = Object.values(attributes).reduce((a, b) => a + b, 0);
		if (Object.keys(attributes).length === 1) this.stride = 0; // Indicates a tightly-packed vertex attribute

		let { gl } = renderer;

		// Upload the data and done
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	/** Overrides a portion of this VBO's data. Will only be uploaded to the GPU with a call to `update()`. */
	set(data: ArrayLike<number>, offset: number) {
		this.data.set(data, offset);
		this.updateRange.start = Math.min(this.updateRange.start, offset);
		this.updateRange.end = Math.max(this.updateRange.end, offset + data.length);
	}

	/** Uploads any changed data to the GPU. */
	update() {
		if (this.updateRange.start >= this.updateRange.end) return;

		let { gl } = this.renderer;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

		if (!(gl instanceof WebGLRenderingContext)) {
			gl.bufferSubData(gl.ARRAY_BUFFER, this.updateRange.start * Float32Array.BYTES_PER_ELEMENT, this.data, this.updateRange.start, this.updateRange.end - this.updateRange.start);
		} else {
			let slice = this.data.subarray(this.updateRange.start, this.updateRange.end); // This simply creates another view onto the same array buffer, no data is copied here, yay
			gl.bufferSubData(gl.ARRAY_BUFFER, this.updateRange.start * Float32Array.BYTES_PER_ELEMENT, slice);
		}

		// Reset the range
		this.updateRange.start = Infinity;
		this.updateRange.end = 0;
	}

	dispose() {
		let { gl } = this.renderer;

		gl.deleteBuffer(this.buffer);
	}
}

// Most primitive thing ever
export class VertexBufferGroup {
	buffers: VertexBuffer[];

	constructor(buffers: VertexBuffer[]) {
		this.buffers = buffers;
	}
}