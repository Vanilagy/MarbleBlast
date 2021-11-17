import THREE from "three";
import { Renderer } from "./renderer";
import { CUBE_MAPS_PER_DRAW_CALL, Scene } from "./scene";

export class DirectionalLight {
	renderer: Renderer;
	color: THREE.Color;
	direction: THREE.Vector3;
	camera: THREE.OrthographicCamera = null;
	depthTexture: WebGLTexture;
	depthFramebuffer: WebGLFramebuffer;
	textureResolution: number;

	constructor(renderer: Renderer, color: THREE.Color, direction: THREE.Vector3) {
		this.renderer = renderer;
		this.color = color;
		this.direction = direction;
	}

	enableShadowCasting(textureResolution: number, camera: THREE.OrthographicCamera) {
		let { gl } = this.renderer;

		this.camera = camera;

		let depthTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, depthTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F ?? gl.DEPTH_COMPONENT, textureResolution, textureResolution, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.depthTexture = depthTexture;

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

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, unusedTexture, 0);

		this.depthTexture = depthTexture;
		this.textureResolution = textureResolution;
	}

	updateCamera(position: THREE.Vector3, offset: number) {
		if (!this.camera) return;

		this.camera.position.copy(position.clone().addScaledVector(this.direction, offset));
		this.camera.lookAt(this.camera.position.clone().add(this.direction));
		this.camera.updateMatrixWorld();
	}

	renderShadowMap(scene: Scene) {
		if (!this.camera) return;

		let { gl, shadowMapProgram } = this.renderer;

		gl.depthMask(true);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFramebuffer);
		gl.viewport(0, 0, this.textureResolution, this.textureResolution);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		shadowMapProgram.use();
		shadowMapProgram.bindBufferAttribute(scene.positionBuffer);
		shadowMapProgram.bindBufferAttribute(scene.normalBuffer);
		shadowMapProgram.bindBufferAttribute(scene.tangentBuffer);
		shadowMapProgram.bindBufferAttribute(scene.uvBuffer);
		shadowMapProgram.bindBufferAttribute(scene.meshInfoIndexBuffer);
		shadowMapProgram.bindBufferAttribute(scene.materialIndexBuffer);

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

		let meshInfoLoc = shadowMapProgram.getUniformLocation('meshInfos');
		let currentStart = 0;

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.shadowCasterIndexBuffer);
		for (let i = 0; i < scene.shadowCasterIndices.length; i++) {
			let index = scene.shadowCasterIndices[i];
			let nextIndex = scene.shadowCasterIndices[i+1];
			let drawCall = scene.drawCalls[scene.indexToDrawCall[index]];
			let nextDrawCall = scene.drawCalls[scene.indexToDrawCall[nextIndex]];

			if (drawCall === nextDrawCall) continue;

			gl.uniformMatrix4fv(meshInfoLoc, false, drawCall.meshInfoBuffer);

			gl.drawElements(gl.TRIANGLES, i - currentStart + 1, gl.UNSIGNED_INT, currentStart);
			currentStart = i + 1;
		}
	}

	bindShadowMap(lightIndex: number) {
		if (!this.depthTexture) return;

		let { gl } = this.renderer;

		const shadowMapStartIndex = 1 + CUBE_MAPS_PER_DRAW_CALL;
		gl.activeTexture((gl as any)['TEXTURE' + (shadowMapStartIndex + lightIndex)]);
		gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
	}
}