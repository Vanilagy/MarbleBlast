import { Scene } from "./scene";
import { Program } from './program';
import THREE from 'three';

export class Renderer {
	options: { canvas: HTMLCanvasElement };
	gl: WebGL2RenderingContext;
	currentProgram: Program = null;
	materialShaders = new Map<string, Program>();
	//defaultProgram: Program;
	//shadowMapProgram: Program;
	//lambertProgram: Program;
	width: number;
	height: number;

	extensions = {
		EXT_texture_filter_anisotropic: null as EXT_texture_filter_anisotropic,
		EXT_frag_depth: null as EXT_frag_depth,
		OES_element_index_uint: null as OES_element_index_uint,
		WEBGL_depth_texture: null as WEBGL_depth_texture,
		OES_standard_derivatives: null as OES_standard_derivatives
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
		
		//this.defaultProgram = new Program(this, defaultVert, defaultFrag);
		//this.shadowMapProgram = new Program(this, shadowMapVert, shadowMapFrag);
		//this.lambertProgram = new Program(this, lambertVert, lambertFrag);

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
		maxVertexUniformVectors -= 4; // Lights

		let quarter = Math.floor(maxVertexUniformVectors / 4);

		return {
			meshInfoVectors: 4 * quarter
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

		scene.update();
		//for (let light of scene.directionalLights) light.renderShadowMap(scene);

		gl.depthMask(true);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		/*
		this.lambertProgram.use();
		this.lambertProgram.bindBufferAttribute(scene.positionBuffer);
		this.lambertProgram.bindBufferAttribute(scene.normalBuffer);
		//this.defaultProgram.bindBufferAttribute(scene.tangentBuffer);
		this.lambertProgram.bindBufferAttribute(scene.uvBuffer);
		this.lambertProgram.bindBufferAttribute(scene.meshInfoIndexBuffer);
		//this.defaultProgram.bindBufferAttribute(scene.materialIndexBuffer);
		*/

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

		let seen = new WeakSet<Program>();
		for (let group of scene.materialGroups) {
			let program = this.materialShaders.get(group.defineChunk);
			if (seen.has(program)) continue;
			seen.add(program);

			program.use();
			program.bindBufferAttribute(scene.positionBuffer);
			program.bindBufferAttribute(scene.normalBuffer);
			//this.defaultProgram.bindBufferAttribute(scene.tangentBuffer);
			program.bindBufferAttribute(scene.uvBuffer);
			program.bindBufferAttribute(scene.meshInfoIndexBuffer);

			gl.uniformMatrix4fv(
				program.getUniformLocation('viewMatrix'),
				false,
				new Float32Array(camera.matrixWorldInverse.elements)
			);
			gl.uniformMatrix4fv(
				program.getUniformLocation('projectionMatrix'),
				false,
				new Float32Array(camera.projectionMatrix.elements)
			);
			gl.uniformMatrix4fv(
				program.getUniformLocation('inverseProjectionMatrix'),
				false,
				new Float32Array(new THREE.Matrix4().getInverse(camera.projectionMatrix).elements)
			);
			gl.uniform1f(
				program.getUniformLocation('logDepthBufFC'),
				2.0 / (Math.log(camera.far + 1.0) / Math.LN2)
			);
			gl.uniform3fv(
				program.getUniformLocation('eyePosition'),
				new Float32Array(camera.position.toArray())
			);

			gl.uniform3fv(program.getUniformLocation('ambientLight'), scene.ambientLightBuffer);
			gl.uniform3fv(program.getUniformLocation('directionalLightColor'), scene.directionalLightColorBuffer);
			gl.uniform3fv(program.getUniformLocation('directionalLightDirection'), scene.directionalLightDirectionBuffer);
			gl.uniform1i(program.getUniformLocation('directionalLightShadowMap'), 8);
			gl.uniformMatrix4fv(program.getUniformLocation('directionalLightTransform'), false, scene.directionalLightTransformBuffer);
		}

		/*
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
		*/

		/*
		gl.uniform3fv(this.lambertProgram.getUniformLocation('ambientLight'), scene.ambientLightBuffer);
		gl.uniform3fv(this.lambertProgram.getUniformLocation('directionalLightColor'), scene.directionalLightColorBuffer);
		gl.uniform3fv(this.lambertProgram.getUniformLocation('directionalLightDirection'), scene.directionalLightDirectionBuffer);
		gl.uniform1i(this.lambertProgram.getUniformLocation('directionalLightShadowMap'), 8);
		gl.uniformMatrix4fv(this.lambertProgram.getUniformLocation('directionalLightTransform'), false, scene.directionalLightTransformBuffer);
		*/

		gl.depthMask(true);

		for (let group of scene.materialGroups) {
			if (group.positions.length === 0) continue;

			let program = this.materialShaders.get(group.defineChunk);
			program.use();

			let meshInfoLoc = program.getUniformLocation('meshInfos');
			let diffuseMapLoc = program.getUniformLocation('diffuseMap');
			let envMapLoc = program.getUniformLocation('envMap');
			gl.uniform1i(diffuseMapLoc, 0);
			gl.uniform1i(envMapLoc, 1);

			if (group.material.diffuseMap) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, group.material.diffuseMap.glTexture);
			}
			if (group.material.envMap) {
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, group.material.envMap.glTexture);
			}

			for (let drawCall of group.drawCalls) {
				gl.uniformMatrix4fv(meshInfoLoc, false, drawCall.meshInfoGroup.buffer);
				
				gl.drawArrays(gl.TRIANGLES, group.offset + drawCall.start, drawCall.count);
			}
		}

		/*
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
		*/

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