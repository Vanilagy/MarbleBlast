import { MaterialGroup, Scene } from "./scene";
import { Program } from './program';
import THREE from 'three';
import shadowMapVert from './shaders/shadow_map_vert.glsl';
import shadowMapFrag from './shaders/shadow_map_frag.glsl';
import particleVert from './shaders/particle_vert.glsl';
import particleFrag from './shaders/particle_frag.glsl';
import { ParticleManager } from "../particles";
import { ResourceManager } from "../resources";

interface FramebufferInfo {
	framebuffer: WebGLFramebuffer;
	width: number;
	height: number;
	colorTexture: WebGLTexture;
}

const DEFAULT_OPTIONS = {
	alpha: false,
	desynchronized: true
};

export class Renderer {
	options: { canvas: HTMLCanvasElement };
	gl: WebGLRenderingContext | WebGL2RenderingContext;
	currentProgram: Program = null;
	materialShaders = new Map<string, Program>();
	shadowMapProgram: Program;
	particleProgram: Program;
	width: number;
	height: number;
	pixelRatio = 1;
	currentFramebuffer: FramebufferInfo = null;

	extensions = {
		EXT_texture_filter_anisotropic: null as EXT_texture_filter_anisotropic,
		EXT_frag_depth: null as EXT_frag_depth,
		OES_element_index_uint: null as OES_element_index_uint,
		WEBGL_depth_texture: null as WEBGL_depth_texture,
		OES_standard_derivatives: null as OES_standard_derivatives,
		KHR_parallel_shader_compile: null as KHR_parallel_shader_compile,
		OES_texture_float: null as OES_texture_float,
		OES_vertex_array_object: null as OES_vertex_array_object
	};

	constructor(options: {
		canvas: HTMLCanvasElement,
		alpha?: boolean,
		desynchronized?: boolean
	}) {
		options = { ...DEFAULT_OPTIONS, ...options };

		this.options = options;
		let ctxOptions = {
			desynchronized: options.desynchronized,
			depth: true,
			stencil: true, // Maybe this will get us a 24-bit depth buffer
			antialias: false,
			powerPreference: 'high-performance',
			alpha: options.alpha,
			premultipliedAlpha: true
		};
		this.gl = options.canvas.getContext('webgl2', ctxOptions) as WebGL2RenderingContext;
		if (!this.gl) this.gl = options.canvas.getContext('webgl', ctxOptions) as WebGLRenderingContext;

		let { gl } = this;

		// Many of these are enabled in WebGL2 by default:
		this.extensions.EXT_texture_filter_anisotropic =
			gl.getExtension('EXT_texture_filter_anisotropic') ||
			gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
			gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
		this.extensions.EXT_frag_depth = gl.getExtension('EXT_frag_depth');
		this.extensions.OES_element_index_uint = gl.getExtension('OES_element_index_uint');
		this.extensions.WEBGL_depth_texture = gl.getExtension('WEBGL_depth_texture');
		this.extensions.OES_standard_derivatives = gl.getExtension('OES_standard_derivatives');
		this.extensions.KHR_parallel_shader_compile = gl.getExtension('KHR_parallel_shader_compile');
		this.extensions.OES_texture_float = gl.getExtension('OES_texture_float');
		this.extensions.OES_vertex_array_object = gl.getExtension('OES_vertex_array_object');
		
		this.shadowMapProgram = new Program(this, shadowMapVert, shadowMapFrag);
		this.particleProgram = new Program(this, particleVert, particleFrag);

		gl.clearColor(0.0, 0.0, 0.0, Number(!options.alpha));
		gl.clearDepth(1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);
		gl.frontFace(gl.CCW);
	}
	
	setSize(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.updateCanvasDimensions();
	}

	setPixelRatio(pixelRatio: number) {
		this.pixelRatio = pixelRatio;
		this.updateCanvasDimensions();
	}

	updateCanvasDimensions() {
		this.options.canvas.setAttribute('width', Math.ceil(this.width * this.pixelRatio).toString());
		this.options.canvas.setAttribute('height', Math.ceil(this.height * this.pixelRatio).toString());
	}

	setClearColor(r: number, g: number, b: number, a: number) {
		this.gl.clearColor(r, g, b, a);
	}

