import THREE from "three";
import { bounceParticleOptions } from "../marble";
import { Octree } from "../octree";
import { state } from "../state";
import { Util } from "../util";
import { Collision } from "./collision";
import { CollisionShape, CombinedCollisionShape, ConvexHullCollisionShape } from "./collision_shape";
import { GjkEpa } from "./gjk_epa";
import { RigidBody, RigidBodyType } from "./rigid_body";

const MAX_SUBSTEPS = 10;

let v1 = new THREE.Vector3();
let v2 = new THREE.Vector3();
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

	add(body: RigidBody) {
		if (body.world) {
			throw new Error("RigidBody already belongs to a world.");
		}

		this.bodies.push(body);
		body.world = this;
		body.syncShapes();
	}

	step(dt: number) {
		this.substep(dt, 0, 0);
	}

	substep(dt: number, startT: number, depth: number) {
		if (dt < 0.00001 || depth >= MAX_SUBSTEPS) return;

		console.log(depth);

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

			collision.solvePosition();
			collision.solveVelocity();
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
		let cachedBroadphaseResults = new Map<CollisionShape, CollisionShape[]>();

		for (let i = 0; i < dynamicShapes.length; i++) {
			let shape = dynamicShapes[i];
			let broadphaseShape = shape.broadphaseShape || shape;
			let collisionCandidates = cachedBroadphaseResults.get(broadphaseShape);
			let shapeCollisions: Collision[] = [];

			if (!collisionCandidates) {
				collisionCandidates = this.octree.intersectAabb(shape.boundingBox) as CollisionShape[];
				cachedBroadphaseResults.set(shape, collisionCandidates);
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

				/*
				let minimumSeparatingVector: THREE.Vector3 = null;
				let transVec: THREE.Vector3 = null;

				if (isCcdPass) {
					transVec = shape.body.getRelativeMotionVector(v1, candidate.body);
					transVec.negate(); // Translate backwards from where we came from, doesn't matter since we just care about the boolean result
				} else {
					minimumSeparatingVector = v2.set(0, 0, 0);
				}*/

				if (isCcdPass) {
					let timeOfImpact = GjkEpa.determineTimeOfImpact(shape, candidate);
					if (timeOfImpact === null) continue;

					let collision = new Collision(shape, candidate);
					collision.timeOfImpact = timeOfImpact;
					this.newInContactCcd.add(candidate);
					collisions.push(collision);
				} else {
					let collides = GjkEpa.gjk(shape, candidate);
					if (!collides) continue;

					let minimumSeparatingVector = GjkEpa.epa(v2);
					let collision = new Collision(shape, candidate);
					collision.supplyMinimumSeparatingVector(minimumSeparatingVector);

					let doInternalEdgeHitCorrection = !!(shape.collisionDetectionMask & 1);
					doInternalEdgeHitCorrection = false;

					if (doInternalEdgeHitCorrection) for (let k = 0; k < shapeCollisions.length; k++) {
						let c2 = shapeCollisions[k];
						let distSq = collision.point2.distanceToSquared(c2.point2);
						if (distSq >= 0.1**2) continue;

						combinedCollisionShape.s1 = c2.s2;
						combinedCollisionShape.s2 = candidate;

						let msv = new THREE.Vector3();
						GjkEpa.gjk(shape, combinedCollisionShape);
						GjkEpa.epa(msv);
						msv.normalize();

						if (collision.normal.dot(msv) <= 0 || c2.normal.dot(msv) <= 0) break; // Incase the result is totally out of wack

						let size: number;

						size = candidate.boundingBox.min.distanceTo(candidate.boundingBox.max);
						let hit1 = GjkEpa.castRay(
							candidate,
							singletonShape,
							candidate.getCenter(v1).add(v2.copy(msv).multiplyScalar(size)),
							v2.copy(msv).negate(),
							size
						);
						size = c2.s2.boundingBox.min.distanceTo(c2.s2.boundingBox.max);
						let hit2 = GjkEpa.castRay(
							c2.s2,
							singletonShape,
							c2.s2.getCenter(v1).add(v2.copy(msv).multiplyScalar(size)),
							v2.copy(msv).negate(),
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

				/*

				let collides = GjkEpa.gjk(shape, candidate, null, minimumSeparatingVector, transVec);

				if (collides) {
					let collision = new Collision(shape, candidate);

					if (isCcdPass) {
						let timeOfImpact = GjkEpa.determineTimeOfImpact(shape, candidate);
						collision.timeOfImpact = timeOfImpact;
						this.newInContactCcd.add(candidate);

						collisions.push(collision);
					} else {
						collision.supplyMinimumSeparatingVector(minimumSeparatingVector);

						let doInternalEdgeHitCorrection = !!(shape.collisionDetectionMask & 1);

						if (doInternalEdgeHitCorrection) for (let k = 0; k < shapeCollisions.length; k++) {
							let c2 = shapeCollisions[k];
							let distSq = collision.point2.distanceToSquared(c2.point2);
							if (distSq >= 0.1**2) continue;

							combinedCollisionShape.s1 = c2.s2;
							combinedCollisionShape.s2 = candidate;

							let msv = new THREE.Vector3();
							GjkEpa.gjk(shape, combinedCollisionShape, null, msv);
							msv.normalize();

							if (collision.normal.dot(msv) <= 0 || c2.normal.dot(msv) <= 0) break; // Incase the result is totally out of wack

							let size: number;

							size = candidate.boundingBox.min.distanceTo(candidate.boundingBox.max);
							let hit1 = GjkEpa.castRay(
								candidate,
								singletonShape,
								candidate.getCenter(v1).add(v2.copy(msv).multiplyScalar(size)),
								v2.copy(msv).negate(),
								size
							);
							size = c2.s2.boundingBox.min.distanceTo(c2.s2.boundingBox.max);
							let hit2 = GjkEpa.castRay(
								c2.s2,
								singletonShape,
								c2.s2.getCenter(v1).add(v2.copy(msv).multiplyScalar(size)),
								v2.copy(msv).negate(),
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

				*/
			}
		}

		return collisions;
	}

	castRay(rayOrigin: THREE.Vector3, rayDirection: THREE.Vector3, maxLength: number, collisionDetectionMask = 0b1) {
		raycastAabb.makeEmpty();
		raycastAabb.expandByPoint(rayOrigin);
		raycastAabb.expandByPoint(rayOrigin.clone().addScaledVector(rayDirection, maxLength));

		let candidates = this.octree.intersectAabb(raycastAabb) as CollisionShape[];
		let hits: RayCastHit[] = [];

		for (let candidate of candidates) {
			if ((candidate.collisionDetectionMask & collisionDetectionMask) === 0) continue;

			let hit = GjkEpa.castRay(candidate, singletonShape, rayOrigin, rayDirection, maxLength);
			if (hit) hits.push({ ...hit, shape: candidate });
		}

		return hits.sort((a, b) => a.lambda - b.lambda);
	}
}