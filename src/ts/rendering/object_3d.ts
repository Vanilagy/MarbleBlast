import { Matrix4 } from "../math/matrix4";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { Group } from "./group";

const IDENTITY_MATRIX = new Matrix4();

/** Represents an object in 3D space. */
export class Object3D {
	parent: Group = null;
	/** The object's local transform. */
	transform = new Matrix4();
	position = new Vector3();
	orientation = new Quaternion();
	scale = new Vector3(1, 1, 1);
	/** The object's global transform in world space. */
	worldTransform = new Matrix4();
	needsWorldTransformUpdate = true;

	/** Stores if this object itself, without any parents influencing it, is dynamic. */
	readonly selfDynamic: boolean;
	/** Is true if the object itself or any of its ancestors are *dynamic*, i.e. have the ability to be added to and removed from scenes after scene compilation. Non-dynamic (static) objects have to be added before compilation. */
	get dynamic() {
		let node: Object3D = this;

		while (node) {
			if (node.selfDynamic) return true;
			node = node.parent;
		}

		return false;
	}

	constructor(dynamic = false) {
		this.selfDynamic = dynamic;
	}

	/** Updates this object's global transformation matrix. */
	updateWorldTransform() {
		// Multiply our parent's transform by our own local transform
		this.worldTransform.copy(this.parent?.worldTransform ?? IDENTITY_MATRIX).multiply(this.transform);
		this.needsWorldTransformUpdate = false;
		this.transform.decompose(this.position, this.orientation, this.scale); // Keep these values synced with the matrix
	}

	/** Marks the object as having received a change to its transform and needing to be updated. */
	changedTransform() {
		this.needsWorldTransformUpdate = true;

		// Also signal it to all ancestors
		let parent = this.parent;
		while (parent && !parent.needsWorldTransformUpdate) {
			parent.needsWorldTransformUpdate = true;
			parent = parent.parent;
		}
	}

	/** Updates the transformation matrix from position, orienation and scale values. */
	recomputeTransform() {
		this.transform.compose(this.position, this.orientation, this.scale);
		this.changedTransform();
	}

	/** Traverses this Object3D and all its descendants and calls the callback on each Object3D. */
	traverse(fn: (obj: Object3D) => any) {
		fn(this);
	}
}