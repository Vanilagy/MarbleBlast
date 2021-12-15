import { Util } from "../util";
import { Mesh } from "./mesh";
import { Object3D } from "./object_3d";

/** A group represents a collection of 3D objects. */
export class Group extends Object3D {
	children: Object3D[] = [];

	add(child: Object3D) {
		if (child.parent) child.parent.remove(child); // No weird double parent action
		this.children.push(child);
		child.parent = this;
	}

	remove(child: Object3D) {
		Util.removeFromArray(this.children, child);
		child.parent = null;
	}

	updateWorldTransform() {
		if (!this.needsWorldTransformUpdate) return;
		super.updateWorldTransform();

		// Update the world transforms of all descendants
		for (let child of this.children) {
			if (child.needsWorldTransformUpdate)
				child.updateWorldTransform();
		}
	}

	changedTransform() {
		super.changedTransform();
		for (let child of this.children) child.changedTransform();
	}

	/** Traverses this group and all its descendants and calls the callback on each non-group. */
	traverse(fn: (obj: Object3D) => any) {
		fn(this);

		for (let child of this.children) {
			if (child instanceof Group) child.traverse(fn);
			else fn(child);
		}
	}

	/** Recursively sets the opacity of all objects in this group's subtree. */
	setOpacity(value: number) {
		for (let child of this.children) {
			if (child instanceof Group) child.setOpacity(value);
			else (child as Mesh).opacity = value;
		}
	}
}