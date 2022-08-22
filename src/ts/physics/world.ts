import { Octree } from "./octree";
import { Collision } from "./collision";
import { CollisionShape, CombinedCollisionShape, SingletonCollisionShape } from "./collision_shape";
import { CollisionDetection } from "./collision_detection";
import { RigidBody, RigidBodyType } from "./rigid_body";
import { CollisionResponse } from "./collision_response";
import { Vector3 } from "../math/vector3";
import { Box3 } from "../math/box3";
import { Plane } from "../math/plane";

const MAX_SUBSTEPS = 10;

let v1 = new Vector3();
let v2 = new Vector3();
let v3 = new Vector3();
let p1 = new Plane();
let rayCastAabb = new Box3();

let singletonShape = new SingletonCollisionShape();
let combinedCollisionShape = new CombinedCollisionShape(null, null);
let utilBody = new RigidBody();
utilBody.addCollisionShape(singletonShape);
utilBody.addCollisionShape(combinedCollisionShape);

export interface RayCastHit {
	point: Vector3,
	normal: Vector3,
	lambda: number,
	shape: CollisionShape
}

/** Represents a physics simulation world. */
export class World {
	bodies: RigidBody[] = [];
	gravity = new Vector3();
	octree = new Octree();

	/** List of shapes that are currently in contact according to the CCD (Continuous Collision Detection) pass. */
	inContactCcd = new Set<CollisionShape>();
	newInContactCcd = new Set<CollisionShape>();
	/** List of shapes that are currently in contact. */
	inContact = new Set<CollisionShape>();
	newInContact = new Set<CollisionShape>();

	/** This cache can speed up broadphase lookups by reusing results. */
	cachedBroadphaseResults = new Map<CollisionShape, CollisionShape[]>();

	add(body: RigidBody) {
		if (body.world) {
			throw new Error("RigidBody already belongs to a world.");
		}

		this.bodies.push(body);
		body.world = this;
		body.syncShapes();
	}

	/** Steps the physics world by `dt` seconds. */
	step(dt: number) {
		this.substep(dt, 0, 0);
	}

	substep(dt: number, startT: number, depth: number) {
		// Roughly follows Algorithm 4 from https://www10.cs.fau.de/publications/theses/2010/Schornbaum_DA_2010.pdf.

		if (dt < 0.00001 || depth >= MAX_SUBSTEPS) return;

		let dynamicBodies: RigidBody[] = [];
		let dynamicShapes: CollisionShape[] = [];

		// Integrate all the bodies
		for (let i = 0; i < this.bodies.length; i++) {
			let body = this.bodies[i];
			if (!body.enabled) continue;

			body.storePrevious();
			body.onBeforeIntegrate(dt);
			body.integrate(dt);
			body.onAfterIntegrate(dt);

			body.collisions.length = 0;

			if (body.type === RigidBodyType.Dynamic) {
				dynamicBodies.push(body);
				dynamicShapes.push(...body.shapes);
			}
		}

		this.cachedBroadphaseResults.clear();

		// Check for CCD collisions
		let ccdCollisions = this.computeCollisions(dynamicShapes, true);
		let t = 1;

		// Find the first collision with a **new** shape
		for (let i = 0; i < ccdCollisions.length; i++) {
			let collision = ccdCollisions[i];

			if (!this.inContactCcd.has(collision.s2)) {
				t = Math.min(collision.timeOfImpact, t);
			}
		}

		let cumT = startT + t * (1 - startT); // coom (it means cumulative incase you don't know)

		// Now, revert all the bodies back according to the CCD result
		for (let i = 0; i < this.bodies.length; i++) {
			let body = this.bodies[i];
			if (!body.enabled) continue;

			body.revert(t);
			body.collisions.length = 0;

			if (body.type !== RigidBodyType.Dynamic) continue;

			// Add external forces

			let externalForce = v1.set(0, 0, 0);
			externalForce.add(this.gravity);

			body.linearVelocity.addScaledVector(externalForce, dt * t);
		}

		// Now, compute the regular collisions
		let collisions = this.computeCollisions(dynamicShapes, false);
		let collidingBodies: RigidBody[] = [];

		// Get a list of all bodies that are encountering a collision
		for (let i = 0; i < collisions.length; i++) {
			let collision = collisions[i];

			if (!collidingBodies.includes(collision.s1.body)) collidingBodies.push(collision.s1.body);
			if (!collidingBodies.includes(collision.s2.body)) collidingBodies.push(collision.s2.body);
		}

		collidingBodies.sort((a, b) => a.evaluationOrder - b.evaluationOrder);

		for (let i = 0; i < collidingBodies.length; i++) collidingBodies[i].onBeforeCollisionResponse(cumT, dt * t);

		// Now, solve all the collisions
		for (let i = 0; i < collisions.length; i++) {
			let collision = collisions[i];
			if ((collision.s1.collisionResponseMask & collision.s2.collisionResponseMask) === 0) continue; // The masks don't match, don't do collision response

			CollisionResponse.solvePosition(collision);
			CollisionResponse.solveVelocity(collision);
		}

		for (let i = 0; i < collidingBodies.length; i++) collidingBodies[i].onAfterCollisionResponse(cumT, dt * t);

		this.inContactCcd = this.newInContactCcd;
		this.newInContactCcd = new Set();
		this.inContact = this.newInContact;
		this.newInContact = new Set();

		this.substep(dt * (1 - t), cumT, depth + 1);
	}

