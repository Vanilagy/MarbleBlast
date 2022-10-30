import { MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import { TimeState, Level } from "../level";
import { Util } from "../util";
import { ConvexHullCollisionShape } from "../physics/collision_shape";
import { RigidBody, RigidBodyType } from "../physics/rigid_body";
import { Vector3 } from "../math/vector3";
import { Box3 } from "../math/box3";
import { Matrix4 } from "../math/matrix4";

/** A trigger is a cuboid-shaped area whose overlap with the marble causes certain events to happen. */
export class Trigger {
	id: number;
	vertices: Vector3[];
	body: RigidBody;
	level: Level;
	element: MissionElementTrigger;
	sounds: string[] = [];
	isCurrentlyColliding = false;

	constructor(element: MissionElementTrigger, level: Level) {
		this.id = element._id;
		this.element = element;
		this.level = level;

		// Parse the "polyhedron"
		let coordinates = MisParser.parseNumberList(element.polyhedron);
		let origin = new Vector3(coordinates[0], coordinates[1], coordinates[2]);
		let d1 = new Vector3(coordinates[3], coordinates[4], coordinates[5]);
		let d2 = new Vector3(coordinates[6], coordinates[7], coordinates[8]);
		let d3 = new Vector3(coordinates[9], coordinates[10], coordinates[11]);

		// Create the 8 points of the parallelepiped
		let p1 = origin.clone();
		let p2 = origin.clone().add(d1);
		let p3 = origin.clone().add(d2);
		let p4 = origin.clone().add(d3);
		let p5 = origin.clone().add(d1).add(d2);
		let p6 = origin.clone().add(d1).add(d3);
		let p7 = origin.clone().add(d2).add(d3);
		let p8 = origin.clone().add(d1).add(d2).add(d3);

		let mat = new Matrix4();
		mat.compose(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		// Apply the transformation matrix to each vertex
		let vertices = [p1, p2, p3, p4, p5, p6, p7, p8].map(x => x.applyMatrix4(mat));
		this.vertices = vertices;

		// Triggers ignore the actual shape of the polyhedron and simply use its AABB.
		let aabb = new Box3().setFromPoints(vertices);

		let aabbVertices = Util.getBoxVertices(aabb);

		// Create the collision geometry
		let ownShape = new ConvexHullCollisionShape(aabbVertices);
		ownShape.collisionDetectionMask = 0b100; // Collide with the small aux marble

		let body = new RigidBody();
		body.type = RigidBodyType.Static;
		body.addCollisionShape(ownShape);

		this.body = body;

		// Init collision handlers

		body.onBeforeIntegrate = () => {
			if (this.isCurrentlyColliding && body.collisions.length === 0) {
				this.isCurrentlyColliding = false;
				this.onMarbleLeave();
			}
		};

		body.onBeforeCollisionResponse = () => {
			if (!this.isCurrentlyColliding) this.onMarbleEnter();
			this.onMarbleInside();

			this.isCurrentlyColliding = true;
		};

		this.reset();
	}

	async init() {
		// Preload all sounds
		for (let sound of this.sounds) {
			await this.level.audio.loadBuffer(sound);
		}
	}

	reset() {
		this.isCurrentlyColliding = false;
	}

	/* eslint-disable  @typescript-eslint/no-unused-vars */
	onMarbleInside() {}
	onMarbleEnter() {}
	onMarbleLeave() {}
	tick(time: TimeState) {}
}