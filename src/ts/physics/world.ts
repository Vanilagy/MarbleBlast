import THREE from "three";
import { Octree } from "../octree";
import { Collision } from "./collision";
import { CollisionShape } from "./collision_shape";
import { GjkEpa } from "./gjk_epa";
import { RigidBody, RigidBodyType } from "./rigid_body";

const MAX_SUBSTEPS = 10;

let v1 = new THREE.Vector3();
let v2 = new THREE.Vector3();

export class World {
	bodies: RigidBody[] = [];
	gravity = new THREE.Vector3();
	octree = new Octree();
	inContact = new Set<CollisionShape>();

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

		let dynamicBodies: RigidBody[] = [];
		let dynamicShapes: CollisionShape[] = [];

		for (let i = 0; i < this.bodies.length; i++) {
			let body = this.bodies[i];
			if (!body.enabled) continue;

			body.storePrevious();
			body.onBeforeIntegrate(dt);
			body.integrate(dt);

			body.collisions.length = 0;

			if (body.type === RigidBodyType.Dynamic) {
				dynamicBodies.push(body);
				dynamicShapes.push(...body.shapes);
			}
		}

		let ccdCollisions = this.computeCollisions(dynamicShapes, true);
		let inContact = new Set<CollisionShape>();
		let t = 1;

		for (let i = 0; i < ccdCollisions.length; i++) {
			let collision = ccdCollisions[i];
			inContact.add(collision.s2);

			if (!this.inContact.has(collision.s2)) {
				t = Math.min(collision.timeOfImpact, t);
			}
		}

		let cumT = startT + t * (1 - startT); // coom
		this.inContact = inContact;

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

		this.substep(dt * (1 - t), cumT, depth + 1);
	}

	computeCollisions(dynamicShapes: CollisionShape[], isCcdPass: boolean) {
		let collisions: Collision[] = [];
		let cachedBroadphaseResults = new Map<CollisionShape, CollisionShape[]>();

		for (let i = 0; i < dynamicShapes.length; i++) {
			let shape = dynamicShapes[i];
			let broadphaseShape = shape.broadphaseShape || shape;
			let collisionCandidates = cachedBroadphaseResults.get(broadphaseShape);

			if (!collisionCandidates) {
				collisionCandidates = this.octree.intersectAabb(shape.boundingBox) as CollisionShape[];
				cachedBroadphaseResults.set(shape, collisionCandidates);
			}

			for (let j = 0; j < collisionCandidates.length; j++) {
				let candidate = collisionCandidates[j];

				if (shape === candidate) continue;
				if ((shape.collisionDetectionMask & candidate.collisionDetectionMask) === 0) continue;
				if (!shape.body.enabled || !candidate.body.enabled) continue;

				let minimumSeparatingVector: THREE.Vector3 = null;
				let transVec: THREE.Vector3 = null;

				if (isCcdPass) {
					transVec = shape.body.getRelativeMotionVector(v1, candidate.body);
					transVec.negate(); // Translate backwards from where we came from, doesn't matter since we just care about the boolean result
				} else {
					minimumSeparatingVector = v2.set(0, 0, 0);
				}

				let collides = GjkEpa.gjk(shape, candidate, null, minimumSeparatingVector, transVec);

				if (collides) {
					let collision = new Collision(shape, candidate);

					collisions.push(collision);
					shape.body.collisions.push(collision);
					candidate.body.collisions.push(collision);

					if (isCcdPass) {
						let timeOfImpact = GjkEpa.determineTimeOfImpact(shape, candidate, minimumSeparatingVector);
						collision.timeOfImpact = timeOfImpact;
					} else {
						collision.supplyMinimumSeparatingVector(minimumSeparatingVector);
					}
				}
			}
		}

		return collisions;
	}
}