import { Util } from "../util";
import { Renderer } from "./renderer";

export class Texture {
	id = Util.getRandomId();
	/** A single texture instance can be used by multiple renderering contexts, that's why we use a map here. */
	glTextures = new Map<Renderer, WebGLTexture>();
	image: HTMLImageElement;

	constructor(image: HTMLImageElement) {
		if (!image.complete) throw new Error("Can only pass loaded images into Texture.");
		this.image = image;
	}

	/** Gets a WebGLTexture object for this texture for a given renderer. Creates one if it doesn't exist yet. */
	getGLTexture(renderer: Renderer) {
		let glTexture = this.glTextures.get(renderer);
		if (glTexture) return glTexture;

		let { gl } = renderer;

		glTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, glTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
		gl.generateMipmap(gl.TEXTURE_2D); // Make sure to enable mipmapping

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		if (renderer.extensions.EXT_texture_filter_anisotropic)
			gl.texParameteri(gl.TEXTURE_2D, renderer.extensions.EXT_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 4); // Anisotropy to make it loop *sharp*
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		this.glTextures.set(renderer, glTexture);
	}
}