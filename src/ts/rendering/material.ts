import THREE from "three";
import { CubeTexture } from "./cube_texture";
import { Texture } from "./texture";

export enum MaterialType {
	Regular = 0,
	Sky = 1,
	Shadow = 2
}

export class Material {
	diffuseMap: Texture = null;
	envMap: CubeTexture = null;
	emissive = false;
	transparent = false;
	opacity = 1;
	blending = THREE.NormalBlending;
	normalizeNormals = false;
	flipY = false;
	isSky = false;

	buildDefineChunk() {
		let defines: string[] = [];

		if (this.diffuseMap) defines.push('USE_DIFFUSE');
		if (this.envMap) defines.push('USE_ENV_MAP');
		if (this.emissive) defines.push('EMISSIVE');
		if (this.transparent) defines.push('TRANSPARENT');
		if (this.normalizeNormals) defines.push('NORMALIZE_NORMALS');
		if (this.flipY) defines.push('FLIP_Y');
		if (this.isSky) defines.push('IS_SKY');

		return defines.map(x => `#define ${x}\n`).join('');
	}
}

/*

export class Material {
	needsMaterialBufferUpdate = true;

	availableTextures: Texture[] = [];
	private _map: Texture = null;
	private _specularMap: Texture = null;
	private _normalMap: Texture = null;
	private _noiseMap: Texture = null;
	envMap: CubeTexture = null;

	type: MaterialType = MaterialType.Regular;
	normalizeNormals = false;
	flipY = false;
	emissive = false;
	transparent = false;
	blending = THREE.NormalBlending;
	opacity = 1;
	reflectivity = 0;
	specularIntensity = 0;
	shininess = 30;
	saturateIncomingLight = true;
	doubleSecondaryMapUvs = false;

	get map() { return this._map; }
	get specularMap() { return this._specularMap; }
	get normalMap() { return this._normalMap; }
	get noiseMap() { return this._noiseMap; }

	set map(newMap: Texture) { this.setMap('_map', newMap); }
	set specularMap(newMap: Texture) { this.setMap('_specularMap', newMap); }
	set normalMap(newMap: Texture) { this.setMap('_normalMap', newMap); }
	set noiseMap(newMap: Texture) { this.setMap('_noiseMap', newMap); }

	private setMap(field: string, map: Texture) {
		if (map === (this as any)[field]) return;
		if (!this.availableTextures.includes(map)) throw new Error("The assigned texture is not included in the list of available textures.");

		(this as any)[field] = map;
		this.needsMaterialBufferUpdate = true;
	}

	encode(textures: Texture[], cubeTextures: CubeTexture[]) {
		let bits: boolean[] = [];

		const addBits = (value: number, length: number) => {
			let str = Util.leftPadZeroes(value.toString(2), length);
			for (let i = 0; i < str.length; i++) bits.push(str[i] === '1');
		};

		const fillWord = () => {
			do bits.push(false); while ((bits.length / 32) % 1);
		};

		addBits(this.type, 3);
		addBits(Number(this.emissive), 1);
		addBits(Number(this.transparent), 1);
		addBits(Number(this.blending === THREE.AdditiveBlending), 1);
		addBits(Number(this.normalizeNormals), 1);
		addBits(Number(this.flipY), 1);
		addBits(Math.floor(Util.clamp(this.opacity, 0, 1) * 255), 8);
		addBits(Math.floor(Util.clamp(this.reflectivity, 0, 1) * 255), 8);
		addBits(Number(this.saturateIncomingLight), 1);
		addBits(Number(this.doubleSecondaryMapUvs), 1);
		fillWord();

		addBits(textures.indexOf(this.map) + 1, 10);
		addBits(cubeTextures.indexOf(this.envMap) + 1, Math.ceil(Math.log2(CUBE_MAPS_PER_DRAW_CALL + 1)));
		addBits(textures.indexOf(this.specularMap) + 1, 10);
		fillWord();

		addBits(textures.indexOf(this.normalMap) + 1, 10);
		addBits(textures.indexOf(this.noiseMap) + 1, 10);
		fillWord();

		addBits(Math.floor(Util.clamp(this.specularIntensity / 4, 0, 1) * 255), 8);
		addBits(Math.floor(Util.clamp(this.shininess, 0, 255)), 8);

		fillWord();

		let str = bits.map(Number).join('');
		let uints: number[] = [];
		for (let i = 0; i < 4; i++) {
			uints.push(parseInt(str.substr(32 * i, 32), 2));
		}

		return uints;
	}
}

*/