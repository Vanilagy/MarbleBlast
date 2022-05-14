import { Box3 } from "../math/box3";
import { Vector3 } from "../math/vector3";
import { Util } from "../util";

const DEFAULT_ROOT_NODE_SIZE = 1;
const MIN_DEPTH = -32;
const MAX_DEPTH = 8;

let v1 = new Vector3();
let v2 = new Vector3();
let b1 = new Box3();

/** Specifies an object that an octree can index. */
export interface OctreeObject {
	boundingBox: Box3
}

/** A dynamic, loose octree of bounding boxes for efficient spatial operations such as raytracing. Implemented without any cringe. */
export class Octree {
	root: OctreeNode;
	/** A map of each object in the octree to the node that it's in. This accelerates removal drastically, as the lookup step can be skipped. */
	objectToNode: WeakMap<OctreeObject, OctreeNode>;
	beforeOperation: () => void = null;

	constructor() {
		this.root = new OctreeNode(this, 0);
		// Init the octree to a 1x1x1 cube
		this.root.min.set(0, 0, 0);
		this.root.size = DEFAULT_ROOT_NODE_SIZE;

		this.objectToNode = new WeakMap();
	}

	insert(object: OctreeObject) {
		let node = this.objectToNode.get(object);
		if (node) return; // Don't insert if already contained in the tree

		if (!object.boundingBox.min.equals(object.boundingBox.min) || !object.boundingBox.max.equals(object.boundingBox.max)) {
			console.log("object");
			console.warn(`Can't insert NaN bounding box object into octree, my guy!`);
			return;
		}

		while (!this.root.largerThan(object) || !this.root.containsCenter(object)) {
			// The root node does not fit the object; we need to grow the tree.
			if (this.root.depth === MIN_DEPTH) {
				console.log(object);
				console.warn(`Can't insert ${this.root.largerThan(object)? 'distant' : 'large'} object into octree; the octree has already expanded to its maximum size.`);
				return;
			}
			this.grow(object);
		}

		let emptyBefore = this.root.count === 0;
		this.root.insert(object);
		if (emptyBefore) this.shrink(); // See if we can fit the octree better now that we actually have an element in it
	}

	remove(object: OctreeObject) {
		let node = this.objectToNode.get(object);
		if (!node) return;

		node.remove(object);
		this.objectToNode.delete(object);
		this.shrink(); // Try shrinking the octree
	}

	/** Updates an object in the tree whose bounding box has changed. */
	update(object: OctreeObject) {
		// this.remove(object);
		// this.insert(object);
		// return;

		let node = this.objectToNode.get(object);
		if (!node) {
			this.insert(object);
			return;
		}

		let success = node.update(object);
		if (!success) {
			this.objectToNode.delete(object);
			this.insert(object);
		}
	}

	/** Expand the octree towards an object that doesn't fit in it. */
	grow(towards: OctreeObject) {
		// We wanna grow towards all the vertices of the object's bounding box that lie outside the octree, so we determine the average position of those vertices:
		let averagePoint = v1.set(0, 0, 0);
		let count = 0;
		for (let i = 0; i < 8; i++) {
			let vec = v2;
			vec.setComponent(0, (i & 0b001)? towards.boundingBox.min.x : towards.boundingBox.max.x);
			vec.setComponent(1, (i & 0b010)? towards.boundingBox.min.y : towards.boundingBox.max.y);
			vec.setComponent(2, (i & 0b100)? towards.boundingBox.min.z : towards.boundingBox.max.z);

			if (!this.root.containsPoint(vec)) {
				averagePoint.add(vec);
				count++;
			}
		}
		averagePoint.multiplyScalar(1 / count); // count should be greater than 0, because that's why we're growing in the first place.

		// Determine the direction from the root center to the determined point
		let rootCenter = v2.copy(this.root.min).addScalar(this.root.size / 2);
		let direction = averagePoint.sub(rootCenter); // Determine the "direction of growth"

		// Create a new root. The current root will become a quadrant in this new root.
		let newRoot = new OctreeNode(this, this.root.depth - 1);
		newRoot.min.copy(this.root.min);
		newRoot.size = this.root.size * 2;

		if (direction.x < 0) newRoot.min.x -= this.root.size;
		if (direction.y < 0) newRoot.min.y -= this.root.size;
		if (direction.z < 0) newRoot.min.z -= this.root.size;

		if (this.root.count > 0) {
			let octantIndex = ((direction.x < 0)? 1 : 0) + ((direction.y < 0)? 2 : 0) + ((direction.z < 0)? 4 : 0);

			newRoot.createOctants();
			newRoot.octants[octantIndex] = this.root;
			this.root.parent = newRoot;
			newRoot.count = this.root.count;

			newRoot.merge();
		}

		this.root = newRoot;
	}

