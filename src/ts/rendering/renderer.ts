import VERTEX_SHADER from './shaders/default_vert.glsl';
import FRAGMENT_SHADER from './shaders/default_frag.glsl';
import { DrawCall, Scene } from "./scene";
import { Camera } from "./camera";
import { Program } from './program';
import THREE from 'three';
import { Mesh } from './mesh';

export class Renderer {
	options: { canvas: HTMLCanvasElement };
	gl: WebGL2RenderingContext;
	defaultProgram: Program;

	extensions = {
		EXT_texture_filter_anisotropic: null as any,
		EXT_frag_depth: null as any,
		OES_element_index_uint: null as any
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
		
		let defaultVert = VERTEX_SHADER;
		let defaultFrag = FRAGMENT_SHADER;
		let uniformCounts = this.getUniformsCounts();

		defaultVert = defaultVert.replace('#include <definitions>', `
			#define TRANSFORM_COUNT ${uniformCounts.transformVectors / 4}
			#define MATERIAL_COUNT ${uniformCounts.materialVectors}
		`);
		defaultFrag = defaultFrag.replace('#include <definitions>', `
			#define TRANSFORM_COUNT ${uniformCounts.transformVectors / 4}
			#define MATERIAL_COUNT ${uniformCounts.materialVectors}
		`);
		this.defaultProgram = new Program(this, defaultVert, defaultFrag);

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
		maxVertexUniformVectors -= 13; // Taken up by other uniforms

		let fifth = Math.floor(maxVertexUniformVectors / 5);

		return {
			transformVectors: 4 * fifth,
			materialVectors: 1 * fifth
		};
	}

	setSize(width: number, height: number) {
		this.options.canvas.setAttribute('width', width.toString());
		this.options.canvas.setAttribute('height', height.toString());
		this.gl.viewport(0, 0, width, height);
	}

	render(scene: Scene, camera: Camera) {
		let { gl } = this;

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		this.defaultProgram.use();

		this.defaultProgram.bindBufferAttribute(scene.positionBuffer);
		this.defaultProgram.bindBufferAttribute(scene.normalBuffer);
		this.defaultProgram.bindBufferAttribute(scene.uvBuffer);
		this.defaultProgram.bindBufferAttribute(scene.transformIndexBuffer);
		this.defaultProgram.bindBufferAttribute(scene.materialIndexBuffer);

		scene.updateWorldTransform();
		for (let drawCall of scene.drawCalls) {
			for (let i = 0; i < drawCall.meshes.length; i++) {
				let mesh = drawCall.meshes[i];

				if (mesh.needsVertexBufferUpdate) {
					let offset = drawCall.meshVertexStarts[i];
					scene.positionBuffer.set(mesh.geometry.positions, offset);
					scene.normalBuffer.set(mesh.geometry.normals, offset);
					scene.uvBuffer.set(mesh.geometry.uvs, offset);
				}

				if (mesh.needsTransformBufferUpdate) {
					drawCall.transformsBuffer.set(mesh.worldTransform.elements, 16 * i);
					mesh.needsTransformBufferUpdate = false;
				}
			}
			for (let i = 0; i < drawCall.materials.length; i++) {
				let material = drawCall.materials[i];
				if (!material.needsMaterialBufferUpdate) continue;

				drawCall.materialsBuffer.set(material.encode(drawCall.textures, drawCall.cubeTextures), 4 * i);
				material.needsMaterialBufferUpdate = false;
			}
		}
		scene.positionBuffer.update();
		scene.normalBuffer.update();
		scene.uvBuffer.update();

		let transparentTris: number[] = [];
		let transparentTriDistances: number[] = [];
		let tempVec = new THREE.Vector3();
		for (let i = 0; i < scene.materialIndexBuffer.data.length; i += 3) {
			let drawCall = scene.drawCalls[scene.indexToDrawCall[i]];
			let material = drawCall.materials[scene.materialIndexBuffer.data[i]];
			if (material.transparent) {
				transparentTris.push(i);
				let transform = drawCall.meshes[scene.transformIndexBuffer.data[i]].worldTransform;
				tempVec.set(scene.positionBuffer.data[3*i + 0], scene.positionBuffer.data[3*i + 1], scene.positionBuffer.data[3*i + 2]);
				tempVec.applyMatrix4(transform);
				transparentTriDistances.push(tempVec.distanceToSquared(camera.position));
			}
		}
		transparentTris.sort((a, b) => {
			return transparentTriDistances[b] - transparentTriDistances[a];
		});
		for (let i = 0; i < transparentTris.length; i++) {
			scene.indexBufferData[3*i + 0] = transparentTris[i] + 0;
			scene.indexBufferData[3*i + 1] = transparentTris[i] + 1;
			scene.indexBufferData[3*i + 2] = transparentTris[i] + 2;
		}
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.indexBuffer);
		gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, scene.indexBufferData, 0, transparentTris.length * 3);

		gl.uniformMatrix4fv(
			this.defaultProgram.getUniformLocation('viewMatrix'),
			false,
			new Float32Array(camera.viewMatrix.elements)
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

		let transformsLoc = this.defaultProgram.getUniformLocation('transforms');
		let materialsLoc = this.defaultProgram.getUniformLocation('materials');
		let texturesLoc = this.defaultProgram.getUniformLocation('textures');
		let cubeTexturesLoc = this.defaultProgram.getUniformLocation('cubeTextures');
		gl.uniform1i(texturesLoc, 0);
		gl.uniform1iv(cubeTexturesLoc, new Uint32Array([1, 2, 3, 4]));

		gl.uniform3fv(this.defaultProgram.getUniformLocation('ambientLight'), scene.ambientLightBuffer);
		gl.uniform3fv(this.defaultProgram.getUniformLocation('directionalLightColor'), scene.directionalLightColorBuffer);
		gl.uniform3fv(this.defaultProgram.getUniformLocation('directionalLightDirection'), scene.directionalLightDirectionBuffer);

		gl.uniform1i(this.defaultProgram.getUniformLocation('skipTransparent'), 1);
		gl.depthMask(true);
		for (let drawCall of scene.drawCalls) {
			for (let i = 0; i < drawCall.cubeTextures.length; i++) {
				let tex = drawCall.cubeTextures[i];
				gl.activeTexture((gl as any)['TEXTURE' + (i+1)]);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex.glTexture);
			}

			gl.uniformMatrix4fv(transformsLoc, false, drawCall.transformsBuffer);
			gl.uniform4uiv(materialsLoc, drawCall.materialsBuffer);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, scene.textures[drawCall.textureId]);

			gl.drawArrays(gl.TRIANGLES, drawCall.start, drawCall.count);
		}

		gl.uniform1i(this.defaultProgram.getUniformLocation('skipTransparent'), 0);
		gl.depthMask(false);

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

			gl.uniformMatrix4fv(transformsLoc, false, drawCall.transformsBuffer);
			gl.uniform4uiv(materialsLoc, drawCall.materialsBuffer);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, scene.textures[drawCall.textureId]);

			gl.drawElements(gl.TRIANGLES, transparentTris.length * 3, gl.UNSIGNED_INT, 0);
		}
	}
}