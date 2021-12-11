import { Renderer } from "./renderer";

export class BufferAttribute {
	renderer: Renderer;
	buffer: WebGLBuffer;
	data: Float32Array;
	attributes: Record<string, number>; // name: itemSize
	stride: number;
	updateRange = { start: Infinity, end: 0 };

	constructor(renderer: Renderer, data: Float32Array, attributes: BufferAttribute['attributes']) {
		this.renderer = renderer;
		this.buffer = renderer.gl.createBuffer();
		this.data = data;
		this.attributes = attributes;
		this.stride = Object.values(attributes).reduce((a, b) => a + b, 0);
		if (Object.keys(attributes).length === 0) this.stride = 0; // Indicates a tightly-packed vertex attribute
		
		let { gl } = renderer;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	set(data: ArrayLike<number>, offset: number) {
		this.data.set(data, offset);
		this.updateRange.start = Math.min(this.updateRange.start, offset);
		this.updateRange.end = Math.max(this.updateRange.end, offset + data.length);
	}

	update() {
		if (this.updateRange.start >= this.updateRange.end) return;

		let { gl } = this.renderer;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, this.updateRange.start * Float32Array.BYTES_PER_ELEMENT, this.data, this.updateRange.start, this.updateRange.end - this.updateRange.start);

		this.updateRange.start = Infinity;
		this.updateRange.end = 0;
	}
}