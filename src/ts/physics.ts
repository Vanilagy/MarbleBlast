import { Level, PHYSICS_TICK_RATE } from "./level";
import { PathedInterior } from "./pathed_interior";
import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { Util } from "./util";
import { Interior } from "./interior";
import { Shape } from "./shape";
import { Trigger } from "./triggers/trigger";
import { MARBLE_RADIUS } from "./marble";

interface CollisionCorrectionEvent {
	fraction: number,
	position: OIMO.Vec3,
	interior?: PathedInterior,
	interiorMovement?: OIMO.Vec3
}

/** Handles physics simulation business. */
export class PhysicsHelper {
	level: Level;
	world: OIMO.World;

	/** A separate world used to compute collision with pathed interiors. */
	pathedInteriorCollisionWorld: OIMO.World;
	pathedInteriorBodies: Map<PathedInterior, OIMO.RigidBody>;
	marbleGeometry = new OIMO.SphereGeometry(MARBLE_RADIUS);

	/** A separate world used to check collision with items and colliders. */
	auxWorld: OIMO.World;
	auxMarbleShape: OIMO.Shape;
	auxMarbleBody: OIMO.RigidBody;

	/** Maps userdata to a shape */
	shapeLookup = new Map<any, Shape>();
	shapeColliderLookup = new Map<any, Shape>();
	triggerLookup = new Map<any, Trigger>();
	/** Shapes that recently were involved in a collision. */
	shapeImmunity = new Set<Shape>();
	/** Remember which shapes or triggers we're currently inside. */
	shapeOrTriggerInside = new Set<Shape | Trigger>();

	constructor(level: Level) {
		this.level = level;

		this.world = new OIMO.World(OIMO.BroadPhaseType.BVH, new OIMO.Vec3(0, 0, -20));
		this.auxWorld = new OIMO.World(OIMO.BroadPhaseType.BVH, new OIMO.Vec3(0, 0, 0));

		this.pathedInteriorCollisionWorld = new OIMO.World(OIMO.BroadPhaseType.BVH, new OIMO.Vec3());
		this.pathedInteriorBodies = new Map();
	}

	initMarble() {
		this.world.addRigidBody(this.level.marble.body);

		// Use a capsule geometry to approximate the swept volume of the marble between two physics ticks
		let auxMarbleGeometry = new OIMO.CapsuleGeometry(MARBLE_RADIUS * 2, 0); // Radius will be changed on the fly anyway
		this.auxMarbleShape = new OIMO.Shape(new OIMO.ShapeConfig());
		this.auxMarbleShape._geom = auxMarbleGeometry;
		this.auxMarbleBody = new OIMO.RigidBody(new OIMO.RigidBodyConfig());
		this.auxMarbleBody.addShape(this.auxMarbleShape);
		this.auxWorld.addRigidBody(this.auxMarbleBody);
	}

	addInterior(interior: Interior) {
		this.world.addRigidBody(interior.body);

		if (interior instanceof PathedInterior) {
			for (let trigger of interior.triggers) {
				// Add the trigger to the aux world
				this.auxWorld.addRigidBody(trigger.body);
				this.triggerLookup.set(trigger.id, trigger);
			}

			// Set up the body for the pathed interior collision detection algorithm.
			let config = new OIMO.RigidBodyConfig();
			config.type = OIMO.RigidBodyType.STATIC;
			let body = new OIMO.RigidBody(config);
			let currentShape = interior.body.getShapeList();
			while (currentShape) {
				let shapeConfig = new OIMO.ShapeConfig();
				shapeConfig.geometry = currentShape.getGeometry();
				let newShape = new OIMO.Shape(shapeConfig);
				body.addShape(newShape);

				currentShape = currentShape.getNext();
			}

			this.pathedInteriorBodies.set(interior, body);
		}
	}

	addShape(shape: Shape) {
		for (let body of shape.bodies) {
			// Depending on collideability, determine which world to add the body to
			if (shape.collideable) this.world.addRigidBody(body);
			else this.auxWorld.addRigidBody(body);
		}

		for (let collider of shape.colliders) {
			this.auxWorld.addRigidBody(collider.body);
			this.shapeColliderLookup.set(collider.id, shape);
		}

		this.shapeLookup.set(shape.id, shape);
	}

	addTrigger(trigger: Trigger) {
		this.auxWorld.addRigidBody(trigger.body);
		this.triggerLookup.set(trigger.id, trigger);
	}

