import { MaterialGroup, Scene } from "./scene";
import { Program } from './program';
import shadowMapVert from './shaders/shadow_map_vert.glsl';
import shadowMapFrag from './shaders/shadow_map_frag.glsl';
import particleVert from './shaders/particle_vert.glsl';
import particleFrag from './shaders/particle_frag.glsl';
import { ParticleManager } from "../particles";
import { ResourceManager } from "../resources";
import { OrthographicCamera, PerspectiveCamera } from "./camera";

/** Wrapper around a framebuffer to bundle extra metadata with it. */
interface FramebufferInfo {
	framebuffer: WebGLFramebuffer;
	width: number;
	height: number;
	colorTexture: WebGLTexture;
}

export enum BlendingType {
	Normal,
	Additive,
	Subtractve
}

const DEFAULT_CONTEXT_OPTIONS = {
	alpha: false,
	desynchronized: false
};

/** The renderer is the central keeper of the WebGL rendering context and performs the actual rendering of a scene. */
export class Renderer {
	options: { canvas: HTMLCanvasElement };
	gl: WebGLRenderingContext | WebGL2RenderingContext;
	currentProgram: Program = null;
	/** Maps #define chunks, which uniquely identify a shader, to the program containing that shader. */
	materialShaders = new Map<string, Program>();
	shadowMapProgram: Program;
	particleProgram: Program;
	width: number;
	height: number;
	pixelRatio = 1;
	currentFramebuffer: FramebufferInfo = null;
	/** Stores the amount of draw calls in the current render. */
	drawCalls: number;
	debugMode = 0;
	/** When desynchronized is true, we render to an offscreen FBO and blit to the canvas to avoid flicker. */
	desynchronized: boolean;
	offscreenFbo: WebGLFramebuffer = null;
	offscreenColorTexture: WebGLTexture = null;
	offscreenDepthRenderbuffer: WebGLRenderbuffer = null;
	offscreenWidth = 0;
	offscreenHeight = 0;
	/** WebGL1 fallback blit resources. */
	blitProgram: { program: WebGLProgram, aPosition: number, uTexture: WebGLUniformLocation } = null;
	blitVbo: WebGLBuffer = null;

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
		options = { ...DEFAULT_CONTEXT_OPTIONS, ...options };

		console.log(options);

		this.options = options;
		this.desynchronized = options.desynchronized;
		let ctxOptions = {
			desynchronized: options.desynchronized, // This option can drastically reduce visual latency
			preserveDrawingBuffer: options.desynchronized, // Needed to avoid flicker with desynchronized canvases
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

		// Get all the extensions we need; many of these are enabled in WebGL2 by default:
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

		if (this.desynchronized) this.updateOffscreenFbo();
	}

	/** Creates or resizes the offscreen FBO used to avoid flicker with desynchronized canvases. */
	updateOffscreenFbo() {
		let { gl } = this;
		let w = Math.ceil(this.width * this.pixelRatio);
		let h = Math.ceil(this.height * this.pixelRatio);

		if (this.offscreenFbo && this.offscreenWidth === w && this.offscreenHeight === h) return;

		// Clean up old resources
		if (this.offscreenFbo) {
			gl.deleteFramebuffer(this.offscreenFbo);
			gl.deleteTexture(this.offscreenColorTexture);
			gl.deleteRenderbuffer(this.offscreenDepthRenderbuffer);
		}

		this.offscreenWidth = w;
		this.offscreenHeight = h;

		// Create color texture
		let colorTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, colorTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.offscreenColorTexture = colorTexture;

		// Create depth+stencil renderbuffer
		let depthRenderbuffer = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, w, h);
		this.offscreenDepthRenderbuffer = depthRenderbuffer;

