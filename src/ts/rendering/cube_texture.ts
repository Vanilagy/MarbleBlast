import { Util } from "../util";
import { CubeCamera } from "./cube_camera";
import { Renderer } from "./renderer";
import { Scene } from "./scene";

export class CubeTexture {
	id = Util.getRandomId();
	renderer: Renderer;
	glTexture: WebGLTexture;
	dim: number;
	framebuffer?: WebGLFramebuffer;
	nextFaceToRender = 0;

	constructor(renderer: Renderer, images: HTMLImageElement[]);
	constructor(renderer: Renderer, dimension: number);
	constructor(renderer: Renderer, arg2: HTMLImageElement[] | number) {
		this.renderer = renderer;

		let { gl } = renderer;

		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

		if (Array.isArray(arg2)) {
			let images = arg2;
			if (images.some(x => !x.complete)) throw new Error("Can only pass loaded images into CubeTexture.");

			let dim = images[0].naturalWidth;
			this.dim = dim;
			
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[0]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[1]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[2]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[3]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[4]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[5]);

			gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
		} else {
			let dim = arg2;
			this.dim = dim;

			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, dim, dim, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}

		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

		this.glTexture = texture;
	}

	createFramebuffer() {
		let { gl } = this.renderer;

		let framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

		let depthBuffer = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);

		// Make a depth buffer and the same size as the targetTexture
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.dim, this.dim);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

		this.framebuffer = framebuffer;
	}

	render(scene: Scene, cubeCamera: CubeCamera, budget = Infinity) {
		let { gl } = this.renderer;

		if (!this.framebuffer) this.createFramebuffer();

		let start = performance.now();
		let renderedFaces = 0;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

		for (let i = 0; i < 6; i++) {
			let index = (this.nextFaceToRender + i) % 6;

			let camera = cubeCamera.cameras[index];
			camera.position.copy(cubeCamera.position);
			camera.updateMatrixWorld();

			let target = gl.TEXTURE_CUBE_MAP_POSITIVE_X + index;
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, this.glTexture, 0);

			this.renderer.render(scene, camera, { framebuffer: this.framebuffer, width: this.dim, height: this.dim, colorTexture: this.glTexture });
			renderedFaces++;

			let time = performance.now();
			let elapsed = time - start;
			let elapsedPerFace = elapsed / renderedFaces;

			if (elapsedPerFace * (renderedFaces + 1) >= budget) break;
		}

		gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.glTexture);;
		gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

		this.nextFaceToRender += renderedFaces;
		this.nextFaceToRender %= 6;
	}
}