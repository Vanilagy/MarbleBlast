import THREE from "three";
import { Group } from "./group";

export class Object3D {
	parent: Group = null;
	transform = new THREE.Matrix4();
	worldTransform = new THREE.Matrix4();
	needsWorldTransformUpdate = true;

	updateWorldTransform() {
		this.worldTransform.copy(this.parent?.worldTransform ?? new THREE.Matrix4()).multiply(this.transform);
		this.needsWorldTransformUpdate = false;
	}

	changedTransform() {
		if (this.needsWorldTransformUpdate) return;
		this.needsWorldTransformUpdate = true;
		
		let parent = this.parent;
		while (parent && !parent.needsWorldTransformUpdate) {
			parent.needsWorldTransformUpdate = true;
			parent = parent.parent;
		}
	}
}