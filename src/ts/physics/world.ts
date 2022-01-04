import THREE from "three";
import { Octree } from "../octree";
import { Collision } from "./collision";
import { CollisionShape, CombinedCollisionShape, ConvexHullCollisionShape } from "./collision_shape";
import { CollisionDetection } from "./collision_detection";
import { RigidBody, RigidBodyType } from "./rigid_body";
import { CollisionResponse } from "./collision_response";

const MAX_SUBSTEPS = 10;

let v1 = new THREE.Vector3();
let v2 = new THREE.Vector3();
let v3 = new THREE.Vector3();
let raycastAabb = new THREE.Box3();

let singletonShape = new ConvexHullCollisionShape([new THREE.Vector3()]);
let combinedCollisionShape = new CombinedCollisionShape(null, null);
let utilBody = new RigidBody();
utilBody.addCollisionShape(singletonShape);
utilBody.addCollisionShape(combinedCollisionShape);

export interface RayCastHit {
	point: THREE.Vector3,
	normal: THREE.Vector3,
	lambda: number,
	shape: CollisionShape
}

export class World {
	bodies: RigidBody[] = [];
	gravity = new THREE.Vector3();
	octree = new Octree();

	inContactCcd = new Set<CollisionShape>();
	newInContactCcd = new Set<CollisionShape>();
	inContact = new Set<CollisionShape>();
	newInContact = new Set<CollisionShape>();

	cachedBroadphaseResults = new Map<CollisionShape, CollisionShape[]>();

	add(body: RigidBody) {
		if (body.world) {
			throw new Error("RigidBody already belongs to a world.");
		}

		this.bodies.push(body);
		body.world = this;
		body.syncShapes();
	}

	step(dt: number) {
		//console.time();
		for (let i = 0; i < 1; i++) this.substep(dt, 0, 0);
		//console.timeEnd();
	}

	substep(dt: number, startT: number, depth: number) {
		if (dt < 0.00001 || depth >= MAX_SUBSTEPS) return;

		let dynamicBodies: RigidBody[] = [];
		let dynamicShapes: CollisionShape[] = [];

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

		let ccdCollisions = this.computeCollisions(dynamicShapes, true);
		let t = 1;

		for (let i = 0; i < ccdCollisions.length; i++) {
			let collision = ccdCollisions[i];

			if (!this.inContactCcd.has(collision.s2)) {
				t = Math.min(collision.timeOfImpact, t);
			}
		}

		let cumT = startT + t * (1 - startT); // coom

		for (let i = 0; i < this.bodies.length; i++) {
			let body = this.bodies[i];
			if (!body.enabled) continue;

			body.revert(t);
			body.collisions.length = 0;

			if (body.type !== RigidBodyType.Dynamic) continue;

			let externalForce = v1.set(0, 0, 0);
			externalForce.add(this.gravity);

			body.linearVelocity.addScaledVector(externalForce, dt * t);
		}

		let collisions = this.computeCollisions(dynamicShapes, false);
		let collidingBodies: RigidBody[] = [];

		for (let i = 0; i < collisions.length; i++) {
			let collision = collisions[i];

			if (!collidingBodies.includes(collision.s1.body)) collidingBodies.push(collision.s1.body);
			if (!collidingBodies.includes(collision.s2.body)) collidingBodies.push(collision.s2.body);
		}

		collidingBodies.sort((a, b) => a.evaluationOrder - b.evaluationOrder);

		for (let body of collidingBodies) body.onBeforeCollisionResponse(cumT, dt * t);

		for (let i = 0; i < collisions.length; i++) {
			let collision = collisions[i];
			if ((collision.s1.collisionResponseMask & collision.s2.collisionResponseMask) === 0) continue;

			CollisionResponse.solvePosition(collision);
			CollisionResponse.solveVelocity(collision);
		}

		for (let body of collidingBodies) body.onAfterCollisionResponse(cumT, dt * t);

		this.inContactCcd = this.newInContactCcd;
		this.newInContactCcd = new Set();
		this.inContact = this.newInContact;
		this.newInContact = new Set();

		this.substep(dt * (1 - t), cumT, depth + 1);
	}

