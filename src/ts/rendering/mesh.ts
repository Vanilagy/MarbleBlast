import { Geometry } from "./geometry";
import { Material } from "./material";
import { Object3D } from "./object_3d";

/** Since meshes can have multiple materials, this data structure is used to split up and isolate the individual material parts of the mesh. */
export interface MaterialIndexData {
	material: Material,
	indices: number[],
	/** Contains the same data as `indices`, but allows for faster memcpy operations. */
	indexBuffer?: Uint32Array
}

/** A mesh, defined by geometry and materials, can be added to a scene graph and rendered. */
export class Mesh extends Object3D {
	geometry: Geometry;
	materials: Material[];
	/** Whether or not the mesh info buffer needs to be updated because this mesh's info changed. */
	needsMeshInfoBufferUpdate = true;
	/** Whether or not the vertex buffers need to be updated because this mesh's geometry changed. */
	needsVertexBufferUpdate = false;
	private _opacity = 1.0;
	castShadows = false;

	/** Stores the vertex indices for each separate material of this mesh. */
	materialIndices: MaterialIndexData[] = [];
	/** The offset of this mesh's geometry in the vertex buffer. */
	vboOffset: number;
	/** Used for sorting, will be updated elsewhere. */
	distanceToCamera: number;
	hasTransparentMaterials = false;

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
		// The mesh info consists of the mesh's transform and other things. Since the last row of a transformation matrix is constant, that row is used to encode the other data.

		buffer.set(this.worldTransform.elements, index);
		buffer[index + 3] = this._opacity;

		let flags = 0; // Unused right now
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
			data.indices.push(this.vboOffset + index); // Note we offset the index by our VBO offset so that the index actually makes sense within the whole VBO
		}

		for (let group of this.materialIndices) {
			group.indexBuffer = new Uint32Array(group.indices); // We create a typed array here because we'll need for speedy copying later on
		}
	}
}