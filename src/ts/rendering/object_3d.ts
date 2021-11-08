import THREE from "three";
import { Group } from "./group";

const IDENTITY_MATRIX = new THREE.Matrix4();

export class Object3D {
	parent: Group = null;
	transform = new THREE.Matrix4();
	position = new THREE.Vector3();
	orientation = new THREE.Quaternion();
	scale = new THREE.Vector3(1, 1, 1);
	worldTransform = new THREE.Matrix4();
	needsWorldTransformUpdate = true;

	updateWorldTransform() {
		this.worldTransform.copy(this.parent?.worldTransform ?? IDENTITY_MATRIX).multiply(this.transform);
		this.needsWorldTransformUpdate = false;
		this.transform.decompose(this.position, this.orientation, this.scale);
	}

	changedTransform() {
		this.needsWorldTransformUpdate = true;
		
		let parent = this.parent;
		while (parent && !parent.needsWorldTransformUpdate) {
			parent.needsWorldTransformUpdate = true;
			parent = parent.parent;
		}
	}

	recomputeTransform() {
		this.transform.compose(this.position, this.orientation, this.scale);
		this.changedTransform();
	}
}