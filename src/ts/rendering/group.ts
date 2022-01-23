import { Util } from "../util";
import { Mesh } from "./mesh";
import { Object3D } from "./object_3d";

/** A group represents a collection of 3D objects. */
export class Group extends Object3D {
	children: Object3D[] = [];
	/** Gets called when there's a change in the amount of descendents of this node. */
	onDescendantChange?: (changed: Object3D) => void = null;

	add(child: Object3D) {
		if (child.parent) child.parent.remove(child); // No weird double parent action
		this.children.push(child);
		child.parent = this;

		this.signalChange(child);
	}

	remove(child: Object3D) {
		Util.removeFromArray(this.children, child);
		child.parent = null;

		this.signalChange(child);
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

	traverse(fn: (obj: Object3D) => any) {
		super.traverse(fn);

		for (let child of this.children) {
			child.traverse(fn);
		}
	}

	signalChange(changed: Object3D) {
		// Signals a descendant count change to all ancestors
		this.onDescendantChange?.(changed);
		this.parent?.signalChange(changed);
	}

	/** Recursively sets the opacity of all objects in this group's subtree. */
	setOpacity(value: number) {
		for (let child of this.children) {
			if (child instanceof Group) child.setOpacity(value);
			else (child as Mesh).opacity = value;
		}
	}
}