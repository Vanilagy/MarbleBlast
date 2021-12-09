import THREE from "three";
import { BufferAttribute } from "./buffer_attribute";
import { Geometry } from "./geometry";
import { Material } from "./material";
import { Object3D } from "./object_3d";
import { MeshInfoGroup } from "./scene";

export interface MaterialIndexData {
	material: Material,
	indices: number[],
	indexBuffer?: Uint32Array
}

export class Mesh extends Object3D {
	geometry: Geometry;
	materials: Material[];
	needsMeshInfoBufferUpdate = true;
	needsVertexBufferUpdate = false;
	private _opacity = 1.0;
	castShadows = false;

	materialIndices: MaterialIndexData[] = [];
	vboOffset: number;
	meshInfoGroup: MeshInfoGroup;

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

		let flags = 0;
		buffer[index + 7] = flags;

		this.needsMeshInfoBufferUpdate = false;
	}

	compileMaterialIndices() {
		let map = new Map<Material, MaterialIndexData>();

		for (let i = 0; i < this.geometry.indices.length; i++) {
			let materialIndex = this.geometry.materials[i];
			let material = this.materials[materialIndex];
			let data = map.get(material);

			if (!data) {
				data = { material, indices: [] };
				map.set(material, data);
				this.materialIndices.push(data);
			}

			let index = this.geometry.indices[i];
			data.indices.push(this.vboOffset + index);
		}

		for (let group of this.materialIndices) {
			group.indexBuffer = new Uint32Array(group.indices);
		}
	}
}