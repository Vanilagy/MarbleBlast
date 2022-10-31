import { CubeTexture } from "./cube_texture";
import { BlendingType } from "./renderer";
import { Texture } from "./texture";

/** A material defines the visual appearance of a mesh and controls the vertex/fragment shaders that are needed to render it. */
export class Material {
	/** Identical materials will get merged into one. To keep materials separate, this differentiator value can be set to something that makes this material unique. */
	differentiator = '';
	diffuseMap: Texture = null;
	envMap: CubeTexture = null;
	normalMap: Texture = null;
	specularMap: Texture = null;
	noiseMap: Texture = null;
	emissive = false;
	transparent = false;
	/** When false, the depth buffer will not be written to. */
	depthWrite = true;
	opacity = 1;
	blending: BlendingType = BlendingType.Normal;
	/** When set to true, normals will be normalized in the shader before they are used. */
	normalizeNormals = false;
	/** Inverts the R value (D3D9-style normal maps) */
	invertU = false;
	/** Flips the V texture coordinate. */
	flipY = false;
	isSky = false;
	/** Shadow materials show nothing but the shadow cast on them. */
	isShadow = false;
	receiveShadows = false;
	reflectivity = 0;
	/** Defines if the environment map is defined within a "Z-up" space. OpenGL normally uses a Y-up coordinate system, which is why this setting is necessary. */
	envMapZUp = true;
	/** Creates a more realistic reflection by making the object more reflective at its edges. */
	useFresnel = false;
	/** When set, the reflection ray is computed per-fragment and not per-vertex. */
	useAccurateReflectionRay = false;
	specularIntensity = 0;
	shininess = 30;
	/** If set, all incoming light will be saturated to at most 1.0 in each color channel. */
	saturateIncomingLight = true;
	visible = true;
	/** Materials with a lower render order will be rendered first. */
	renderOrder = 0;
	/** The factor by which to scale all secondary map (normal & specular) UV coordinates by. */
	secondaryMapUvFactor = 1;

	private hashCache: string = null;
	/** Gets the hash of the material. Two materials with the same configuration will have an identical hash. */
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
			this.invertU,
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
	/** Gets the #define chunk that needs to be prepended to both the vertex and fragment shaders to make the material work. */
	getDefineChunk() {
		if (this.defineChunkCache) return this.defineChunkCache;

		let defines: string[] = [];

		if (this.diffuseMap) defines.push('USE_DIFFUSE_MAP');
		if (this.envMap) defines.push('USE_ENV_MAP');
		if (this.normalMap) defines.push('USE_NORMAL_MAP');
		if (this.specularMap) defines.push('USE_SPECULAR_MAP');
		if (this.noiseMap) defines.push('USE_NOISE_MAP');
		if (this.emissive) defines.push('EMISSIVE');
		if (this.transparent) defines.push('TRANSPARENT');
		if (this.normalizeNormals) defines.push('NORMALIZE_NORMALS');
		if (this.invertU) defines.push('INVERT_U');
		if (this.flipY) defines.push('FLIP_Y');
		if (this.isSky) defines.push('IS_SKY');
		if (this.isShadow) defines.push('IS_SHADOW');
		if (this.receiveShadows) defines.push('RECEIVE_SHADOWS');
		if (this.envMapZUp) defines.push('ENV_MAP_Z_UP');
		if (this.useFresnel) defines.push('USE_FRESNEL');
		if (this.useAccurateReflectionRay) defines.push('USE_ACCURATE_REFLECTION_RAY');
		if (this.specularIntensity) defines.push('USE_SPECULAR');
		if (this.saturateIncomingLight) defines.push('SATURATE_INCOMING_LIGHT');
		if (this.blending === BlendingType.Normal) defines.push('USE_PREMULTIPLIED_ALPHA');

		return this.defineChunkCache = defines.map(x => `#define ${x}\n`).join('');
	}
}