import * as THREE from "three";
import { Util } from "./util";

const imageCacheElement = document.querySelector('#image-cache');

/** Holds a directory structure. If the value is null, then the key is a file, otherwise the key is a directory and the value is another directory structure. */
export type DirectoryStructure = {[name: string]: null | DirectoryStructure};

/** Manages loading and caching of resources. */
export abstract class ResourceManager {
	static textureCache = new Map<string, THREE.Texture>();
	static loadTexturePromises = new Map<string, Promise<THREE.Texture>>();
	static textureLoader = new THREE.TextureLoader();
	/** The structure in the assets/data directory. Used mainly to look up file extensions. */
	static dataDirectoryStructure: DirectoryStructure = {};
	static loadResourcePromises = new Map<string, Promise<Blob>>();
	static cachedResources = new Map<string, Blob>();
	static loadImagePromises = new Map<string, Promise<HTMLImageElement>>();
	static loadedImages = new Map<string, HTMLImageElement>();
	static urlCache = new Map<Blob, string>();

	static async init() {
		let response = await this.loadResource('./php/get_directory_structure.php');
		this.dataDirectoryStructure = JSON.parse(await this.readBlobAsText(response));
	}

	/** Creates a three.js texture from the path, or returned the cached version. */
	static getTexture(path: string, removeAlpha = false, prependPath = "assets/data/") {
		let cached = this.textureCache.get(path);
		if (cached) return Promise.resolve(cached);

		if (this.loadTexturePromises.get(path)) return this.loadTexturePromises.get(path);

		let promise = new Promise<THREE.Texture>(async (resolve) => {
			let image = await this.loadImage(prependPath + path);
			let texture = new THREE.Texture(image);
			texture.flipY = false; // Why is the default true?
			texture.anisotropy = 4; // Make it crispier
			texture.needsUpdate = true;
	
			if (removeAlpha) {
				// Remove the alpha channel entirely
				texture.image = Util.removeAlphaChannel(image);
			}
	
			this.textureCache.set(path, texture);
			resolve(texture);
		});
		this.loadTexturePromises.set(path, promise);

		return promise;
	}

	static getTextureFromCache(path: string) {
		let cached = this.textureCache.get(path);
		if (cached) return cached;
		return null;
	}

	/** Gets the full filenames (with extension) of the file located at the given path (without extension). */
	static getFullNamesOf(path: string) {
		let parts = path.split('/');

		let current: DirectoryStructure = this.dataDirectoryStructure;
		while (parts.length) {
			let part = parts.shift();

			if (parts.length === 0) {
				let results: string[] = [];

				for (let name in current) {
					if (name.toLowerCase().startsWith(part.toLowerCase()) && (name.length === part.length || name[part.length] === '.')) results.push(name);
				}

				return results;
			} else {
				current = current[part];
				if (!current) return [];
			}	
		}
	}

	/** Loads a resource from a path. Retries until it worked. */
	static loadResource(path: string) {
		let cached = this.cachedResources.get(path);
		if (cached) return Promise.resolve(cached);
		if (this.loadResourcePromises.get(path)) return this.loadResourcePromises.get(path);

		let promise = new Promise<Blob>((resolve) => {
			const attempt = async () => {
				try {
					let response = await fetch(path);
					if (!response.ok) {
						this.cachedResources.set(path, null);
						resolve(null);
						return;
					}

					// Retrieve the blob and store it
					let blob = await response.blob();
					this.cachedResources.set(path, blob);
					resolve(blob);
				} catch (e) {
					// Try again in a second
					setTimeout(attempt, 1000);
				}
			};
			attempt();
		});
		this.loadResourcePromises.set(path, promise);

		return promise;
	}

	/** Preloads an image at a given path. */
	static loadImage(path: string) {
		if (this.loadedImages.get(path)) return Promise.resolve(this.loadedImages.get(path));
		if (this.loadImagePromises.get(path)) return this.loadImagePromises.get(path);

		let promise = new Promise<HTMLImageElement>((resolve) => {
			let image = new Image();
			image.src = path;
			
			image.onload = () => {
				imageCacheElement.appendChild(image);
				this.loadedImages.set(path, image);
				resolve(image);
			};
		});
		this.loadImagePromises.set(path, promise);

		return promise;
	}

	static loadImages(paths: string[]) {
		return Promise.all(paths.map((path) => this.loadImage(path)));
	}

	static getImageFromCache(path: string) {
		return this.loadedImages.get(path) || null;
	}

	static readBlobAsText(blob: Blob, encoding?: string) {
		if (blob.text) return blob.text();
		else return new Promise<string>((resolve) => {
			let reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result as string);
			reader.readAsText(blob, encoding);
		});
	}

	static readBlobAsArrayBuffer(blob: Blob) {
		if (blob.arrayBuffer) return blob.arrayBuffer();
		else return new Promise<ArrayBuffer>((resolve) => {
			let reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result as ArrayBuffer);
			reader.readAsArrayBuffer(blob);
		});
	}

	static readBlobAsDataUrl(blob: Blob) {
		return new Promise<string>((resolve) => {
			let reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result as string);
			reader.readAsDataURL(blob);
		});
	}

	/** Converts a blob to a temporary URL. Returns a cached URL whenever possible. */
	static getUrlToBlob(blob: Blob) {
		if (this.urlCache.get(blob)) return this.urlCache.get(blob);

		let url = URL.createObjectURL(blob);
		this.urlCache.set(blob, url);
		return url;
	}
}