		// Create and set up framebuffer
		let fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);
		this.offscreenFbo = fbo;

		// Restore default framebuffer
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/** Copies the offscreen FBO to the canvas. Call this once per frame after all render() calls. */
	present() {
		if (!this.desynchronized || !this.offscreenFbo) return;

		let { gl } = this;
		let w = this.offscreenWidth;
		let h = this.offscreenHeight;

		if (gl instanceof WebGL2RenderingContext) {
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.offscreenFbo);
			gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
			gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
		} else {
			// WebGL1 fallback: draw a fullscreen textured quad
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, w, h);

			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.BLEND);
			gl.disable(gl.CULL_FACE);

			if (!this.blitProgram) this.initBlitProgram();
			let prog = this.blitProgram;
			gl.useProgram(prog.program);
			this.currentProgram = null; // Invalidate cached program state

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.offscreenColorTexture);
			gl.uniform1i(prog.uTexture, 0);

			gl.bindBuffer(gl.ARRAY_BUFFER, this.blitVbo);
			gl.enableVertexAttribArray(prog.aPosition);
			gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 0, 0);

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			gl.disableVertexAttribArray(prog.aPosition);
			gl.enable(gl.DEPTH_TEST);
			gl.enable(gl.CULL_FACE);
		}
	}

	/** Creates a minimal shader program for blitting a texture to the screen (WebGL1 fallback). */
	initBlitProgram() {
		let { gl } = this;

		let vs = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vs, `attribute vec2 aPosition; varying vec2 vUv; void main() { vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }`);
		gl.compileShader(vs);

		let fs = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fs, `precision mediump float; varying vec2 vUv; uniform sampler2D uTexture; void main() { gl_FragColor = texture2D(uTexture, vUv); }`);
		gl.compileShader(fs);

		let program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);

		gl.deleteShader(vs);
		gl.deleteShader(fs);

		this.blitProgram = {
			program,
			aPosition: gl.getAttribLocation(program, 'aPosition'),
			uTexture: gl.getUniformLocation(program, 'uTexture')
		};

		// Fullscreen quad as triangle strip
		this.blitVbo = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.blitVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
	}

	setClearColor(r: number, g: number, b: number, a: number) {
		this.gl.clearColor(r, g, b, a);
	}

	/** Renders a scene to a framebuffer (or the canvas) from the perspective of a camera. */
	render(scene: Scene, camera: PerspectiveCamera | OrthographicCamera, framebuffer: FramebufferInfo = null, clearColorBuffer = true) {
		if (!scene.compiled) throw new Error("Scene not compiled! Can't render it.");
		if (!scene.preparedForRender) throw new Error("Scene not prepared for render! Can't render it.");

		let { gl } = this;
		this.drawCalls = 0;

		if (framebuffer) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
			gl.viewport(0, 0, framebuffer.width, framebuffer.height);
		} else if (this.desynchronized && this.offscreenFbo) {
			// Render to offscreen FBO instead of directly to the canvas to avoid flicker
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.offscreenFbo);
			gl.viewport(0, 0, this.offscreenWidth, this.offscreenHeight);
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
		let uInverseProjectionMatrix = new Float32Array(camera.projectionMatrix.clone().invert().elements);
		let uLogDepthBufFC = 2.0 / (Math.log(camera.far + 1.0) / Math.LN2); // Used for logarithmic depth buffer
		let uEyePosition = new Float32Array(camera.position.toArray());

		// Init the uniforms needed by all programs
		for (let defineChunk of scene.allDefineChunks) {
			let program = this.materialShaders.get(defineChunk);
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

			gl.uniform1i(program.getUniformLocation('debugMode'), Number(this.debugMode));
		}

		// First, we draw all opaque objects
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.opaqueIndexBuffer);
		gl.disable(gl.BLEND);
		this.renderMaterialGroups(scene, scene.opaqueMaterialGroups, scene.opaqueIndexBuffer, true);

		// Then, we draw all transparent objects
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.transparentIndexBuffer);
		gl.enable(gl.BLEND);
		this.renderMaterialGroups(scene, scene.transparentMaterialGroups, scene.transparentIndexBuffer, false);

		// Lastly, we render particles
		if (scene.particleManager) this.renderParticles(scene.particleManager, camera);
	}

	renderMaterialGroups(scene: Scene, groups: MaterialGroup[], indexBuffer: WebGLBuffer, skipTransparent: boolean) {
		let { gl } = this;

		for (let group of groups) {
			if (group.indexGroups.length === 0 || group.indexGroups[0].indices.length === 0) continue; // No need to waste gl calls on an empty material group

			let material = group.material;
			if (!material.visible) continue;

			let program = this.materialShaders.get(group.defineChunk);
			program.use();
			program.bindVertexBufferGroup(scene.bufferGroup); // Bind the VAO, this will automatically set up all vertex attribute pointers

			// Set uniforms related to the material
			gl.uniform1i(program.getUniformLocation('skipTransparent'), Number(skipTransparent));
			gl.uniform1f(program.getUniformLocation('materialOpacity'), material.opacity);
			gl.uniform1f(program.getUniformLocation('specularIntensity'), material.specularIntensity);
			gl.uniform1f(program.getUniformLocation('shininess'), material.shininess);
			gl.uniform1f(program.getUniformLocation('reflectivity'), material.reflectivity);
			gl.uniform1f(program.getUniformLocation('secondaryMapUvFactor'), material.secondaryMapUvFactor);

			if (material.blending === BlendingType.Normal) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // Premultiplied alpha
			else if (material.blending === BlendingType.Additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			else if (material.blending === BlendingType.Subtractve) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // I actually dunno if this one's correct

			gl.depthMask(material.depthWrite);

			// Bind all textures
			if (material.receiveShadows || material.isShadow) scene.directionalLights[0]?.bindShadowMap(); // Will bind to texture unit 2
			this.bindTexture(material.diffuseMap?.getGLTexture(this), 0, gl.TEXTURE_2D);
			this.bindTexture(material.envMap?.glTexture, 1, gl.TEXTURE_CUBE_MAP);
			this.bindTexture(material.normalMap?.getGLTexture(this), 3, gl.TEXTURE_2D);
			this.bindTexture(material.specularMap?.getGLTexture(this), 4, gl.TEXTURE_2D);
			this.bindTexture(material.noiseMap?.getGLTexture(this), 5, gl.TEXTURE_2D);

			// And now, draw all objects with this material in a single draw call :)
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			gl.drawElements(gl.TRIANGLES, group.count, gl.UNSIGNED_INT, group.offset * Uint32Array.BYTES_PER_ELEMENT);
			this.drawCalls++;
		}
	}

	renderParticles(particleManager: ParticleManager, camera: PerspectiveCamera | OrthographicCamera) {
		let { gl } = this;

		let program = this.particleProgram;
		program.use();
		program.bindVertexBufferGroup(particleManager.bufferGroup);

		// Set up the uniforms we need
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
		gl.uniform1f(program.getUniformLocation('time'), particleManager.currentRenderTime); // Since the particle is simulated in-shader, the shader needs to know the current simulation time

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, particleManager.indexBuffer);

		gl.depthMask(false);
		gl.enable(gl.BLEND);

		// Now draw all particle groups
		for (let [options, group] of particleManager.particleGroups) {
			if (group.particles.length === 0) continue;

			let diffuseMap = ResourceManager.getTextureFromCache(options.texture);
			this.bindTexture(diffuseMap.getGLTexture(this), 0, gl.TEXTURE_2D);

			if (options.blending === BlendingType.Normal) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // No premultiplied alpha
			else if (options.blending === BlendingType.Additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			else if (options.blending === BlendingType.Subtractve) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

			// Bind uniforms describing the particle simulation
			gl.uniform1f(program.getUniformLocation('acceleration'), group.uniforms.acceleration);
			gl.uniform1f(program.getUniformLocation('spinSpeed'), group.uniforms.spinSpeed);
			gl.uniform1f(program.getUniformLocation('dragCoefficient'), group.uniforms.dragCoefficient);
			gl.uniform4fv(program.getUniformLocation('times'), group.uniforms.times);
			gl.uniform4fv(program.getUniformLocation('sizes'), group.uniforms.sizes);
			gl.uniformMatrix4fv(program.getUniformLocation('colors'), false, group.uniforms.colors);

			program.bindVertexBuffer(group.vertexBuffer);
			gl.drawElements(gl.TRIANGLES, 6 * group.particles.length, gl.UNSIGNED_INT, 0);
			this.drawCalls++;
		}
	}

	/** Binds a texture to a specific texture unit and texture target. If the texture doesn't exist, it unbinds the texture from the unit. */
	bindTexture(texture: WebGLTexture, unit: number, target: number) {
		let { gl } = this;

		gl.activeTexture(gl.TEXTURE0 + unit);
		if (this.currentFramebuffer?.colorTexture === texture || !texture) gl.bindTexture(target, null);
		else gl.bindTexture(target, texture);
	}

	/** Wrapper around createVertexArray[OES]. */
	createVertexArray(): WebGLVertexArrayObject {
		let { gl } = this;
		let ext = this.extensions.OES_vertex_array_object;

		return (gl instanceof WebGLRenderingContext)? ext.createVertexArrayOES() : gl.createVertexArray();
	}

	/** Wrapper around bindVertexArray[OES]. */
	bindVertexArray(vao: WebGLVertexArrayObject) {
		let { gl } = this;
		let ext = this.extensions.OES_vertex_array_object;

		if (gl instanceof WebGLRenderingContext) ext.bindVertexArrayOES(vao); else gl.bindVertexArray(vao);
	}

	/** Wrapper around deleteVertexArray[OES]. */
	deleteVertexArray(vao: WebGLVertexArrayObject) {
		let { gl } = this;
		let ext = this.extensions.OES_vertex_array_object;

		if (gl instanceof WebGLRenderingContext) ext.deleteVertexArrayOES(vao); else gl.deleteVertexArray(vao);
	}

	cleanUp() {
		for (let [, program] of this.materialShaders) program.cleanUp();

		let { gl } = this;
		if (this.offscreenFbo) {
			gl.deleteFramebuffer(this.offscreenFbo);
			gl.deleteTexture(this.offscreenColorTexture);
			gl.deleteRenderbuffer(this.offscreenDepthRenderbuffer);
			this.offscreenFbo = null;
		}
		if (this.blitProgram) {
			gl.deleteProgram(this.blitProgram.program);
			gl.deleteBuffer(this.blitVbo);
			this.blitProgram = null;
		}
	}
}