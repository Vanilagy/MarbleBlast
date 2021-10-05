import { MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import OIMO from "../declarations/oimo";
import { TimeState, Level } from "../level";
import { Util } from "../util";
import * as THREE from "three";

/** A trigger is a cuboid-shaped area whose overlap with the marble causes certain events to happen. */
export class Trigger {
	id: number;
	vertices: THREE.Vector3[];
	body: OIMO.RigidBody;
	level: Level;
	element: MissionElementTrigger;

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
		let p5 = origin.add(d1).add(d2);
		let p6 = origin.add(d1).add(d3);
		let p7 = origin.add(d2).add(d3);
		let p8 = origin.add(d1).add(d2).add(d3);

		let mat = new THREE.Matrix4();
		mat.compose(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		// Apply the transformation matrix to each vertex
		let vertices = [p1, p2, p3, p4, p5, p6, p7, p8]
			.map((vert) => Util.vecOimoToThree(vert).applyMatrix4(mat));
		this.vertices = vertices;

		// Triggers ignore the actual shape of the polyhedron and simply use its AABB.
		let aabb = Util.createAabbFromVectors(vertices);

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
	}

	onMarbleInside(time: TimeState) {}
	onMarbleEnter(time: TimeState) {}
	onMarbleLeave(time: TimeState) {}
	tick(time: TimeState) {}
	reset() {}
}