	/** Computes all collision for a set of dynamic shapes. */
	computeCollisions(dynamicShapes: CollisionShape[], isCcdPass: boolean) {
		let collisions: Collision[] = [];

		for (let i = 0; i < dynamicShapes.length; i++) {
			let shape = dynamicShapes[i];
			if (!shape.body.enabled) continue;

			// Figure out which shape to use for the broadphase
			let broadphaseShape = shape.broadphaseShape || shape;
			let collisionCandidates = this.cachedBroadphaseResults.get(broadphaseShape);
			let shapeCollisions: Collision[] = [];

			if (!collisionCandidates) {
				// Query the octree for AABB intersections
				collisionCandidates = this.octree.intersectAabb(broadphaseShape.boundingBox) as CollisionShape[];
				this.cachedBroadphaseResults.set(broadphaseShape, collisionCandidates);
			}

			// Now, loop over all possible candidates
			outer:
			for (let j = 0; j < collisionCandidates.length; j++) {
				let candidate = collisionCandidates[j];

				if (shape === candidate) continue;
				if ((shape.collisionDetectionMask & candidate.collisionDetectionMask) === 0) continue;
				if (!candidate.body.enabled) continue;

				// Check if this pair of shapes is already colliding
				for (let k = 0; k < collisions.length; k++) {
					let c = collisions[k];
					if (c.s1 === candidate && c.s2 === shape) continue outer; // No double collisions
				}

				if (isCcdPass) {
					// Compute the time of impact of the two shapes
					let timeOfImpact = CollisionDetection.determineTimeOfImpact(shape, candidate);
					if (timeOfImpact === null) continue;

					let collision = new Collision(shape, candidate);
					collision.timeOfImpact = timeOfImpact;
					this.newInContactCcd.add(candidate);
					collisions.push(collision);
				} else {
					// First, let's check if the two shapes actually intersect
					let collides = CollisionDetection.checkIntersection(shape, candidate);
					if (!collides) continue;

					let collision = new Collision(shape, candidate);
					let isMainCollisionShape = !!(shape.collisionDetectionMask & 1); // Meaning, no aux stuff, no triggers, whatever

					if (isMainCollisionShape) {
						// Compute the plane of collision
						let collisionPlane = CollisionDetection.determineCollisionPlane(p1);
						collision.supplyCollisionPlane(collisionPlane);
					}

					// Perform a collision correction step: Sometimes, shapes can collide with internal edges, i.e. edges that aren't visible to the outside, leading to incorrect results. We try to catch and correct these cases here.
					if (isMainCollisionShape) for (let k = 0; k < shapeCollisions.length; k++) {
						let c2 = shapeCollisions[k];
						let distSq = collision.point2.distanceToSquared(c2.point2);
						if (distSq >= 0.1**2) continue; // Heuristic: If the two collision points are really close, the two shapes themselves are touching and we've hit at least one internal edge

						// Create a new collision shape that's the convex hull of the two individual shapes
						combinedCollisionShape.s1 = c2.s2;
						combinedCollisionShape.s2 = candidate;

						// Perform an intersection test on this combined shape. Our hope is that this gives us a good idea of what the actual collision normal should be.
						CollisionDetection.checkIntersection(shape, combinedCollisionShape);
						CollisionDetection.determineCollisionPlane(p1);
						let combinedNormal = v3.copy(p1.normal);

						// Exit if the combined normal has a greater angle to either collision normal than they have to each other (meaning it's probably out of wack)
						let dotBetween = collision.normal.dot(c2.normal);
						if (collision.normal.dot(combinedNormal) < dotBetween - 1e-10 || c2.normal.dot(combinedNormal) < dotBetween - 1e-10) {
							continue;
						}

						let size: number;

						// Now, along the combined collision normal from above, perform a ray cast onto both shapes to figure out the "correct" normal of the face that's actually visible and part of the collision (as opposed to the internal edge we can't see). Note that sometimes this method fails and doesn't hit the right face, but that's usually caught later.

						size = candidate.boundingBox.min.distanceTo(candidate.boundingBox.max);
						let hit1 = CollisionDetection.castRay(
							candidate,
							singletonShape,
							candidate.getCenter(v1).addScaledVector(combinedNormal, size),
							v2.copy(combinedNormal).negate(),
							size
						);
						size = c2.s2.boundingBox.min.distanceTo(c2.s2.boundingBox.max);
						let hit2 = CollisionDetection.castRay(
							c2.s2,
							singletonShape,
							c2.s2.getCenter(v1).addScaledVector(combinedNormal, size),
							v2.copy(combinedNormal).negate(),
							size
						);

						// If we've hit the shapes, see if we should replace the collision normals of the collisions
						if (hit1 && hit1.normal.dot(combinedNormal) >= collision.normal.dot(combinedNormal)) { // Only replace if the hit normal is an improvement over the old normal
							collision.supplyCollisionPlane(p1.set(hit1.normal, collision.depth));
						}
						if (hit2 && hit2.normal.dot(combinedNormal) >= c2.normal.dot(combinedNormal)) {
							c2.supplyCollisionPlane(p1.set(hit2.normal, c2.depth));
						}

						break;
					}

					collisions.push(collision);
					shapeCollisions.push(collision);
					shape.body.collisions.push(collision);
					collision.s2.body.collisions.push(collision);
					this.newInContact.add(candidate);
				}
			}
		}

		// We need to update the material properties at the end because here, all the normals are computed
		for (let i = 0; i < collisions.length; i++) collisions[i].updateMaterialProperties();

		return collisions;
	}

