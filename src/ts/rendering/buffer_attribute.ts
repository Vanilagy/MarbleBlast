import { Renderer } from "./renderer";

export class BufferAttribute {
	renderer: Renderer;
	buffer: WebGLBuffer;
	name: string;
	data: Float32Array;
	itemSize: number;
	updateRange = { start: Infinity, end: 0 };

	constructor(renderer: Renderer, name: string, data: Float32Array, itemSize: number) {
		this.renderer = renderer;
		this.buffer = renderer.gl.createBuffer();
		this.name = name;
		this.data = data;
		this.itemSize = itemSize;
		
		let { gl } = renderer;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	set(data: ArrayLike<number>, offset: number) {
		this.data.set(data, offset * this.itemSize);
		this.updateRange.start = Math.min(this.updateRange.start, offset * this.itemSize);
		this.updateRange.end = Math.max(this.updateRange.end, offset * this.itemSize + data.length);
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