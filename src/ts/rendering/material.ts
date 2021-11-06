import THREE from "three";
import { Util } from "../util";
import { CubeTexture } from "./cube_texture";
import { Texture } from "./texture";

export enum MaterialType {
	Regular = 0,
	Sky = 1
}

export class Material {
	needsMaterialBufferUpdate = true;
	availableTextures: Texture[] = [];
	private _map: Texture = null;
	cubeMap: CubeTexture = null;
	type: MaterialType = MaterialType.Regular;

	get map() {
		return this._map;
	}

	set map(newMap: Texture) {
		if (!this.availableTextures.includes(newMap)) throw new Error("The assigned texture is not included in the list of available textures.");
		if (newMap === this._map) return;

		this._map = newMap;
		this.needsMaterialBufferUpdate = true;
	}

	emissive = false;
	transparent = false;
	blending = THREE.NormalBlending;

	encode(textures: Texture[], cubeTextures: CubeTexture[]) {
		let bits: boolean[] = [];

		const addBits = (value: number, length: number) => {
			let str = Util.leftPadZeroes(value.toString(2), length);
			for (let i = 0; i < str.length; i++) bits.push(str[i] === '1');
		};

		addBits(this.type, 3);
		addBits(Number(this.emissive), 1);
		addBits(Number(this.transparent), 1);
		addBits(Number(this.blending === THREE.AdditiveBlending), 1);
		addBits(0, 26);

		if (this.type === MaterialType.Sky) {
			addBits(cubeTextures.indexOf(this.cubeMap), 2);
		} else {
			addBits(textures.indexOf(this.map) + 1, 10);
		}

		while (bits.length < 128) bits.push(false);

		let str = bits.map(Number).join('');
		let uints: number[] = [];
		for (let i = 0; i < 4; i++) {
			uints.push(parseInt(str.substr(32 * i, 32), 2));
		}

		return uints;
	}
}