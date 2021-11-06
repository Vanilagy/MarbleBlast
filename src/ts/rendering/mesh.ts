import THREE from "three";
import { Geometry } from "./geometry";
import { Material } from "./material";
import { Object3D } from "./object_3d";

export class Mesh extends Object3D {
	geometry: Geometry;
	materials: Material[];
	needsTransformBufferUpdate = true;
	needsVertexBufferUpdate = false;

	constructor(geometry: Geometry, materials: Material[]) {
		super();
		this.geometry = geometry;
		this.materials = materials;
	}

	changedTransform() {
		if (this.needsWorldTransformUpdate) return;

		super.changedTransform();
		this.needsTransformBufferUpdate = true;
	}
}