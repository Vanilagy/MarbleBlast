import { Level, PHYSICS_TICK_RATE } from "./level";
import { PathedInterior } from "./pathed_interior";
import OIMO from "./declarations/oimo";
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
	capsules = new WeakMap<OIMO.World, OIMO.RigidBody>();

	/** Maps userdata to a shape */
	shapeLookup = new Map<any, Shape>();
	shapeColliderLookup = new Map<any, Shape>();
	triggerLookup = new Map<any, Trigger>();
	/** Shapes that recently were involved in a collision. */
	objectImmunity = new Set<Shape | Interior>();
	/** Remember which shapes or triggers we're currently inside. */
	shapeOrTriggerInside = new Set<Shape | Trigger>();
	interiorLookup = new Map<any, Interior>();

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
		this.interiorLookup.set(interior.id, interior);

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
		let marble = this.level.marble;

		let gravityBefore = this.world.getGravity().clone();
		if (this.level.finishTime) {
			// Slow down the marble when it's in the finish and disable gravity
			let vel = marble.body.getLinearVelocity();
			vel.scaleEq(0.9);
			marble.body.setLinearVelocity(vel);

			this.world.setGravity(new OIMO.Vec3());
		}

		// Before we tick the physics, perform a CCD step to potentially move the marble to the next exact collision point
		let { stepSize, collisionFound } = this.performStaticCcd();
		let prevMarblePosition = marble.body.getPosition().clone();
		let prevMarbleTransform = marble.body.getTransform().clone();
		let prevMarbleVelocity = marble.body.getLinearVelocity();

		let normalsBefore = [];
		if (stepSize === 1) {
			// To prevent internal edge hits later, remember all contact normals before stepping the physics
			let contactList = marble.body.getContactLinkList();
			while (contactList) {
				let contact = contactList.getContact();
				if (contact.isTouching()) normalsBefore.push(contact.getManifold().getNormal());
				contactList = contactList.getNext();
			}
		}

		this.world.step(1 / PHYSICS_TICK_RATE);
		this.world.setGravity(gravityBefore);
		marble.body.setPosition(Util.lerpOimoVectors(prevMarblePosition, marble.body.getPosition(), stepSize)); // Because OIMO is weird, we perform a full-size timestep and then revert the position back to fit the step size. Oof.
		
		// Now, we try to detect internal edge hits and correct them. An internal edge hit is hitting an edge that is not visible to the outside, i.e. the surface there is continuous
		if (stepSize === 1 && !collisionFound) {
			let biggestAngle = -Infinity;
			let contactList = marble.body.getContactLinkList();
			while (contactList) {
				let contact = contactList.getContact();
				if (contact.isTouching()) {
					// Find the vector with the largest angle (smallest dot product)
					let dot = Math.min(...normalsBefore.map(x => x.dot(contact.getManifold().getNormal())));
					let angle = Math.acos(Util.clamp(dot, -1, 1));
					biggestAngle = Math.max(angle, biggestAngle);
				}
				
				contactList = contactList.getNext();
			}
	
			if (biggestAngle > 0.05 && biggestAngle < 1.5) {
				// When we're here, we assume we've hit an internal edge. So, override the stepped marble with a simple linear extrapolation of the previous position.
				marble.body.setPosition(prevMarblePosition.add(prevMarbleVelocity.scale(1 / PHYSICS_TICK_RATE).addEq(this.world.getGravity().scale(0.2 * -0.5 / PHYSICS_TICK_RATE**2))));
				marble.body.setLinearVelocity(prevMarbleVelocity.normalize().scale(marble.body.getLinearVelocity().length()));
			}
		}

		let currentMarblePosition = marble.body.getPosition();
		let movementDiff = currentMarblePosition.sub(prevMarblePosition);
		let movementDist = movementDiff.length();

		/** A list of collision events that happened between the last and current tick. */
		let collisionCorrectionEvents: CollisionCorrectionEvent[] = [];
		// Do CCD with pathed interiors
		this.checkPathedInteriorCollision(prevMarblePosition, prevMarbleTransform, collisionCorrectionEvents);

		// Pick the earliest collision event
		let collisionEvent = collisionCorrectionEvents[0];
		for (let event of collisionCorrectionEvents) {
			if (event.fraction < collisionEvent.fraction) collisionEvent = event;
		}

		if (collisionEvent) {
			if (collisionEvent.interior) {
				// If we hit a pathed interior, we position both the marble and the interior at the predicted point of impact and then run a simulation step.
				let intPos = Util.vecThreeToOimo(collisionEvent.interior.prevPosition).addScaledEq(collisionEvent.interiorMovement, collisionEvent.fraction);
				collisionEvent.interior.body.setPosition(intPos);

				let marblePos = collisionEvent.position.addScaled(collisionEvent.interiorMovement, collisionEvent.fraction);
				marble.body.setPosition(marblePos);

				this.world.step(1 / PHYSICS_TICK_RATE * 1); // Alright, the fact that we do a full physics step here is quite unrealistic, but with the small step, the marble was often sticking to the interior. That's a much greater inaccuracy than the one caused from a large timestep.
			} else {
				// TODO: I think this... case can't be hit anymore? lol
				// We hit static geometry; move the marble to the point of impact and perform a small simulation step.
				let stepFraction = Util.clamp(1 - collisionEvent.fraction, 0.05, 0.95);

				marble.body.setPosition(collisionEvent.position);
				this.world.step(1 / PHYSICS_TICK_RATE * stepFraction);
			}
		}

		this.callCollisionHandlers(movementDiff, movementDist);
	}

	/** Performs continuous collision detect with static objects. */
	performStaticCcd() {
		let marble = this.level.marble;
		let movementDiff = marble.body.getLinearVelocity().scaleEq(1 / PHYSICS_TICK_RATE);

		let stepSize = 1;
		let reduction = 0.1; // To avoid finding a collision with the surface the marble is currently rolling on
		// Search for the first intersect if we were to move the marble in a straight line given its current position and velocity
		let { mid, collisionNormal } = this.findSweptSphereIntersection(this.world, MARBLE_RADIUS * (1 - reduction), marble.body.getPosition(), movementDiff, 24,
			(x) => x !== marble.shape && x.getRigidBody().getType() === OIMO.RigidBodyType.STATIC // Make sure to ignore pathed interiors
		, MARBLE_RADIUS * reduction);

		outer:
		if (mid > 0 && mid < 1) {
			let dot = Math.abs(movementDiff.dot(collisionNormal));
			//if (dot < 0.05) break outer; // Not needed?

			// Snap the marble to the exact point of collision
			let pos = marble.body.getPosition().addScaledEq(movementDiff, mid);
			this.level.marble.body.setPosition(pos);

			stepSize = 1 - mid;
		}

		return { stepSize, collisionFound: !!collisionNormal };
	}

	checkPathedInteriorCollision(prevMarblePosition: OIMO.Vec3, prevMarbleTransform: OIMO.Transform, collisionCorrectionEvents: CollisionCorrectionEvent[]) {
		// CCD with two moving objects (the marble and the interior) is harder, but can be boiled down to the static-moving case with a simple change of reference frame: We pretend the moving interior is static and only the marble is moving relative to its view. Then we can perform a simple convex cast again to find the moment of impact and advance from there.

		let currentMarblePosition = this.level.marble.body.getPosition();

		for (let interior of this.level.interiors) {
			if (!(interior instanceof PathedInterior)) continue;
			if (interior.body.getType() === OIMO.RigidBodyType.STATIC) continue;
			if (!interior.hasCollision) continue;

			let interiorMovement =  Util.vecThreeToOimo(interior.currentPosition.clone().sub(interior.prevPosition));
			let body = this.pathedInteriorBodies.get(interior);

			// Add the interior to the world temporarily
			this.pathedInteriorCollisionWorld.addRigidBody(body);
			body.setPosition(Util.vecThreeToOimo(interior.prevPosition));

			// Subtract the interior's movement from the marble's movement to get the marble's movement from the interior's POV
			let translationVec = currentMarblePosition.sub(prevMarblePosition).subEq(interiorMovement);
			let transform = prevMarbleTransform.clone();
			// Make the "ray" start earlier and go farther to detect more collisions.
			transform.setPosition(prevMarblePosition.addScaled(translationVec, -1));
			translationVec.scaleEq(3);

			this.pathedInteriorCollisionWorld.convexCast(this.marbleGeometry, transform, translationVec, {
				process(shape, hit) {
					let fraction = hit.fraction * 3 - 1; // Readjust the fraction because we scaled the translationVec
					if (fraction < -0.1 || fraction > 1.1) return; // The collision is outside of the desired range

					let movementDot = hit.normal.dot(translationVec.scale(PHYSICS_TICK_RATE / 3));
					if (movementDot < 0) {
						hit.normal.scaleEq(-1);
						movementDot *= -1;
					}

					if (movementDot < MARBLE_RADIUS * PHYSICS_TICK_RATE) return; // The marble impacted the surface slow enough that discrete collision detection is enough to handle it.

					// Nudge the position back a bit so that it *just* touches the surface.
					let position = hit.position.clone().addScaledEq(hit.normal, -MARBLE_RADIUS * 0.95);

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
		let newImmunity: (Shape | Interior)[] = [];
		let calledObjects = new Set<Shape | Interior>();
		let linkedList = this.level.marble.body.getContactLinkList();
		while (linkedList) {
			let contact = linkedList.getContact();
			let contactShape = contact.getShape1();
			if (contactShape === this.level.marble.shape) contactShape = contact.getShape2();

			if (contactShape.userData && contact.isTouching()) {
				let object: Shape | Interior;
				object = this.shapeLookup.get(contactShape.userData) ?? this.interiorLookup.get(contactShape.userData);

				if (object && !this.objectImmunity.has(object) && !calledObjects.has(object)) {
					// We found a valid collision with an object
					calledObjects.add(object);
					let preventImmunity = object.onMarbleContact(this.level.timeState, contact);
					if (!preventImmunity) newImmunity.push(object);
				}
			}

			linkedList = linkedList.getNext();
		}

		this.objectImmunity.clear();
		for (let s of newImmunity) this.objectImmunity.add(s);

		let movementRot = new OIMO.Quat();
		movementRot.setArc(new OIMO.Vec3(0, 1, 0), movementDiff.clone().normalize());

		// Construct the capsule geometry in a way where it represents the swept volume of the marble during the last tick.
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._halfHeight = movementDist/2;
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._radius = MARBLE_RADIUS * 2; // The normal game's hitbox can expand to up to sqrt(3)x the normal size, but since we're using a sphere, let's be generous and make it 2x
		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._gjkMargin = MARBLE_RADIUS * 2; // We gotta update this value too
		let marblePosition = this.level.marble.body.getPosition().addScaledEq(movementDiff, -0.5);

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
		this.objectImmunity.clear();
		this.shapeOrTriggerInside.clear();
	}

	/** Performs a swept-sphere intersection test and finds the first point of collision. */
	findSweptSphereIntersection(world: OIMO.World, radius: number, start: OIMO.Vec3, translation: OIMO.Vec3, iterations: number, collisionCondition: (contactShape: OIMO.Shape) => boolean, addedLength = 0) {
		let capsuleBody = this.capsules.get(world);
		let capsuleGeom: OIMO.CapsuleGeometry;
		let capsuleShape: OIMO.Shape;

		if (!capsuleBody) {
			// Create the capsule shape
			capsuleGeom = new OIMO.CapsuleGeometry(radius, 0); // Radius will be changed on the fly anyway
			capsuleShape = new OIMO.Shape(new OIMO.ShapeConfig());
			capsuleShape._geom = capsuleGeom;
			capsuleBody = new OIMO.RigidBody(new OIMO.RigidBodyConfig());
			capsuleBody.addShape(capsuleShape);
			this.capsules.set(world, capsuleBody);
		} else {
			capsuleGeom = capsuleBody.getShapeList().getGeometry() as OIMO.CapsuleGeometry;
			capsuleShape = capsuleBody.getShapeList();
		}

		let movementRot = new OIMO.Quat();
		movementRot.setArc(new OIMO.Vec3(0, 1, 0), translation.clone().normalize());
		capsuleBody.setOrientation(movementRot);
		capsuleGeom._radius = radius;
		capsuleGeom._gjkMargin = radius; // We gotta update this value too

		world.addRigidBody(capsuleBody);

		let low = -1 / (2**iterations - 2); // Hack the binary search a bit to allow results of 0 and 1 as well
		let high = 1 - low;
		let mid: number;
		let translationLength = translation.length();
		let collisionNormal: OIMO.Vec3 = null;

		for (let i = 0; i < iterations; i++) {
			mid = low + (high - low) / 2;

			// Construct the capsule geometry in a way where it represents a swept volume of a sphere
			let height = translationLength * mid + addedLength
			capsuleGeom._halfHeight = height/2;
			let capsulePosition = start.addScaled(translation, mid / 2);
			capsuleBody.setPosition(capsulePosition);
			world.getContactManager()._updateContacts(); // Update contacts

			let current = capsuleBody.getContactLinkList();
			let hit = false;
			while (current) {
				let contact = current.getContact();
				contact._updateManifold();
				let contactShape = contact.getShape1();
				if (contactShape === capsuleShape) contactShape = contact.getShape2();

				if (contact.isTouching() && collisionCondition(contactShape)) {
					// We've hit one of the shapes, we don't need to continue searching
					hit = true;
					collisionNormal = contact.getManifold().getNormal();
					if (contactShape = contact.getShape2()) collisionNormal.scaleEq(-1);

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

		world.removeRigidBody(capsuleBody);

		return { mid, collisionNormal };
	}

	/** Computes the completion between the last and current tick that the marble touched the given shapes in the aux world. */
	computeCompletionOfImpactWithShapes(shapes: Set<OIMO.Shape>, radiusFactor: number) {
		let movementDiff = this.level.marble.body.getPosition().subEq(this.level.marble.lastPos);
		// 5 iters are enough to ensure ~0.26ms accuracy
		return this.findSweptSphereIntersection(this.auxWorld, MARBLE_RADIUS * radiusFactor, this.level.marble.lastPos, movementDiff, 5, (x) => shapes.has(x)).mid;
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