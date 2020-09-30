import { Level, PHYSICS_TICK_RATE } from "./level";
import { PathedInterior } from "./pathed_interior";
import OIMO from "./declarations/oimo";
import { Util } from "./util";
import { Interior } from "./interior";
import { Shape } from "./shape";
import { Trigger } from "./triggers/trigger";

interface CollisionCorrectionEvent {
	fraction: number,
	position: OIMO.Vec3,
	interior?: PathedInterior,
	interiorMovement?: OIMO.Vec3
}

export class PhysicsHelper {
	level: Level;
	world: OIMO.World;

	pathedInteriorCollisionWorld: OIMO.World;
	pathedInteriorBodies: Map<PathedInterior, OIMO.RigidBody>;
	marbleGeometry = new OIMO.SphereGeometry(0.2);

	auxWorld: OIMO.World;
	auxMarbleShape: OIMO.Shape;
	auxMarbleBody: OIMO.RigidBody;

	shapeLookup = new Map<any, Shape>();
	shapeColliderLookup = new Map<any, Shape>();
	triggerLookup = new Map<any, Trigger>();
	shapeImmunity = new Set<Shape>();
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

		let auxMarbleGeometry = new OIMO.CapsuleGeometry(0.2 * 2, 0); // The normal game's hitbox can expand to up to sqrt(3)x the normal size, but since we're using a sphere, let's be generous and make it 2x
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
				this.auxWorld.addRigidBody(trigger.body);
				this.triggerLookup.set(trigger.id, trigger);
			}

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

		let gravityBefore = this.world.getGravity().clone();
		if (this.level.finishTime) {
			let vel = this.level.marble.body.getLinearVelocity();
			vel.scaleEq(0.9);
			this.level.marble.body.setLinearVelocity(vel);

			this.world.setGravity(new OIMO.Vec3());
		}
		this.world.step(1 / PHYSICS_TICK_RATE);
		this.world.setGravity(gravityBefore);
		// I know it's kind of strange to update interiors later, but this actually made them in-sync with the marble.
		for (let interior of this.level.interiors) interior.tick(this.level.timeState);

		let currentMarblePosition = this.level.marble.body.getPosition();
		let currentMarbleVelocity = this.level.marble.body.getLinearVelocity();
		
		let movementDiff = currentMarblePosition.sub(prevMarblePosition);
		let movementDist = movementDiff.length();

		let collisionCorrectionEvents: CollisionCorrectionEvent[] = [];

		this.world.convexCast(this.marbleGeometry, prevMarbleTransform, movementDiff, {
			process(shape, hit) {
				if (shape.getRigidBody().getType() !== OIMO.RigidBodyType.STATIC) return;

				let movementDot = hit.normal.dot(currentMarbleVelocity);
				if (movementDot < 0) {
					hit.normal = hit.normal.scale(-1);
					movementDot *= -1;
				}

				if (movementDot < 24) return;
				
				let position = hit.position.clone().sub(hit.normal.scale(0.2 * 0.9));
				let fraction = position.sub(prevMarblePosition).length() / movementDist;
				if (fraction < 0 || fraction > 1) return;

				collisionCorrectionEvents.push({ fraction: hit.fraction, position });
			}
		});
		this.checkPathedInteriorCollision(prevMarblePosition, prevMarbleTransform, collisionCorrectionEvents);

		let collisionEvent = collisionCorrectionEvents[0];
		for (let event of collisionCorrectionEvents) {
			if (event.fraction < collisionEvent.fraction) collisionEvent = event;
		}

		if (collisionEvent) {
			if (collisionEvent.interior) {
				let intPos = Util.vecThreeToOimo(collisionEvent.interior.prevPosition).add(collisionEvent.interiorMovement.scale(collisionEvent.fraction));
				collisionEvent.interior.body.setPosition(intPos);
				collisionEvent.interior.group.position.copy(Util.vecOimoToThree(intPos));

				let marblePos = collisionEvent.position.add(collisionEvent.interiorMovement.scale(collisionEvent.fraction));
				this.level.marble.body.setPosition(marblePos);

				this.world.step(1 / PHYSICS_TICK_RATE * 1); // Alright, the fact that we do a full physics step here is quite unrealistic, but with the small step, the marble was often sticking to the interior. That's a much greater inaccuracy than the one caused from a large timestep.
			} else {
				let stepFraction = Util.clamp(1 - collisionEvent.fraction, 0.05, 0.95);

				this.level.marble.body.setPosition(collisionEvent.position);
				this.world.step(1 / PHYSICS_TICK_RATE * stepFraction);
			}
		}

		this.callCollisionHandlers(movementDiff, movementDist);
	}

	checkPathedInteriorCollision(prevMarblePosition: OIMO.Vec3, prevMarbleTransform: OIMO.Transform, collisionCorrectionEvents: CollisionCorrectionEvent[]) {
		let currentMarblePosition = this.level.marble.body.getPosition();

		for (let interior of this.level.interiors) {
			if (!(interior instanceof PathedInterior)) continue;
			if (interior.body.getType() === OIMO.RigidBodyType.STATIC) continue;

			let interiorMovement =  Util.vecThreeToOimo(interior.group.position.clone().sub(interior.prevPosition));
			let body = this.pathedInteriorBodies.get(interior);

			this.pathedInteriorCollisionWorld.addRigidBody(body);
			body.setPosition(Util.vecThreeToOimo(interior.prevPosition));

			let translationVec = (currentMarblePosition.sub(prevMarblePosition)).sub(interiorMovement);
			let transform = prevMarbleTransform.clone();
			transform.setPosition(prevMarblePosition.sub(translationVec.scale(1)));
			translationVec = translationVec.scale(3);

			this.pathedInteriorCollisionWorld.convexCast(this.marbleGeometry, transform, translationVec, {
				process(shape, hit) {
					let fraction = hit.fraction * 3 - 1;
					if (fraction < -0.1 || fraction > 1.1) return;

					let movementDot = hit.normal.dot(translationVec.scale(PHYSICS_TICK_RATE / 3));
					if (movementDot < 0) {
						hit.normal = hit.normal.scale(-1);
						movementDot *= -1;
					}

					if (movementDot < 24) return;

					let position = hit.position.clone().sub(hit.normal.scale(0.2 * 0.95));

					collisionCorrectionEvents.push({
						interior: interior as PathedInterior,
						interiorMovement, position, fraction
					});
				}
			});

			this.pathedInteriorCollisionWorld.removeRigidBody(body);
		}
	}

	callCollisionHandlers(movementDiff: OIMO.Vec3, movementDist: number) {
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
					calledShapes.add(shape);
					newImmunity.push(shape);
					shape.onMarbleContact(contact, this.level.timeState);
				}
			}

			linkedList = linkedList.getNext();
		}

		this.shapeImmunity.clear();
		for (let s of newImmunity) this.shapeImmunity.add(s);

		let movementRot = new OIMO.Quat();
		movementRot.setArc(new OIMO.Vec3(0, 1, 0), movementDiff.clone().normalize());

		(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._halfHeight = movementDist;
		let marblePosition = this.level.marble.body.getPosition().add(movementDiff.scale(0.5));

		this.auxMarbleBody.setPosition(marblePosition);
		this.auxMarbleBody.setOrientation(movementRot);
		this.auxWorld.getContactManager()._updateContacts();

		let inside = new Set<Shape | Trigger>();
		let current = this.auxMarbleBody.getContactLinkList();
		while (current) {
			let contact = current.getContact();
			contact._updateManifold();
			let contactShape = contact.getShape1();
			if (contactShape === this.auxMarbleShape) contactShape = contact.getShape2();

			let object = this.shapeLookup.get(contactShape.userData) ?? this.triggerLookup.get(contactShape.userData);

			if (!object) {
				if (contact.isTouching()) {
					object = this.shapeColliderLookup.get(contactShape.userData);
					object.onColliderInside(contactShape.userData);
				}
			} else if (contact.isTouching()) {
				object.onMarbleInside(this.level.timeState);
				if (!this.shapeOrTriggerInside.has(object)) {
					this.shapeOrTriggerInside.add(object);
					object.onMarbleEnter(this.level.timeState);
				}

				inside.add(object);
			}

			current = current.getNext();
		}

		for (let object of this.shapeOrTriggerInside) {
			if (!inside.has(object)) {
				this.shapeOrTriggerInside.delete(object);
				object.onMarbleLeave(this.level.timeState);
			}
		}
	}

	reset() {
		this.shapeImmunity.clear();
		this.shapeOrTriggerInside.clear();
	}
}