	/** Casts a ray into the world and returns all intersections. */
	castRay(rayOrigin: Vector3, rayDirection: Vector3, lambdaMax: number, collisionDetectionMask = 0b1) {
		// Build the AABB of the ray
		rayCastAabb.makeEmpty();
		rayCastAabb.expandByPoint(rayOrigin);
		rayCastAabb.expandByPoint(v1.copy(rayOrigin).addScaledVector(rayDirection, lambdaMax));

		// Query the octree for possible candidates
		let candidates = this.octree.intersectAabb(rayCastAabb) as CollisionShape[];
		let hits: RayCastHit[] = [];

		for (let candidate of candidates) {
			if ((candidate.collisionDetectionMask & collisionDetectionMask) === 0) continue;

			// Perform a GJK ray cast
			let hit = CollisionDetection.castRay(candidate, singletonShape, rayOrigin, rayDirection, lambdaMax);
			if (hit) hits.push({ ...hit, shape: candidate });
		}

		return hits.sort((a, b) => a.lambda - b.lambda);
	}

	/** Performs convex casting of a given shape: Translates a shape from its current position linearly along a direction (swept volume) and returns all intersections with other shapes.  */
	castShape(shape: CollisionShape, direction: Vector3, lambdaMax: number) {
		// Build the AABB of the swept volume
		rayCastAabb.makeEmpty();
		rayCastAabb.expandByPoint(shape.boundingBox.min);
		rayCastAabb.expandByPoint(shape.boundingBox.max);
		rayCastAabb.expandByPoint(v1.copy(shape.boundingBox.min).addScaledVector(direction, lambdaMax));
		rayCastAabb.expandByPoint(v1.copy(shape.boundingBox.max).addScaledVector(direction, lambdaMax));

		// Query the octree for possible candidates
		let candidates = this.octree.intersectAabb(rayCastAabb) as CollisionShape[];
		let hits: RayCastHit[] = [];
		let negDirection = v2.copy(direction).negate();

		for (let candidate of candidates) {
			if (shape === candidate) continue;
			if ((shape.collisionDetectionMask & candidate.collisionDetectionMask) === 0) continue;
			if (!candidate.body.enabled) continue;
			if (candidate.body.linearVelocity.lengthSq() > 0) continue;

			// Perform a GJK ray cast on the Minkowski difference
			let hit = CollisionDetection.castRay(shape, candidate, v1.setScalar(0), negDirection, lambdaMax);
			if (hit) hits.push({ ...hit, shape: candidate });
		}

		return hits.sort((a, b) => a.lambda - b.lambda);
	}
}