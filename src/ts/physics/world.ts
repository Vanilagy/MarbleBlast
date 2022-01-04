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
let singletonShapeBody = new RigidBody();
singletonShapeBody.addCollisionShape(singletonShape);

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
		//this.inContact = inContact;

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
		let breh: Collision[] = [];

		

		/*
		collisions.sort((a, b) => b.normal.dot(Util.vecOimoToThree(state.level.currentUp)) - a.normal.dot(Util.vecOimoToThree(state.level.currentUp)));

		collisions = collisions.slice(0, 1);

		if (collisions.length) {
			console.log(collisions.length);
			console.log(collisions.map(x => x.normal.toArray().join(' ')));
		}*/

		// if (collisions.length === 2) {
		// 	console.log(collisions[0].point2.distanceTo(collisions[1].point2));
		// }

		// Clean this up, make sure it doesnt happen for triggers and aux shit cuz cringe
		// And loops are fucked

		if (false) for (let c1 of collisions) {
			let isOldContact = this.inContact.has(c1.s2);
			if (breh.includes(c1)) continue;

			for (let c2 of collisions) {
				if (c1 === c2) continue;

				if (c1.point2.distanceTo(c2.point2) < 0.025) {
					if (isOldContact) {
						console.log("a");
						breh.push(c2);
					} else {
						console.log("b");
						let up = Util.vecOimoToThree(state.level.currentUp); // Temp?
						if (c1.normal.dot(up) > c2.normal.dot(up)) {
							//console.log(c1.normal)
							breh.push(c2);
						} else {
							//console.log(c2.normal)
							breh.push(c1);
						}
					}
				}
				

				// console.log(
				// 	(c1.s2 as ConvexHullCollisionShape).containsPoint(c2.point2),
				// 	(c2.s2 as ConvexHullCollisionShape).containsPoint(c1.point2)
				// );

				// state.level.particles.createEmitter(bounceParticleOptions, c2.point2, null, new THREE.Vector3());
				// state.level.particles.createEmitter(bounceParticleOptions, c1.point2, null, new THREE.Vector3());

				// console.log(c2.point2);
				// console.log(c1.point2);
			}
		}

		if (false) for (let c2 of collisions) {
			for (let c1 of collisions) {
				if (c1 === c2) continue;
				if (!this.inContact.has(c1.s2)) continue;

				//c2.normal.copy(c1.normal);

				//console.log(c1.normal.angleTo(c2.normal));

				//console.log(c1.point2.z, c2.point2.z, c2.normal);
				//c2.supplyMinimumSeparatingVector(c1.msv);

				
				let wack = c2.point2.clone().sub(c1.point2).normalize();
				let dot = wack.dot(c1.normal);
				console.log(dot);

				if (dot < 0.1) {
					c2.supplyMinimumSeparatingVector(c1.msv);

					if (dot < -0.5) breh.push(c2);

					/*
					c2.restitution = 0;
					c2.depth = 0;
					c2.normal.copy(c1.normal);

					if (dot < -0.9) {
						console.log(c1.normal, wack);
					}
					*/
				}
			}
		}

		//console.log(collisions.map(x => x.normal.toArray().join(' ')));

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
			let proximityCollisions: Collision[] = [];

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

					if (isCcdPass) {
						let timeOfImpact = GjkEpa.determineTimeOfImpact(shape, candidate, minimumSeparatingVector);
						collision.timeOfImpact = timeOfImpact;
						this.newInContactCcd.add(candidate);

						collisions.push(collision);
					} else {
						collision.supplyMinimumSeparatingVector(minimumSeparatingVector);

						//if (proximityCollisions.length) debugger;

						let k;
						for (k = 0; k < proximityCollisions.length; k++) {
							let c2 = proximityCollisions[k];
							let distSq = collision.point2.distanceToSquared(c2.point2);

							//dist = Math.min(collision.point2.distanceTo(c2.point2), collision.point.distanceTo(c2.point), collision.point1.distanceTo(c2.point1));

							//console.log(dist);

							//let pointIntersection = candidate.points.filter(x => c2.s2.points.some(y => y.equals(x)));

							//if (dist >= 0.1) console.log(dist);
							if (distSq >= 0.1**2) continue;
							//if (pointIntersection.length === 0) continue;

							/*

							console.log(pointIntersection.length)

							let combined = new CombinedCollisionShape(c2.s2, candidate);
							let comeOn = new RigidBody();
							comeOn.addCollisionShape(combined);
							let breh = new THREE.Vector3();
							let newThing = GjkEpa.gjk(shape, combined, null, breh);

							//console.log(newThing, breh.normalize());

							c2.supplyMinimumSeparatingVector(breh);

							break;

							*/

							let combined = new CombinedCollisionShape(c2.s2, candidate);
							combined.body = singletonShapeBody;
							let breh = new THREE.Vector3();
							let newThing = GjkEpa.gjk(shape, combined, null, breh);

							//console.log("---");

							breh.normalize();
							//console.log(breh);

							let sussy = GjkEpa.castRay(candidate, singletonShape, candidate.getCenter(new THREE.Vector3()).add(breh.clone().multiplyScalar(20)), breh.clone().negate(), 20);
							let sussy2 = GjkEpa.castRay(c2.s2, singletonShape, c2.s2.getCenter(new THREE.Vector3()).add(breh.clone().multiplyScalar(20)), breh.clone().negate(), 20);
							//console.log(sussy, sussy?.normal);
							//console.log(sussy2, sussy2?.normal);

							if (sussy) {
								collision.supplyMinimumSeparatingVector(sussy.normal.multiplyScalar(collision.depth));
							}
							if (sussy2) {
								c2.supplyMinimumSeparatingVector(sussy2.normal.multiplyScalar(c2.depth));
							}


							/*
							if (!this.inContact.has(candidate)) {
								if (this.inContact.has(c2.s2)) {
									break;
								}

								let up = Util.vecOimoToThree(state.level.currentUp);
								if (collision.normal.dot(up) <= c2.normal.dot(up)) {
									break;
								}
							}

							proximityCollisions[k] = collision;

							break;*/
							proximityCollisions.push(collision);
							break;
						}

						if (k === proximityCollisions.length) proximityCollisions.push(collision);
					}
				}
			}

			for (let j = 0; j < proximityCollisions.length; j++) {
				let collision = proximityCollisions[j];

				collisions.push(collision);
				shape.body.collisions.push(collision);
				collision.s2.body.collisions.push(collision);
				this.newInContact.add(collision.s2);
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