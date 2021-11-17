import THREE from "three";
import { BufferAttribute } from "./buffer_attribute";
import { Geometry } from "./geometry";
import { Material } from "./material";
import { Object3D } from "./object_3d";

export class Mesh extends Object3D {
	geometry: Geometry;
	materials: Material[];
	needsMeshInfoBufferUpdate = true;
	needsVertexBufferUpdate = false;
	private _opacity = 1.0;
	castShadows = false;
	receiveShadows = false;

	constructor(geometry: Geometry, materials: Material[]) {
		super();
		this.geometry = geometry;
		this.materials = materials;
	}

	changedTransform() {
		if (this.needsWorldTransformUpdate) return;

		super.changedTransform();
		this.needsMeshInfoBufferUpdate = true;
	}

	get opacity() {
		return this._opacity;
	}

	set opacity(value: number) {
		if (value === this._opacity) return;
		this._opacity = value;
		this.needsMeshInfoBufferUpdate = true;
	}

	updateMeshInfoBuffer(buffer: Float32Array, index: number) {
		buffer.set(this.worldTransform.elements, index);
		buffer[index + 3] = this._opacity;

		let flags = Number(this.receiveShadows) << 0;
		buffer[index + 7] = flags;

		this.needsMeshInfoBufferUpdate = false;
	}
}