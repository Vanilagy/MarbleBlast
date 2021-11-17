import defaultVert from './shaders/default_vert.glsl';
import defaultFrag from './shaders/default_frag.glsl';
import shadowMapVert from './shaders/shadow_map_vert.glsl';
import shadowMapFrag from './shaders/shadow_map_frag.glsl';
import { CUBE_MAPS_PER_DRAW_CALL, DIRECTIONAL_LIGHT_COUNT, Scene } from "./scene";
import { Program } from './program';
import THREE from 'three';

let query;

export class Renderer {
	options: { canvas: HTMLCanvasElement };
	gl: WebGL2RenderingContext;
	currentProgram: Program = null;
	defaultProgram: Program;
	shadowMapProgram: Program;
	width: number;
	height: number;

	extensions = {
		EXT_texture_filter_anisotropic: null as EXT_texture_filter_anisotropic,
		EXT_frag_depth: null as EXT_frag_depth,
		OES_element_index_uint: null as OES_element_index_uint,
		WEBGL_depth_texture: null as WEBGL_depth_texture,
		OES_standard_derivatives: null as OES_standard_derivatives,
		EXT_disjoint_timer_query_webgl2: null as EXT_disjoint_timer_query_webgl2
	};

	constructor(options: { canvas: HTMLCanvasElement }) {
		this.options = options;
		this.gl = options.canvas.getContext('webgl2', {
			desynchronized: true,
			depth: true,
			stencil: true, // Maybe this will get us a 24-bit depth buffer
			antialias: false,
			powerPreference: 'high-performance'
		});
		if (!this.gl) this.gl = options.canvas.getContext('webgl') as any;

		let { gl } = this;

		this.extensions.EXT_texture_filter_anisotropic =
			gl.getExtension('EXT_texture_filter_anisotropic') ||
			gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
			gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
		this.extensions.EXT_frag_depth = gl.getExtension('EXT_frag_depth'); // Enabled in WebGL2 by default
		this.extensions.OES_element_index_uint = gl.getExtension('OES_element_index_uint');
		this.extensions.WEBGL_depth_texture = gl.getExtension('WEBGL_depth_texture');
		this.extensions.OES_standard_derivatives = gl.getExtension('OES_standard_derivatives');
		this.extensions.EXT_disjoint_timer_query_webgl2 = gl.getExtension('EXT_disjoint_timer_query_webgl2');

		console.log(this.extensions.EXT_disjoint_timer_query_webgl2) 
		
		this.defaultProgram = new Program(this, defaultVert, defaultFrag);
		this.shadowMapProgram = new Program(this, shadowMapVert, shadowMapFrag);

		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clearDepth(1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);
		gl.frontFace(gl.CCW);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}

	getUniformsCounts() {
		let { gl } = this;
		let maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number;
		maxVertexUniformVectors -= 14; // Taken up by other uniforms
		maxVertexUniformVectors -= 4 * DIRECTIONAL_LIGHT_COUNT;

		let fifth = Math.floor(maxVertexUniformVectors / 5);

		return {
			transformVectors: 4 * fifth,
			materialVectors: 1 * fifth
		};
	}

	setSize(width: number, height: number) {
		this.width = width;
		this.height = height;

		this.options.canvas.setAttribute('width', width.toString());
		this.options.canvas.setAttribute('height', height.toString());
	}