	computeCollisions(dynamicShapes: CollisionShape[], isCcdPass: boolean) {
		let collisions: Collision[] = [];
		//let cachedBroadphaseResults = new Map<CollisionShape, CollisionShape[]>();

		for (let i = 0; i < dynamicShapes.length; i++) {
			let shape = dynamicShapes[i];
			let broadphaseShape = shape.broadphaseShape || shape;
			let collisionCandidates = this.cachedBroadphaseResults.get(broadphaseShape);
			let shapeCollisions: Collision[] = [];

			if (!collisionCandidates) {
				collisionCandidates = this.octree.intersectAabb(shape.boundingBox) as CollisionShape[];
				this.cachedBroadphaseResults.set(broadphaseShape, collisionCandidates);
			}

			outer:
			for (let j = 0; j < collisionCandidates.length; j++) {
				let candidate = collisionCandidates[j];

				if (shape === candidate) continue;
				if ((shape.collisionDetectionMask & candidate.collisionDetectionMask) === 0) continue;
				if (!shape.body.enabled || !candidate.body.enabled) continue;

				for (let k = 0; k < collisions.length; k++) {
					let c = collisions[k];
					if (c.s1 === candidate && c.s2 === shape) continue outer;
				}

				if (isCcdPass) {
					let timeOfImpact = CollisionDetection.determineTimeOfImpact(shape, candidate);
					if (timeOfImpact === null) continue;

					let collision = new Collision(shape, candidate);
					collision.timeOfImpact = timeOfImpact;
					this.newInContactCcd.add(candidate);
					collisions.push(collision);
				} else {
					let collides = CollisionDetection.checkIntersection(shape, candidate);
					if (!collides) continue;

					let collision = new Collision(shape, candidate);
					let isMainCollisionShape = !!(shape.collisionDetectionMask & 1); // Meaning, no aux stuff, no triggers, whatever

					if (isMainCollisionShape) {
						let minimumSeparatingVector = CollisionDetection.determineMinimumSeparatingVector(v2);
						collision.supplyMinimumSeparatingVector(minimumSeparatingVector);
					}

					if (isMainCollisionShape) for (let k = 0; k < shapeCollisions.length; k++) {
						let c2 = shapeCollisions[k];
						let distSq = collision.point2.distanceToSquared(c2.point2);
						if (distSq >= 0.1**2) continue;

						combinedCollisionShape.s1 = c2.s2;
						combinedCollisionShape.s2 = candidate;

						let combinedNormal = v3.setScalar(0);
						CollisionDetection.checkIntersection(shape, combinedCollisionShape);
						CollisionDetection.determineMinimumSeparatingVector(combinedNormal);
						combinedNormal.normalize();

						if (collision.normal.dot(combinedNormal) <= 0 || c2.normal.dot(combinedNormal) <= 0) break; // Incase the result is totally out of wack

						let size: number;

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

						if (hit1) {
							collision.supplyMinimumSeparatingVector(hit1.normal.multiplyScalar(collision.depth));
						}
						if (hit2) {
							c2.supplyMinimumSeparatingVector(hit2.normal.multiplyScalar(c2.depth));
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

		for (let i = 0; i < collisions.length; i++) collisions[i].updateMaterialProperties();

		return collisions;
	}

	castRay(rayOrigin: THREE.Vector3, rayDirection: THREE.Vector3, maxLength: number, collisionDetectionMask = 0b1) {
		raycastAabb.makeEmpty();
		raycastAabb.expandByPoint(rayOrigin);
		raycastAabb.expandByPoint(v1.copy(rayOrigin).addScaledVector(rayDirection, maxLength));

		let candidates = this.octree.intersectAabb(raycastAabb) as CollisionShape[];
		let hits: RayCastHit[] = [];

		for (let candidate of candidates) {
			if ((candidate.collisionDetectionMask & collisionDetectionMask) === 0) continue;

			let hit = CollisionDetection.castRay(candidate, singletonShape, rayOrigin, rayDirection, maxLength);
			if (hit) hits.push({ ...hit, shape: candidate });
		}

		return hits.sort((a, b) => a.lambda - b.lambda);
	}
}