	step() {
		let prevMarblePosition = this.level.marble.body.getPosition().clone();
		let prevMarbleTransform = this.level.marble.body.getTransform().clone();

		// Update pathed interior velocities before running the simulation step
		for (let interior of this.level.interiors) interior.tick(this.level.timeState);

		let gravityBefore = this.world.getGravity().clone();
		if (this.level.finishTime) {
			// Slow down the marble when it's in the finish and disable gravity
			let vel = this.level.marble.body.getLinearVelocity();
			vel.scaleEq(0.9);
			this.level.marble.body.setLinearVelocity(vel);

			this.world.setGravity(new OIMO.Vec3());
		}

		this.world.step(1 / PHYSICS_TICK_RATE);
		this.world.setGravity(gravityBefore);

		let currentMarblePosition = this.level.marble.body.getPosition();
		let currentMarbleVelocity = this.level.marble.body.getLinearVelocity();
		let movementDiff = currentMarblePosition.sub(prevMarblePosition);
		let movementDist = movementDiff.length();

		/** A list of collision events that happened between the last and current tick. */
		let collisionCorrectionEvents: CollisionCorrectionEvent[] = [];

		// Because OimoPhysics' simulation is discrete, but we cannot allow the marble to glitch through anything, we need to perform some sort of continuous collision detection (CCD). In our case, we perform a convex cast of the marble geometry from its last point to its current point and see what we intersect along the way.
		this.world.convexCast(this.marbleGeometry, prevMarbleTransform, movementDiff, {
			process(shape, hit) {
				if (shape.getRigidBody().getType() !== OIMO.RigidBodyType.STATIC) return; // Ignore pathed interiors

				let movementDot = hit.normal.dot(currentMarbleVelocity);
				if (movementDot < 0) {
					hit.normal = hit.normal.scale(-1);
					movementDot *= -1;
				}

				if (movementDot < MARBLE_RADIUS * PHYSICS_TICK_RATE) return; // The marble impacted the surface slow enough that discrete collision detection is enough to handle it.
				
				// Nudge the position back a bit so that it *just* touches the surface.
				let position = hit.position.clone().sub(hit.normal.scale(MARBLE_RADIUS * 0.9));
				let fraction = position.sub(prevMarblePosition).length() / movementDist;
				if (fraction < 0 || fraction > 1) return;

				collisionCorrectionEvents.push({ fraction: hit.fraction, position });
			}
		});
		// Now do CCD with pathed interiors
		this.checkPathedInteriorCollision(prevMarblePosition, prevMarbleTransform, collisionCorrectionEvents);

		// Pick the earliest collision event
		let collisionEvent = collisionCorrectionEvents[0];
		for (let event of collisionCorrectionEvents) {
			if (event.fraction < collisionEvent.fraction) collisionEvent = event;
		}

		if (collisionEvent) {
			if (collisionEvent.interior) {
				// If we hit a pathed interior, we position both the marble and the interior at the predicted point of impact and then run a simulation step.
				let intPos = Util.vecThreeToOimo(collisionEvent.interior.prevPosition).add(collisionEvent.interiorMovement.scale(collisionEvent.fraction));
				collisionEvent.interior.body.setPosition(intPos);

				let marblePos = collisionEvent.position.add(collisionEvent.interiorMovement.scale(collisionEvent.fraction));
				this.level.marble.body.setPosition(marblePos);

				this.world.step(1 / PHYSICS_TICK_RATE * 1); // Alright, the fact that we do a full physics step here is quite unrealistic, but with the small step, the marble was often sticking to the interior. That's a much greater inaccuracy than the one caused from a large timestep.
			} else {
				// We hit static geometry; move the marble to the point of impact and perform a small simulation step.
				let stepFraction = Util.clamp(1 - collisionEvent.fraction, 0.05, 0.95);

				this.level.marble.body.setPosition(collisionEvent.position);
				this.world.step(1 / PHYSICS_TICK_RATE * stepFraction);
			}
		}

		this.callCollisionHandlers(movementDiff, movementDist);
	}

