import { DdsParser } from "./parsing/dds_parser";
import { Texture } from "./rendering/texture";
import { state } from "./state";
import { mainRenderer } from "./ui/misc";

const imageCacheElement = document.querySelector('#image-cache');

/** Holds a directory structure. If the value is null, then the key is a file, otherwise the key is a directory and the value is another directory structure. */
export type DirectoryStructure = {[name: string]: null | DirectoryStructure};

const MBP_REDIRECT_RULES = {
	'assets/data_mbp/sound/gotgem.wav': 'assets/data_mbp/sound/gotdiamond.wav',
	'assets/data_mbp/sound/gotallgems.wav': 'assets/data_mbp/sound/gotalldiamonds.wav',
	'assets/data_mbp/sound/music/groovepolice': 'assets/data_mbp/sound/music/groove police'
};

/** Manages loading and caching of resources. */
export abstract class ResourceManager {
	static textureCache = new Map<string, Texture>();
	static loadTexturePromises = new Map<string, Promise<Texture>>();
	/** The structure in the assets/data directory. Used mainly to look up file extensions. */
	static dataDirectoryStructure: DirectoryStructure = {};
	static dataMbpDirectoryStructure: DirectoryStructure = {};
	static loadResourcePromises = new Map<string, Promise<Blob>>();
	static cachedResources = new Map<string, Blob>();
	static loadImagePromises = new Map<string, Promise<HTMLImageElement>>();
	static loadedImages = new Map<string, HTMLImageElement>();
	static urlCache = new Map<Blob, string>();

	static get mainDataPath() {
		return (state.modification === 'gold')? './assets/data/' : './assets/data_mbp/';
	}

	static async init() {
		let promiseMbg = this.loadResource('./api/directory_structure');
		let promiseMbp = this.loadResource('./api/directory_structure_mbp');

		let [responseMbg, responseMbp] = await Promise.all([promiseMbg, promiseMbp]);

		this.dataDirectoryStructure = JSON.parse(await this.readBlobAsText(responseMbg));
		this.dataMbpDirectoryStructure = JSON.parse(await this.readBlobAsText(responseMbp));
	}

	/** Creates a Texture from the path, or returns the cached version. */
	static getTexture(path: string, prependPath = this.mainDataPath) {
		let fullPath = prependPath + path;
		let cached = this.textureCache.get(fullPath);
		if (cached) return Promise.resolve(cached);

		if (this.loadTexturePromises.get(fullPath)) return this.loadTexturePromises.get(fullPath);

		let promise = new Promise<Texture>(async (resolve, reject) => {
			try {
				let image = await this.loadImage(fullPath);
				let texture = new Texture(image);
				texture.getGLTexture(mainRenderer); // Any texture is immediately uploaded to the main renderer context as a preloading measure. This avoids flickering later.

				this.textureCache.set(fullPath, texture);
				this.loadTexturePromises.delete(fullPath);
				resolve(texture);
			} catch (e) {
				reject(e);
			}
		});
		this.loadTexturePromises.set(fullPath, promise);

		return promise;
	}

	static getTextureFromCache(path: string, prependPath = this.mainDataPath) {
		let fullPath = prependPath + path;
		let cached = this.textureCache.get(fullPath);
		if (cached) return cached;
		return null;
	}

	/** Gets the full filenames (with extension) of the file located at the given path (without extension). */
	static getFullNamesOf(path: string, mbp = state.modification === 'platinum') {
		let parts = path.split('/');

		let current: DirectoryStructure = mbp? this.dataMbpDirectoryStructure : this.dataDirectoryStructure;
		while (parts.length) {
			let part = parts.shift();

			if (parts.length === 0) {
				let results: string[] = [];

				for (let name in current) {
					if (name.toLowerCase().startsWith(part.toLowerCase())
						// Make sure nothing or only the extension follows
						&& (name.length === part.length || part.length === name.lastIndexOf('.')))
						results.push(name);
				}

				return results;
			} else {
				current = current[part];
				if (!current) return [];
			}
		}
	}

	static redirectPath(path: string) {
		if (state.modification !== 'gold') {
			for (let key in MBP_REDIRECT_RULES) {
				if (path.includes(key)) return path.replace(key, MBP_REDIRECT_RULES[key as keyof typeof MBP_REDIRECT_RULES]);
			}
		}

		return path;
	}

	/** Loads a resource from a path. Retries until it worked. */
	static loadResource(path: string) {
		path = this.redirectPath(path);
		let cached = this.cachedResources.get(path);
		if (cached) return Promise.resolve(cached);
		if (this.loadResourcePromises.get(path)) return this.loadResourcePromises.get(path);

		let promise = new Promise<Blob>((resolve, reject) => {
			const attempt = async () => {
				try {
					let response = await fetch(path);

					if (response.status === 404) {
						this.cachedResources.set(path, null);
						this.loadResourcePromises.delete(path);
						resolve(null);
						return;
					} else if (!response.ok) {
						// If we get an error code that isn't 404, the resource isn't just missing, but the request failed somehow. Throw.
						reject(`Error getting resource (${response.status}): ` + path);
						this.loadResourcePromises.delete(path);
						return;
					}

					// Retrieve the blob and store it
					let blob = await response.blob();
					this.cachedResources.set(path, blob);
					this.loadResourcePromises.delete(path);
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
	static loadImage(path: string, originalPath = path) {
		if (this.loadedImages.get(path)) return Promise.resolve(this.loadedImages.get(path));
		if (this.loadImagePromises.get(path)) return this.loadImagePromises.get(path);

		let promise = new Promise<HTMLImageElement>(async (resolve, reject) => {
			if (originalPath.toLowerCase().endsWith('.dds')) {
				// DDS images can't be loaded normally, so let's do it ourselves:

				let arrayBuffer = await this.readBlobAsArrayBuffer(await this.loadResource(path));
				try {
					let image = await DdsParser.toImage(arrayBuffer);
					resolve(image);
				} catch (e) {
					reject(e);
				}

				return;
			}

			let image = new Image();
			image.src = path;

			image.onload = () => {
				imageCacheElement.appendChild(image);
				this.loadedImages.set(path, image);
				this.loadImagePromises.delete(path);
				resolve(image);

				image.onload = null; // GC requires me to do this
			};

			image.onerror = (e) => {
				reject(e);
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

	static async readBlobAsJson(blob: Blob, encoding?: string) {
		let text = await this.readBlobAsText(blob, encoding);
		return JSON.parse(text);
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

	/** Fetches a URL until a response a received. */
	static retryFetch(input: RequestInfo, init?: RequestInit) {
		return new Promise<Blob>(resolve => {
			const attempt = async () => {
				try {
					let response = await fetch(input, init);

					if (response.status === 404) {
						resolve(null);
						return;
					}

					let blob = await response.blob();
					resolve(blob);
				} catch (e) {
					setTimeout(attempt, 1000);
				}
			};
			attempt();
		});
	}
}