	/** Tries to shrink the octree if large parts of the octree are empty. */
	shrink() {
		if (this.root.size < DEFAULT_ROOT_NODE_SIZE || this.root.objects.size > 0) return;

		if (this.root.count === 0) {
			// Reset to default empty octree
			this.root.min.set(0, 0, 0);
			this.root.size = DEFAULT_ROOT_NODE_SIZE;
			this.root.depth = 0;
			return;
		}

		if (!this.root.octants) return;

		// Find the only non-empty octant
		let nonEmptyOctant: OctreeNode;
		for (let i = 0; i < 8; i++) {
			let octant = this.root.octants[i];
			if (octant.count > 0) {
				if (nonEmptyOctant) return; // There are more than two non-empty octants -> don't shrink.
				else nonEmptyOctant = octant;
			}
		}

		// Make the only non-empty octant the new root
		this.root = nonEmptyOctant;
		nonEmptyOctant.parent = null;

		this.shrink();
	}

	intersectAabb(aabb: Box3) {
		this.beforeOperation?.();

		let intersections: OctreeObject[] = [];
		this.root.intersectAabb(aabb, intersections);

		return intersections;
	}

	intersectRay(rayOrigin: Vector3, rayDirection: Vector3, lambdaMax: number) {
		v1.copy(rayDirection).normalize();
		lambdaMax *= rayDirection.length();

		let intersections: OctreeObject[] = [];
		this.root.intersectRay(rayOrigin, v1, lambdaMax, intersections);

		return intersections;
	}

	// todo keep this?
	intersectOctreeObject(object: OctreeObject): OctreeObject[] {
		let node = this.objectToNode.get(object);
		if (!node) return [];

		let intersections: OctreeObject[] = [];

		while (node.parent) {
			let strictBoundingBox = b1;
			strictBoundingBox.min.copy(node.min);
			strictBoundingBox.max.copy(node.min).addScalar(node.size);

			if (strictBoundingBox.containsBox(object.boundingBox)) break;

			node = node.parent;
		}

		node.intersectAabb(object.boundingBox, intersections);

		while (node.parent) {
			node = node.parent;
			node.intersectAabb(object.boundingBox, intersections, false);
		}

		return intersections;
	}
}

class OctreeNode {
	octree: Octree;
	parent: OctreeNode = null;
	/** The min corner of the bounding box. */
	min = new Vector3();
	/** The size of the bounding box on all three axes. This forces the bounding box to be a cube. */
	size: number;
	octants: OctreeNode[] = null;
	/** A list of objects contained in this node. Note that the node doesn't need to be a leaf node for this set to be non-empty; since this is an octree of bounding boxes, some volumes cannot fit into an octant and therefore need to be stored in the node itself. */
	objects = new Set<OctreeObject>();
	/** The total number of objects in the subtree with this node as its root. */
	count = 0;
	depth: number;

	constructor(octree: Octree, depth: number) {
		this.octree = octree;
		this.depth = depth;
	}

	insert(object: OctreeObject) {
		this.count++;

		//this.intersectAabb2(object);

		if (this.octants) {
			// First we check if the object can fit into any of the octants (they all have the same size, so checking only one suffices)
			if (this.octants[0].largerThan(object)) {
				// Try to insert the object into one of the octants...
				for (let i = 0; i < 8; i++) {
					let octant = this.octants[i];
					if (octant.containsCenter(object)) {
						octant.insert(object);
						return;
					}
				}
			}

			// No octant fit the object, so add it to the list of objects instead
			this.objects.add(object);
			this.octree.objectToNode.set(object, this);
		} else {
			this.objects.add(object);
			this.octree.objectToNode.set(object, this);
			this.split(); // Try splitting this node
		}
	}

	split() {
		if (this.objects.size <= 8 || this.depth === MAX_DEPTH) return;

		this.createOctants();

		// Put the objects into the correct octants. Note that all objects that couldn't fit into any octant will remain in the set.
		for (let object of this.objects) {
			if (this.octants[0].largerThan(object)) {
				for (let j = 0; j < 8; j++) {
					let octant = this.octants[j];
					if (octant.containsCenter(object)) {
						octant.insert(object);
						this.objects.delete(object);
					}
				}
			}
		}

		// Try recursively splitting each octant
		for (let i = 0; i < 8; i++) {
			this.octants[i].split();
		}
	}

	createOctants() {
		this.octants = [];
		for (let i = 0; i < 8; i++) {
			let newNode = new OctreeNode(this.octree, this.depth + 1);
			newNode.parent = this;
			newNode.size = this.size / 2;
			newNode.min.set(
				this.min.x + newNode.size * ((i & 0b001) >> 0), // The x coordinate changes every index
				this.min.y + newNode.size * ((i & 0b010) >> 1), // The y coordinate changes every 2 indices
				this.min.z + newNode.size * ((i & 0b100) >> 2) // The z coordinate changes every 4 indices
			);

			this.octants.push(newNode);
		}
	}

