import * as THREE from "three";
import { Util } from "./util";

const imageCacheElement = document.querySelector('#image-cache');

type DirectoryStructure = {[name: string]: null | DirectoryStructure};

export abstract class ResourceManager {
	static textureCache = new Map<string, THREE.Texture>();
	static textureLoader = new THREE.TextureLoader();
	static dataDirectoryStructure: DirectoryStructure = {};
	static loadResourcePromises = new Map<string, Promise<Blob>>();
	static cachedResources = new Map<string, Blob>();
	static loadImagePromises = new Map<string, Promise<HTMLImageElement>>();
	static loadedImages = new Map<string, HTMLImageElement>();

	static async init() {
		let response = await fetch('./php/get_directory_structure.php');
		this.dataDirectoryStructure = await response.json();
	}

	static async getTexture(path: string, removeAlpha = false) {
		let cached = this.textureCache.get(path);
		if (cached) return cached;

		let image = await this.loadImage("assets/data/" + path);
		let texture = new THREE.Texture(image);
		texture.flipY = false;
		texture.anisotropy = 1;
		texture.needsUpdate = true;

		if (removeAlpha) {
			texture.image = Util.removeAlphaChannel(image);
		}

		this.textureCache.set(path, texture);
		return texture;
	}

	static getTextureFromCache(path: string) {
		let cached = this.textureCache.get(path);
		if (cached) return cached;
		return null;
	}

	static getFullNameOf(path: string) {
		let parts = path.split('/');

		let current: DirectoryStructure = this.dataDirectoryStructure;
		while (parts.length) {
			let part = parts.shift();

			if (parts.length === 0) {
				let results: string[] = [];

				for (let name in current) {
					if (name.toLowerCase().startsWith(part.toLowerCase())) results.push(name);
				}

				return results;
			} else {
				current = current[part];
			}	
		}
	}

	static loadResource(path: string) {
		let cached = this.cachedResources.get(path);
		if (cached) return cached;
		if (this.loadResourcePromises.get(path)) return this.loadResourcePromises.get(path);

		let promise = new Promise<Blob>((resolve) => {
			const attempt = async () => {
				try {
					let response = await fetch(path);
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

	static loadImage(path: string) {
		if (this.loadedImages.get(path)) return this.loadedImages.get(path);
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
}