	render(scene: Scene, camera: THREE.PerspectiveCamera) {
		let { gl } = this;

		let ext = this.extensions.EXT_disjoint_timer_query_webgl2;

		
		const available = query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
		if (available) {
			const elapsedNanos = gl.getQueryParameter(query, gl.QUERY_RESULT);
			console.log(elapsedNanos / 1000 / 1000); // in millis
		}

		if (available || !query) {
			query = gl.createQuery();
			gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
		}
		

		scene.update();
		for (let light of scene.directionalLights) light.renderShadowMap(scene);

		gl.depthMask(true);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		this.defaultProgram.use();
		this.defaultProgram.bindBufferAttribute(scene.positionBuffer);
		this.defaultProgram.bindBufferAttribute(scene.normalBuffer);
		this.defaultProgram.bindBufferAttribute(scene.tangentBuffer);
		this.defaultProgram.bindBufferAttribute(scene.uvBuffer);
		this.defaultProgram.bindBufferAttribute(scene.meshInfoIndexBuffer);
		this.defaultProgram.bindBufferAttribute(scene.materialIndexBuffer);

		let transparentTris: number[] = [];
		let transparentTriDistances = new Map<number, number>();
		let tempVec = new THREE.Vector3();
		/*
		for (let i = 0; i < scene.materialIndexBuffer.data.length; i += 3) {
			let drawCall = scene.drawCalls[scene.indexToDrawCall[i]];
			let material = drawCall.materials[scene.materialIndexBuffer.data[i]];
			let mesh = drawCall.meshes[scene.meshInfoIndexBuffer.data[i]];

			if (material.transparent || (mesh.opacity > 0 && mesh.opacity < 1)) {
				transparentTris.push(i);
				let transform = mesh.worldTransform;
				tempVec.set(scene.positionBuffer.data[3*i + 0], scene.positionBuffer.data[3*i + 1], scene.positionBuffer.data[3*i + 2]);
				tempVec.applyMatrix4(transform);
				transparentTriDistances.set(i, tempVec.distanceToSquared(camera.position));
			}
		}
		transparentTris.sort((a, b) => {
			return transparentTriDistances.get(b) - transparentTriDistances.get(a);
		});
		for (let i = 0; i < transparentTris.length; i++) {
			scene.indexBufferData[3*i + 0] = transparentTris[i] + 0;
			scene.indexBufferData[3*i + 1] = transparentTris[i] + 1;
			scene.indexBufferData[3*i + 2] = transparentTris[i] + 2;
		}
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.indexBuffer);
		gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, scene.indexBufferData, 0, transparentTris.length * 3);
		*/

		gl.uniformMatrix4fv(
			this.defaultProgram.getUniformLocation('viewMatrix'),
			false,
			new Float32Array(camera.matrixWorldInverse.elements)
		);
		gl.uniformMatrix4fv(
			this.defaultProgram.getUniformLocation('projectionMatrix'),
			false,
			new Float32Array(camera.projectionMatrix.elements)
		);
		gl.uniformMatrix4fv(
			this.defaultProgram.getUniformLocation('inverseProjectionMatrix'),
			false,
			new Float32Array(new THREE.Matrix4().getInverse(camera.projectionMatrix).elements)
		);
		gl.uniform1f(
			this.defaultProgram.getUniformLocation('logDepthBufFC'),
			2.0 / (Math.log(camera.far + 1.0) / Math.LN2)
		);
		gl.uniform3fv(
			this.defaultProgram.getUniformLocation('eyePosition'),
			new Float32Array(camera.position.toArray())
		);

		let meshInfoLoc = this.defaultProgram.getUniformLocation('meshInfos');
		let materialsLoc = this.defaultProgram.getUniformLocation('materials');
		let texturesLoc = this.defaultProgram.getUniformLocation('textures');
		let cubeTexturesLoc = this.defaultProgram.getUniformLocation('cubeTextures');
		gl.uniform1i(texturesLoc, 0);
		gl.uniform1iv(cubeTexturesLoc, new Uint32Array(new Array(CUBE_MAPS_PER_DRAW_CALL).fill(null).map((_, i) => 1 + i)));

		gl.uniform3fv(this.defaultProgram.getUniformLocation('ambientLight'), scene.ambientLightBuffer);
		gl.uniform3fv(this.defaultProgram.getUniformLocation('directionalLightColor'), scene.directionalLightColorBuffer);
		gl.uniform3fv(this.defaultProgram.getUniformLocation('directionalLightDirection'), scene.directionalLightDirectionBuffer);
		gl.uniform1iv(this.defaultProgram.getUniformLocation('directionalLightShadowMap'), scene.directionalLightShadowMapBuffer);
		gl.uniformMatrix4fv(this.defaultProgram.getUniformLocation('directionalLightTransform'), false, scene.directionalLightTransformBuffer);
		for (let [i, light] of scene.directionalLights.entries()) light.bindShadowMap(i);

		gl.uniform1i(this.defaultProgram.getUniformLocation('skipTransparent'), 1);
		gl.depthMask(true);
		for (let drawCall of scene.drawCalls) {
			for (let i = 0; i < drawCall.cubeTextures.length; i++) {
				let tex = drawCall.cubeTextures[i];
				gl.activeTexture((gl as any)['TEXTURE' + (i+1)]);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex.glTexture);
			}

			gl.uniformMatrix4fv(meshInfoLoc, false, drawCall.meshInfoBuffer);
			gl.uniform4uiv(materialsLoc, drawCall.materialsBuffer);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, scene.textures[drawCall.textureId]);

			gl.drawArrays(gl.TRIANGLES, drawCall.start, drawCall.count);
		}

		gl.endQuery(ext.TIME_ELAPSED_EXT);

		return;

		gl.uniform1i(this.defaultProgram.getUniformLocation('skipTransparent'), 0);
		//gl.depthMask(false);

		let currentStart = 0;
		for (let i = 0; i < transparentTris.length; i++) {
			let index = transparentTris[i];
			let nextIndex = transparentTris[i+1];
			let drawCall = scene.drawCalls[scene.indexToDrawCall[index]];
			let nextDrawCall = scene.drawCalls[scene.indexToDrawCall[nextIndex]];

			if (drawCall === nextDrawCall) continue;

			for (let i = 0; i < drawCall.cubeTextures.length; i++) {
				let tex = drawCall.cubeTextures[i];
				gl.activeTexture((gl as any)['TEXTURE' + (i+1)]);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex.glTexture);
			}

			gl.uniformMatrix4fv(meshInfoLoc, false, drawCall.meshInfoBuffer);
			gl.uniform4uiv(materialsLoc, drawCall.materialsBuffer);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, scene.textures[drawCall.textureId]);

			gl.drawElements(gl.TRIANGLES, (i - currentStart + 1) * 3, gl.UNSIGNED_INT, currentStart);

			currentStart = i + 1;
		}
	}
}