	// Note: The requirement for this method to be called is that `object` is contained directly in this node.
	remove(object: OctreeObject) {
		this.objects.delete(object);
		this.count--;
		this.merge();

		// Clean up all ancestors
		let node = this.parent;
		while (node) {
			node.count--; // Reduce the count for all ancestor nodes up until the root
			node.merge();
			node = node.parent;
		}
	}

	// Basically first performs a remove, then walks up the tree to find the closest ancestor that can fit the object, then inserts it.
	update(object: OctreeObject) {
		this.objects.delete(object);

		let node: OctreeNode = this;
		while (node) {
			node.count--;
			node.merge();

			if (node.largerThan(object) && node.containsCenter(object)) {
				node.insert(object);
				return true;
			}

			node = node.parent;
		}

		return false; // Nothing worked, we need to properly grow the tree
	}

	merge() {
		if (this.count > 8 || !this.octants) return;

		// Add all objects in the octants back to this node
		for (let i = 0; i < 8; i++) {
			let octant = this.octants[i];
			for (let object of octant.objects) {
				this.objects.add(object);
				this.octree.objectToNode.set(object, this);
			}
		}
		this.octants = null; // ...then delete the octants
	}

	largerThan(object: OctreeObject) {
		let box = object.boundingBox;
		return this.size > (box.max.x - box.min.x) &&
			this.size > (box.max.y - box.min.y) &&
			this.size > (box.max.z - box.min.z);
	}

	containsCenter(object: OctreeObject) {
		let box = object.boundingBox;
		let x = box.min.x + (box.max.x - box.min.x) / 2;
		let y = box.min.y + (box.max.y - box.min.y) / 2;
		let z = box.min.z + (box.max.z - box.min.z) / 2;

		return this.min.x <= x && x < (this.min.x + this.size) &&
			this.min.y <= y && y < (this.min.y + this.size) &&
			this.min.z <= z && z < (this.min.z + this.size);
	}

	containsPoint(point: Vector3) {
		let { x, y, z } = point;
		return this.min.x <= x && x < (this.min.x + this.size) &&
			this.min.y <= y && y < (this.min.y + this.size) &&
			this.min.z <= z && z < (this.min.z + this.size);
	}

	intersectAabb(aabb: Box3, intersections: OctreeObject[], recurse = false) {
		let looseBoundingBox = b1;
		looseBoundingBox.min.copy(this.min).addScalar(-this.size / 2);
		looseBoundingBox.max.copy(this.min).addScalar(this.size * 3/2);

		if (!aabb.intersectsBox(looseBoundingBox)) return;

		// Test all objects for intersection
		if (this.objects.size > 0) for (let object of this.objects) {
			if (aabb.intersectsBox(object.boundingBox)) intersections.push(object);
		}

		// Recurse into the octants
		if (this.octants) for (let i = 0; i < 8; i++) {
			let octant = this.octants[i];
			if (octant.count === 0) continue;

			octant.intersectAabb(aabb, intersections);
		}
	}

	intersectRay(rayOrigin: Vector3, rayDirection: Vector3, lambdaMax: number, intersections: OctreeObject[]) {
		// Construct the loose bounding box of this node (2x in size, with the regular bounding box in the center)
		let looseBoundingBox = b1;
		looseBoundingBox.min.copy(this.min).addScalar(-this.size / 2);
		looseBoundingBox.max.copy(this.min).addScalar(this.size * 3/2);

		if (!Util.rayIntersectsBox(rayOrigin, rayDirection, lambdaMax, looseBoundingBox)) return; // The ray doesn't hit the node's loose bounding box; we can stop

		// Test all objects for intersection
		if (this.objects.size > 0) for (let object of this.objects) {
			if (Util.rayIntersectsBox(rayOrigin, rayDirection, lambdaMax, object.boundingBox)) {
				intersections.push(object);
			}
		}

		// Recurse into the octants
		if (this.octants) for (let i = 0; i < 8; i++) {
			let octant = this.octants[i];
			octant.intersectRay(rayOrigin, rayDirection, lambdaMax, intersections);
		}
	}

	intersectAabb2(object: OctreeObject) {
		let aabb = object.boundingBox;

		let looseBoundingBox = b1;
		looseBoundingBox.min.copy(this.min).addScalar(-this.size / 2);
		looseBoundingBox.max.copy(this.min).addScalar(this.size * 3/2);

		if (!aabb.intersectsBox(looseBoundingBox)) return;

		// Test all objects for intersection
		if (this.objects.size > 0) for (let otherObject of this.objects) {
			if (aabb.intersectsBox(otherObject.boundingBox)) {
				object.adjacent.add(otherObject);
				otherObject.adjacent.add(object);
			}
		}

		// Recurse into the octants
		if (this.octants) for (let i = 0; i < 8; i++) {
			let octant = this.octants[i];
			if (octant.count === 0) continue;

			octant.intersectAabb2(object);
		}
	}
}