	checkPathedInteriorCollision(prevMarblePosition: OIMO.Vec3, prevMarbleTransform: OIMO.Transform, collisionCorrectionEvents: CollisionCorrectionEvent[]) {
		// CCD with two moving objects (the marble and the interior) is harder, but can be boiled down to the static-moving case with a simple change of reference frame: We pretend the moving interior is static and only the marble is moving relative to its view. Then we can perform a simple convex cast again to find the moment of impact and advance from there.

		let currentMarblePosition = this.level.marble.body.getPosition();

		for (let interior of this.level.interiors) {
			if (!(interior instanceof PathedInterior)) continue;
			if (interior.body.getType() === OIMO.RigidBodyType.STATIC) continue;

			let interiorMovement =  Util.vecThreeToOimo(interior.currentPosition.clone().sub(interior.prevPosition));
			let body = this.pathedInteriorBodies.get(interior);

			// Add the interior to the world temporarily
			this.pathedInteriorCollisionWorld.addRigidBody(body);
			body.setPosition(Util.vecThreeToOimo(interior.prevPosition));

			// Subtract the interior's movement from the marble's moement to get the marble's movement from the interior's POV
			let translationVec = (currentMarblePosition.sub(prevMarblePosition)).sub(interiorMovement);
			let transform = prevMarbleTransform.clone();
			// Make the "ray" start earlier and go farther to detect more collisions.
			transform.setPosition(prevMarblePosition.sub(translationVec.scale(1)));
			translationVec = translationVec.scale(3);

			this.pathedInteriorCollisionWorld.convexCast(this.marbleGeometry, transform, translationVec, {
				process(shape, hit) {
					let fraction = hit.fraction * 3 - 1; // Readjust the fraction because we scaled the translationVec
					if (fraction < -0.1 || fraction > 1.1) return; // The collision is outside of the desired range

					let movementDot = hit.normal.dot(translationVec.scale(PHYSICS_TICK_RATE / 3));
					if (movementDot < 0) {
						hit.normal = hit.normal.scale(-1);
						movementDot *= -1;
					}

					if (movementDot < MARBLE_RADIUS * PHYSICS_TICK_RATE) return; // Same as with static objects

					// Same as with static objects
					let position = hit.position.clone().sub(hit.normal.scale(MARBLE_RADIUS * 0.95));

					collisionCorrectionEvents.push({
						interior: interior as PathedInterior,
						interiorMovement, position, fraction
					});
				}
			});

			// Remove the interior from the world again
			this.pathedInteriorCollisionWorld.removeRigidBody(body);
		}

		// Prevent horrible BvhProxy memory leak
		let world = this.pathedInteriorCollisionWorld as any;
		world._updateContacts();
		world._broadPhase.movedProxies.length = 0;
		world._broadPhase.numMovedProxies = 0;
	}

	/** Checks collisions with objects and triggers and acts accordingly. */
	callCollisionHandlers(movementDiff: OIMO.Vec3, movementDist: number) {
		/** New shapes to be made immune */
		let newImmunity: Shape[] = [];
		let calledShapes = new Set<Shape>();
		let linkedList = this.level.marble.body.getContactLinkList();
		while (linkedList) {
			let contact = linkedList.getContact();
			let contactShape = contact.getShape1();
			if (contactShape === this.level.marble.shape) contactShape = contact.getShape2();

			if (contactShape.userData && contact.isTouching()) {
				let shape = this.shapeLookup.get(contactShape.userData);

				if (shape && !this.shapeImmunity.has(shape) && !calledShapes.has(shape)) {
					// We found a valid collision with a shape
					calledShapes.add(shape);
					newImmunity.push(shape);
					shape.onMarbleContact(this.level.timeState, contact);
				}
			}

			linkedList = linkedList.getNext();
		}

		this.shapeImmunity.clear();
		for (let s of newImmunity) this.shapeImmunity.add(s);

		let movementRot = new OIMO.Quat();
		movementRot.setArc(new OIMO.Vec3(0, 1, 0), movementDiff.clone().normalize());

		// Construct the capsule geometry in a way where it represents the swept volume of the marble during the last tick.
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._halfHeight = movementDist/2;
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._radius = MARBLE_RADIUS * 2; // The normal game's hitbox can expand to up to sqrt(3)x the normal size, but since we're using a sphere, let's be generous and make it 2x
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._gjkMargin = MARBLE_RADIUS * 2; // We gotta update this value too
		let marblePosition = this.level.marble.body.getPosition().sub(movementDiff.scale(0.5));

		this.auxMarbleBody.setPosition(marblePosition);
		this.auxMarbleBody.setOrientation(movementRot);
		this.auxWorld.getContactManager()._updateContacts(); // Update contacts

		let inside = new Set<Shape | Trigger>();

		let current = this.auxMarbleBody.getContactLinkList();
		// First check for collisions with shapes using the enlarged marble hitbox
		while (current) {
			let contact = current.getContact();
			contact._updateManifold();
			let contactShape = contact.getShape1();
			if (contactShape === this.auxMarbleShape) contactShape = contact.getShape2();

			let object = this.shapeLookup.get(contactShape.userData);

			if (object && contact.isTouching()) {
				object.onMarbleInside(this.level.timeState);
				if (!this.shapeOrTriggerInside.has(object)) {
					// We've entered the shape
					this.shapeOrTriggerInside.add(object);
					object.onMarbleEnter(this.level.timeState);
				}

				inside.add(object);
			}

			current = current.getNext();
		}

		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._radius = MARBLE_RADIUS;
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._gjkMargin = MARBLE_RADIUS;

		this.auxWorld.getContactManager()._updateContacts(); // Update contacts again
		current = this.auxMarbleBody.getContactLinkList();
		// Now check for collisions with triggers and colliders using the smaller hitbox
		while (current) {
			let contact = current.getContact();
			contact._updateManifold();
			let contactShape = contact.getShape1();
			if (contactShape === this.auxMarbleShape) contactShape = contact.getShape2();

			let object: Shape | Trigger = this.triggerLookup.get(contactShape.userData);

			if (!object) {
				if (contact.isTouching()) {
					// We hit something and it wasn't a trigger, so it could've been a collider
					object = this.shapeColliderLookup.get(contactShape.userData);
					object?.onColliderInside(contactShape.userData);
				}
			} else if (contact.isTouching()) {
				object.onMarbleInside(this.level.timeState);
				if (!this.shapeOrTriggerInside.has(object)) {
					// We've entered the trigger
					this.shapeOrTriggerInside.add(object);
					object.onMarbleEnter(this.level.timeState);
				}

				inside.add(object);
			}

			current = current.getNext();
		}

		for (let object of this.shapeOrTriggerInside) {
			if (!inside.has(object)) {
				// We've left the object
				this.shapeOrTriggerInside.delete(object);
				object.onMarbleLeave(this.level.timeState);
			}
		}
	}

