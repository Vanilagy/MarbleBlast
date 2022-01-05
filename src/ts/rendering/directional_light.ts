import { Vector3 } from "../math/vector3";
import { Util } from "../util";
import { OrthographicCamera } from "./camera";
import { Renderer } from "./renderer";
import { Scene } from "./scene";

/** Represents a light source that casts light globally in a specific direction. Can cast shadows. */
export class DirectionalLight {
	renderer: Renderer;
	color: Vector3;
	direction: Vector3;
	camera: OrthographicCamera = null;
	depthTexture: WebGLTexture;
	colorTexture: WebGLTexture;
	depthFramebuffer: WebGLFramebuffer;
	textureResolution: number;

	constructor(renderer: Renderer, color: Vector3, direction: Vector3) {
		this.renderer = renderer;
		this.color = color;
		this.direction = direction;
	}

	/** Turns on shadow casting for this light and sets up the necessary textures and buffers. */
	enableShadowCasting(textureResolution: number, camera: OrthographicCamera) {
		Util.assert(Util.isPowerOf2(textureResolution)); // We never know 😓

		let { gl } = this.renderer;

		this.camera = camera;

		// Create the texture that will store the depth information
		let depthTexture = gl.createTexture();
		let depthComponent = (gl instanceof WebGLRenderingContext)? gl.DEPTH_COMPONENT : gl.DEPTH_COMPONENT32F;
		let type = (gl instanceof WebGLRenderingContext)? gl.UNSIGNED_INT : gl.FLOAT;
		gl.bindTexture(gl.TEXTURE_2D, depthTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, depthComponent, textureResolution, textureResolution, 0, gl.DEPTH_COMPONENT, type, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.depthTexture = depthTexture;

		// Create the framebuffer
		let depthFramebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
		this.depthFramebuffer = depthFramebuffer;

		// "For a bunch of reasons we also need to create a color texture and attach it as a color attachment even though we won't actually use it."
		let unusedTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, unusedTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureResolution, textureResolution, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		this.colorTexture = unusedTexture;

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, unusedTexture, 0);

		this.depthTexture = depthTexture;
		this.textureResolution = textureResolution;
	}

	/**
	 * Updates the position of the shadow camera.
	 * @param offset Specifies the offset in the direction of the light from `position`.
	 */
	updateCamera(position: Vector3, offset: number) {
		if (!this.camera) return;

		this.camera.position.copy(position.clone().addScaledVector(this.direction, offset));
		this.camera.lookAt(this.camera.position.clone().add(this.direction));
		this.camera.updateMatrixWorld();
	}

	/** Renders to the shadow map with all shadow casters from the given scene. */
	renderShadowMap(scene: Scene) {
		if (!this.camera) return;

		let { gl, shadowMapProgram } = this.renderer;

		gl.depthMask(true);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
		gl.viewport(0, 0, this.textureResolution, this.textureResolution);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		shadowMapProgram.use();
		shadowMapProgram.bindVertexBufferGroup(scene.bufferGroup);

		gl.uniformMatrix4fv(
			shadowMapProgram.getUniformLocation('viewMatrix'),
			false,
			new Float32Array(this.camera.matrixWorldInverse.elements)
		);
		gl.uniformMatrix4fv(
			shadowMapProgram.getUniformLocation('projectionMatrix'),
			false,
			new Float32Array(this.camera.projectionMatrix.elements)
		);
		gl.uniform1i(
			shadowMapProgram.getUniformLocation('meshInfoTextureWidth'),
			scene.meshInfoTextureWidth
		);
		gl.uniform1i(
			shadowMapProgram.getUniformLocation('meshInfoTextureHeight'),
			scene.meshInfoTextureHeight
		);

		gl.uniform1i(shadowMapProgram.getUniformLocation('meshInfos'), 7);
		this.renderer.bindTexture(scene.meshInfoTexture, 7, gl.TEXTURE_2D);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.shadowCasterIndexBuffer);
		gl.drawElements(gl.TRIANGLES, scene.shadowCasterIndices.length, gl.UNSIGNED_INT, 0); // A single draw call is enough
	}

	/** Binds the shadow map to texture unit 2. */
	bindShadowMap() {
		let { gl } = this.renderer;
		this.renderer.bindTexture(this.depthTexture, 2, gl.TEXTURE_2D);
	}

	dispose() {
		if (!this.camera) return;

		let { gl } = this.renderer;

		gl.deleteTexture(this.depthTexture);
		gl.deleteTexture(this.colorTexture);

		gl.deleteFramebuffer(this.depthFramebuffer);
	}
}