import THREE from "three";
import { CubeTexture } from "./cube_texture";
import { Texture } from "./texture";

export enum MaterialType {
	Regular = 0,
	Sky = 1,
	Shadow = 2
}

export class Material {
	differentiator = '';
	diffuseMap: Texture = null;
	envMap: CubeTexture = null;
	normalMap: Texture = null;
	specularMap: Texture = null;
	noiseMap: Texture = null;
	emissive = false;
	transparent = false;
	depthWrite = true;
	opacity = 1;
	blending = THREE.NormalBlending;
	normalizeNormals = false;
	flipY = false;
	isSky = false;
	isShadow = false;
	receiveShadows = false;
	reflectivity = 0;
	envMapZUp = true;
	useFresnel = false;
	specularIntensity = 0;
	shininess = 30;
	saturateIncomingLight = true;
	visible = true;
	renderOrder = 0;
	secondaryMapUvFactor = 1;

	private hashCache: string = null;
	getHash() {
		if (this.hashCache) return this.hashCache;

		let components: any[] = [
			this.differentiator,
			this.diffuseMap?.id,
			this.envMap?.id,
			this.normalMap?.id,
			this.specularMap?.id,
			this.noiseMap?.id,
			this.emissive,
			this.transparent,
			this.depthWrite,
			this.opacity,
			this.blending,
			this.normalizeNormals,
			this.flipY,
			this.isSky,
			this.isShadow,
			this.receiveShadows,
			this.reflectivity,
			this.envMapZUp,
			this.useFresnel,
			this.specularIntensity,
			this.shininess,
			this.saturateIncomingLight,
			this.renderOrder,
			this.secondaryMapUvFactor
		];
		return this.hashCache = components.map(x => '' + x).join(' ');
	}

	private defineChunkCache: string = null;
	getDefineChunk() {
		if (this.defineChunkCache) return this.defineChunkCache;

		let defines: string[] = [];

		if (this.diffuseMap) defines.push('USE_DIFFUSE');
		if (this.envMap) defines.push('USE_ENV_MAP');
		if (this.normalMap) defines.push('USE_NORMAL_MAP');
		if (this.specularMap) defines.push('USE_SPECULAR_MAP');
		if (this.noiseMap) defines.push('USE_NOISE_MAP');
		if (this.emissive) defines.push('EMISSIVE');
		if (this.transparent) defines.push('TRANSPARENT');
		if (this.normalizeNormals) defines.push('NORMALIZE_NORMALS');
		if (this.flipY) defines.push('FLIP_Y');
		if (this.isSky) defines.push('IS_SKY');
		if (this.isShadow) defines.push('IS_SHADOW');
		if (this.receiveShadows) defines.push('RECEIVE_SHADOWS');
		if (this.envMapZUp) defines.push('ENV_MAP_Z_UP');
		if (this.useFresnel) defines.push('USE_FRESNEL');
		if (this.specularIntensity) defines.push('USE_SPECULAR');
		if (this.saturateIncomingLight) defines.push('SATURATE_INCOMING_LIGHT');

		return this.defineChunkCache = defines.map(x => `#define ${x}\n`).join('');
	}
}