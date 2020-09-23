import * as THREE from "three";
import { Util } from "./util";

type DirectoryStructure = {[name: string]: null | DirectoryStructure};

export abstract class ResourceManager {
	static textureCache = new Map<string, THREE.Texture>();
	static textureLoader = new THREE.TextureLoader();
	static dataDirectoryStructure: DirectoryStructure = {};

	static async init() {
		let response = await fetch('./php/get_directory_structure.php');
		this.dataDirectoryStructure = await response.json();
	}

	static getTexture(path: string, removeAlpha = false) {
		let cached = this.textureCache.get(path);
		if (cached) return cached;

		let texture = this.textureLoader.load("assets/data/" + path, () => {
			if (!removeAlpha) return;

			texture.image = Util.removeAlphaChannel(texture.image);
			texture.needsUpdate = true;
		});
		texture.flipY = false;
		texture.anisotropy = 1;

		this.textureCache.set(path, texture);
		return texture;
	}

	static getFullNameOf(path: string) {
		let parts = path.split('/');

		const search = (directory: DirectoryStructure, partIndex: number) => {
			if (partIndex === parts.length) return [];
			let part = parts[partIndex];
			let results: string[] = [];

			for (let name in directory) {
				if (partIndex === parts.length - 1 && name.toLowerCase().startsWith(part.toLowerCase())) results.push(name);
				else if (directory[name]) results.push(...search(directory[name], partIndex + 1));
			}

			return results;
		};

		return search(this.dataDirectoryStructure, 0);
	}
}