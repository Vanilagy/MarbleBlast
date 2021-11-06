import { Renderer } from "./renderer";

export class Texture {
	glTexture: WebGLTexture;
	image: HTMLImageElement;

	constructor(renderer: Renderer, image: HTMLImageElement) {
		let { gl } = renderer;

		if (!image.complete) throw new Error("Can only pass loaded images into Texture.");
		this.image = image;

		return;

		this.glTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));

		this.loaded = new Promise(resolve => {
			resolve();
			return; // for now temp
			image.onload = () => {
				console.log("Did it")
				resolve();

				return;
				gl.bindTexture(gl.TEXTURE_2D, this.glTexture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.generateMipmap(gl.TEXTURE_2D);
	
				var ext = (
					gl.getExtension('EXT_texture_filter_anisotropic') ||
					gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
					gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
				  );
	
	
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

				resolve();
			};
			image.onerror = () => {
				this.image = new Image();
			};
		});
		
	}
}