	reset() {
		this.shapeImmunity.clear();
		this.shapeOrTriggerInside.clear();
	}

	/** Computes the completion between the last and current tick that the marble touched the given shapes in the aux world. */
	computeCompletionOfImpactWithShapes(shapes: Set<OIMO.Shape>, radiusFactor: number) {
		let movementDiff = this.level.marble.body.getPosition().sub(this.level.marble.lastPos);
		let movementDist = movementDiff.length();

		let movementRot = new OIMO.Quat();
		movementRot.setArc(new OIMO.Vec3(0, 1, 0), movementDiff.clone().normalize());

		// Initialize the capsule geometry
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._radius = MARBLE_RADIUS * radiusFactor;
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._gjkMargin = MARBLE_RADIUS * radiusFactor; // We gotta update this value too
		this.auxMarbleBody.setOrientation(movementRot);

		let iterations = 5; // These are more than enough iterations for sub-millisecond accuracy, the value of 5 results in a time granularity of ~0.27 ms.
		let low = -1 / (2**iterations - 2); // Hack the binary search a bit to allow results of 0 and 1 as well
		let high = 1 - low;
		let mid: number;

		// Perform a binary search on the length of the capsule to find the moment of impact.
		for (let i = 0; i < iterations; i++) {
			mid = low + (high - low) / 2;
			let height = movementDist * mid;

			// Construct the capsule geometry in a way where it represents the swept volume of the marble during the last tick.
			(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._halfHeight = height/2;
			
			let marblePosition = this.level.marble.body.getPosition().sub(movementDiff.scale(1 - mid/2));

			this.auxMarbleBody.setPosition(marblePosition);
			this.auxWorld.getContactManager()._updateContacts(); // Update contacts

			let current = this.auxMarbleBody.getContactLinkList();
			let hit = false;
			while (current) {
				let contact = current.getContact();
				contact._updateManifold();
				let contactShape = contact.getShape1();
				if (contactShape === this.auxMarbleShape) contactShape = contact.getShape2();

				if (contact.isTouching() && shapes.has(contactShape)) {
					// We've hit one of the shapes, we don't need to continue searching
					hit = true;
					break;
				}

				current = current.getNext();
			}

			if (hit) {
				// Shorten the capsule
				high = mid;
			} else {
				// Lengthen the capsule
				low = mid;
			}
		}

		return mid;
	}

	/** Computes the completion between the last and current tick that the marble touched the given rigid body in the aux world. */
	computeCompletionOfImpactWithBody(body: OIMO.RigidBody, radiusFactor: number) {
		let shapes = new Set<OIMO.Shape>();
		let current = body.getShapeList();
		while (current) {
			shapes.add(current);
			current = current.getNext();
		}

		return this.computeCompletionOfImpactWithShapes(shapes, radiusFactor);
	}
}