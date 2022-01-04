import { MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import OIMO from "../declarations/oimo";
import { TimeState, Level } from "../level";
import { Util } from "../util";
import * as THREE from "three";
import { AudioManager } from "../audio";
import { ConvexHullCollisionShape } from "../physics/collision_shape";
import { RigidBody, RigidBodyType } from "../physics/rigid_body";

/** A trigger is a cuboid-shaped area whose overlap with the marble causes certain events to happen. */
export class Trigger {
	id: number;
	vertices: THREE.Vector3[];
	body: OIMO.RigidBody;
	ownBody: RigidBody;
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
		let origin = new OIMO.Vec3(coordinates[0], coordinates[1], coordinates[2]);
		let d1 = new OIMO.Vec3(coordinates[3], coordinates[4], coordinates[5]);
		let d2 = new OIMO.Vec3(coordinates[6], coordinates[7], coordinates[8]);
		let d3 = new OIMO.Vec3(coordinates[9], coordinates[10], coordinates[11]);

		// Create the 8 points of the parallelepiped
		let p1 = origin.clone();
		let p2 = origin.add(d1);
		let p3 = origin.add(d2);
		let p4 = origin.add(d3);
		let p5 = origin.add(d1).addEq(d2);
		let p6 = origin.add(d1).addEq(d3);
		let p7 = origin.add(d2).addEq(d3);
		let p8 = origin.add(d1).addEq(d2).addEq(d3);

		let mat = new THREE.Matrix4();
		mat.compose(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		// Apply the transformation matrix to each vertex
		let vertices = [p1, p2, p3, p4, p5, p6, p7, p8]
			.map((vert) => Util.vecOimoToThree(vert).applyMatrix4(mat));
		this.vertices = vertices;

		// Triggers ignore the actual shape of the polyhedron and simply use its AABB.
		let aabb = new THREE.Box3().setFromPoints(vertices);

		let aabbVertices = Util.getBoxVertices(aabb);

		// Create the collision geometry
		let geometry = new OIMO.BoxGeometry(new OIMO.Vec3((aabb.max.x - aabb.min.x) / 2, (aabb.max.y - aabb.min.y) / 2, (aabb.max.z - aabb.min.z) / 2));
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = geometry;
		let shape = new OIMO.Shape(shapeConfig);
		shape.userData = this.id;
		let bodyConfig = new OIMO.RigidBodyConfig();
		bodyConfig.type = OIMO.RigidBodyType.STATIC;
		let body = new OIMO.RigidBody(bodyConfig);
		body.addShape(shape);
		body.setPosition(new OIMO.Vec3(Util.avg(aabb.max.x, aabb.min.x), Util.avg(aabb.max.y, aabb.min.y), Util.avg(aabb.max.z, aabb.min.z)));

		this.body = body;

		let ownShape = new ConvexHullCollisionShape(aabbVertices);
		ownShape.collisionDetectionMask = 0b100; // Collide with the small aux marble

		let ownBody = new RigidBody();
		ownBody.type = RigidBodyType.Static;
		ownBody.addCollisionShape(ownShape);

		this.ownBody = ownBody;

		// Init collision handlers

		ownBody.onBeforeIntegrate = () => {
			if (this.isCurrentlyColliding && ownBody.collisions.length === 0) {
				this.isCurrentlyColliding = false;
				this.onMarbleLeave();
			}
		};

		ownBody.onBeforeCollisionResponse = () => {
			if (!this.isCurrentlyColliding) this.onMarbleEnter();
			this.onMarbleInside();

			this.isCurrentlyColliding = true;
		};

		this.reset();
	}

	async init() {
		// Preload all sounds
		for (let sound of this.sounds) {
			await AudioManager.loadBuffer(sound);
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