	render(scene: Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, framebuffer: FramebufferInfo = null, clearColorBuffer = true) {
		if (!scene.compiled) throw new Error("Scene not compiled! Can't render it.");
		if (!scene.preparedForRender) throw new Error("Scene not prepared for render! Can't render it.");

		let { gl } = this;		

		if (framebuffer) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
			gl.viewport(0, 0, framebuffer.width, framebuffer.height);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, Math.ceil(this.width * this.pixelRatio), Math.ceil(this.height * this.pixelRatio));
		}
		this.currentFramebuffer = framebuffer;

		gl.depthMask(true);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		if (clearColorBuffer) gl.clear(gl.COLOR_BUFFER_BIT);

		// Precompute some uniform values
		let uViewMatrix = new Float32Array(camera.matrixWorldInverse.elements);
		let uProjectionMatrix = new Float32Array(camera.projectionMatrix.elements);
		let uInverseProjectionMatrix = new Float32Array(new THREE.Matrix4().getInverse(camera.projectionMatrix).elements);
		let uLogDepthBufFC = 2.0 / (Math.log(camera.far + 1.0) / Math.LN2);
		let uEyePosition = new Float32Array(camera.position.toArray());

		for (let [, program] of this.materialShaders) {
			program.use();

			gl.uniformMatrix4fv(
				program.getUniformLocation('viewMatrix'),
				false,
				uViewMatrix
			);
			gl.uniformMatrix4fv(
				program.getUniformLocation('projectionMatrix'),
				false,
				uProjectionMatrix
			);
			gl.uniformMatrix4fv(
				program.getUniformLocation('inverseProjectionMatrix'),
				false,
				uInverseProjectionMatrix
			);
			gl.uniform1f(
				program.getUniformLocation('logDepthBufFC'),
				uLogDepthBufFC
			);
			gl.uniform3fv(
				program.getUniformLocation('eyePosition'),
				uEyePosition
			);
			gl.uniform1i(
				program.getUniformLocation('meshInfoTextureWidth'),
				scene.meshInfoTextureWidth
			);
			gl.uniform1i(
				program.getUniformLocation('meshInfoTextureHeight'),
				scene.meshInfoTextureHeight
			);

			gl.uniform3fv(program.getUniformLocation('ambientLight'), scene.ambientLightBuffer);
			gl.uniform3fv(program.getUniformLocation('directionalLightColor'), scene.directionalLightColorBuffer);
			gl.uniform3fv(program.getUniformLocation('directionalLightDirection'), scene.directionalLightDirectionBuffer);
			gl.uniformMatrix4fv(program.getUniformLocation('directionalLightTransform'), false, scene.directionalLightTransformBuffer);

			gl.uniform1i(program.getUniformLocation('meshInfos'), 7);
			this.bindTexture(scene.meshInfoTexture, 7, gl.TEXTURE_2D);

			gl.uniform1i(program.getUniformLocation('diffuseMap'), 0);
			gl.uniform1i(program.getUniformLocation('envMap'), 1);
			gl.uniform1i(program.getUniformLocation('directionalLightShadowMap'), 2);
			gl.uniform1i(program.getUniformLocation('normalMap'), 3);
			gl.uniform1i(program.getUniformLocation('specularMap'), 4);
			gl.uniform1i(program.getUniformLocation('noiseMap'), 5);
		}

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.opaqueIndexBuffer);
		gl.disable(gl.BLEND);
		this.renderMaterialGroups(scene, scene.opaqueMaterialGroups, scene.opaqueIndexBuffer, true);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.transparentIndexBuffer);
		gl.enable(gl.BLEND);
		this.renderMaterialGroups(scene, scene.transparentMaterialGroups, scene.transparentIndexBuffer, false);

		if (scene.particleManager) this.renderParticles(scene.particleManager, camera);
	}

	renderMaterialGroups(scene: Scene, groups: MaterialGroup[], indexBuffer: WebGLBuffer, skipTransparent: boolean) {
		let { gl } = this;

		for (let group of groups) {
			if (group.indexGroups.length === 0 || group.indexGroups[0].indices.length === 0) continue;

			let material = group.material;
			if (!material.visible) continue;

			let program = this.materialShaders.get(group.defineChunk);
			program.use();
			program.bindVertexBufferGroup(scene.bufferGroup);

			gl.uniform1i(program.getUniformLocation('skipTransparent'), Number(skipTransparent));
			gl.uniform1f(program.getUniformLocation('specularIntensity'), material.specularIntensity);
			gl.uniform1f(program.getUniformLocation('shininess'), material.shininess);
			gl.uniform1f(program.getUniformLocation('reflectivity'), material.reflectivity);
			gl.uniform1f(program.getUniformLocation('secondaryMapUvFactor'), material.secondaryMapUvFactor);
			
			if (material.blending === THREE.NormalBlending) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // Premultiplied alpha
			else if (material.blending === THREE.AdditiveBlending) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			else if (material.blending === THREE.SubtractiveBlending) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // I actually dunno if this one's correct

			gl.depthMask(material.depthWrite);

			if (material.receiveShadows || material.isShadow) scene.directionalLights[0]?.bindShadowMap();
			this.bindTexture(material.diffuseMap?.getGLTexture(this), 0, gl.TEXTURE_2D);
			this.bindTexture(material.envMap?.glTexture, 1, gl.TEXTURE_CUBE_MAP);
			this.bindTexture(material.normalMap?.getGLTexture(this), 3, gl.TEXTURE_2D);
			this.bindTexture(material.specularMap?.getGLTexture(this), 4, gl.TEXTURE_2D);
			this.bindTexture(material.noiseMap?.getGLTexture(this), 5, gl.TEXTURE_2D);

			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			gl.drawElements(gl.TRIANGLES, group.count, gl.UNSIGNED_INT, group.offset * Uint32Array.BYTES_PER_ELEMENT);
		}
	}

	renderParticles(particleManager: ParticleManager, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
		let { gl } = this;

		let program = this.particleProgram;
		program.use();
		program.bindVertexBufferGroup(particleManager.bufferGroup);

		let uViewMatrix = new Float32Array(camera.matrixWorldInverse.elements);
		let uProjectionMatrix = new Float32Array(camera.projectionMatrix.elements);
		let uLogDepthBufFC = 2.0 / (Math.log(camera.far + 1.0) / Math.LN2);
		
		gl.uniformMatrix4fv(
			program.getUniformLocation('viewMatrix'),
			false,
			uViewMatrix
		);
		gl.uniformMatrix4fv(
			program.getUniformLocation('projectionMatrix'),
			false,
			uProjectionMatrix
		);
		gl.uniform1f(
			program.getUniformLocation('logDepthBufFC'),
			uLogDepthBufFC
		);
		gl.uniform1i(program.getUniformLocation('diffuseMap'), 0);
		gl.uniform1f(program.getUniformLocation('time'), particleManager.getTime());

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, particleManager.indexBuffer);

		gl.depthMask(false);
		gl.enable(gl.BLEND);

		for (let [options, group] of particleManager.particleGroups) {
			if (group.particles.length === 0) continue;

			let diffuseMap = ResourceManager.getTextureFromCache(options.texture);
			this.bindTexture(diffuseMap.getGLTexture(this), 0, gl.TEXTURE_2D);

			if (options.blending === THREE.NormalBlending) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // No premultiplied alpha
			else if (options.blending === THREE.AdditiveBlending) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			else if (options.blending === THREE.SubtractiveBlending) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

			gl.uniform1f(program.getUniformLocation('acceleration'), group.uniforms.acceleration);
			gl.uniform1f(program.getUniformLocation('spinSpeed'), group.uniforms.spinSpeed);
			gl.uniform1f(program.getUniformLocation('dragCoefficient'), group.uniforms.dragCoefficient);
			gl.uniform4fv(program.getUniformLocation('times'), group.uniforms.times);
			gl.uniform4fv(program.getUniformLocation('sizes'), group.uniforms.sizes);
			gl.uniformMatrix4fv(program.getUniformLocation('colors'), false, group.uniforms.colors);

			program.bindVertexBuffer(group.vertexBuffer);
			gl.drawElements(gl.TRIANGLES, 6 * group.particles.length, gl.UNSIGNED_INT, 0);
		}
	}

	bindTexture(texture: WebGLTexture, unit: number, target: number) {
		let { gl } = this;

		gl.activeTexture(gl.TEXTURE0 + unit);
		if (this.currentFramebuffer?.colorTexture === texture || !texture) gl.bindTexture(target, null);
		else gl.bindTexture(target, texture);
	}

	createVertexArray(): WebGLVertexArrayObject {
		let { gl } = this;
		let ext = this.extensions.OES_vertex_array_object;

		return (gl instanceof WebGLRenderingContext)? ext.createVertexArrayOES() : gl.createVertexArray();
	}

	bindVertexArray(vao: WebGLVertexArrayObject) {
		let { gl } = this;
		let ext = this.extensions.OES_vertex_array_object;

		if (gl instanceof WebGLRenderingContext) ext.bindVertexArrayOES(vao); else gl.bindVertexArray(vao);
	}

	deleteVertexArray(vao: WebGLVertexArrayObject) {
		let { gl } = this;
		let ext = this.extensions.OES_vertex_array_object;

		if (gl instanceof WebGLRenderingContext) ext.deleteVertexArrayOES(vao); else gl.deleteVertexArray(vao);
	}

	cleanUp() {
		for (let [, program] of this.materialShaders) program.dispose();
	}
}