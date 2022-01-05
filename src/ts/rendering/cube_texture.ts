import { Util } from "../util";
import { CubeCamera } from "./cube_camera";
import { Renderer } from "./renderer";
import { Scene } from "./scene";

/** Stores a cube texture. */
export class CubeTexture {
	id = Util.getRandomId();
	renderer: Renderer;
	glTexture: WebGLTexture;
	size: number;
	framebuffer?: WebGLFramebuffer;
	depthBuffer?: WebGLRenderbuffer;
	/** For efficiency purposes, not all faces of the texture are rendered to in one step. Therefore, we need to keep track of where we left off. */
	nextFaceToRender = 0;

	/** Creates a cube texture from 6 images. */
	constructor(renderer: Renderer, images: HTMLImageElement[]);
	/** Creates an empty sqauare cube texture with a specified dimension. */
	constructor(renderer: Renderer, dimension: number);
	constructor(renderer: Renderer, arg2: HTMLImageElement[] | number) {
		this.renderer = renderer;

		let { gl } = renderer;

		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

		if (Array.isArray(arg2)) {
			let images = arg2;
			if (images.some(x => !x.complete)) throw new Error("Can only pass loaded images into CubeTexture.");

			this.size = images[0].naturalWidth; // Assume square images

			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[0]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[1]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[2]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[3]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[4]);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[5]);

			gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
		} else {
			let size = arg2;
			this.size = size;

			let data = new Uint8Array(size * size * 4); // Passing the (albeit empty) data suppresses an annoying warning on Firefox
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}

		// Make sure to set min/mag filters, otherwise nothing will render
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

		this.glTexture = texture;
	}

	/** Creates a framebuffer that will be used to render a scene to this cube texture. */
	createFramebuffer() {
		let { gl } = this.renderer;

		let framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

		let depthBuffer = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);

		// Make a depth buffer and the same size as the target texture
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.size, this.size);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

		this.framebuffer = framebuffer;
		this.depthBuffer = depthBuffer;
	}

	/**
	 * Renders a given scene to the cube texture. Depending on the budget, this might not render to all six faces.
	 * @param budget Defines the maximum amount of time in milliseconds this method should run. Can be used to set an upper bound on render time, since rendering a scene six times _can_ get expensive.
	 */
	render(scene: Scene, cubeCamera: CubeCamera, budget = Infinity) {
		let { gl } = this.renderer;

		if (!this.framebuffer) this.createFramebuffer(); // We're here for the first time, so go and create a framebuffer first

		let start = performance.now();
		let renderedFaces = 0;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

		for (let i = 0; i < 6; i++) {
			// Figure out what face we need to render next based on where we left off
			let index = (this.nextFaceToRender + i) % 6;

			// Update the camera's position
			let camera = cubeCamera.cameras[index];
			camera.position.copy(cubeCamera.position);
			camera.updateMatrixWorld();

			// Bind the correct side of the cube texture to the framebuffer as a texture target
			let target = gl.TEXTURE_CUBE_MAP_POSITIVE_X + index;
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, this.glTexture, 0);

			// Render the scene
			this.renderer.render(scene, camera, { framebuffer: this.framebuffer, width: this.size, height: this.size, colorTexture: this.glTexture });
			renderedFaces++;

			let time = performance.now();
			let elapsed = time - start;
			let elapsedPerFace = elapsed / renderedFaces;

			if (elapsedPerFace * (renderedFaces + 1) >= budget) break; // We predict that the next loop iteration would exceed the budget, so break
		}

		gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.glTexture);
		gl.generateMipmap(gl.TEXTURE_CUBE_MAP); // Make sure to generate mips

		this.nextFaceToRender += renderedFaces;
		this.nextFaceToRender %= 6;
	}

	dispose() {
		let { gl } = this.renderer;

		gl.deleteTexture(this.glTexture);
		gl.deleteFramebuffer(this.framebuffer);
		gl.deleteRenderbuffer(this.depthBuffer);
	}
}