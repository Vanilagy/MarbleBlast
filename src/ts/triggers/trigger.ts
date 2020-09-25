import { MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import OIMO from "../declarations/oimo";
import { getUniqueId } from "../state";
import { TimeState } from "../level";
import { Util } from "../util";
import * as THREE from "three";

export class Trigger {
	id: number;
	body: OIMO.RigidBody;

	constructor(element: MissionElementTrigger) {
		this.id = getUniqueId();

		let coordinates = element.polyhedron.split(' ').map((part) => Number(part));
		let origin = new OIMO.Vec3(coordinates[0], coordinates[1], coordinates[2]);
		let d1 = new OIMO.Vec3(coordinates[3], coordinates[4], coordinates[5]);
		let d2 = new OIMO.Vec3(coordinates[6], coordinates[7], coordinates[8]);
		let d3 = new OIMO.Vec3(coordinates[9], coordinates[10], coordinates[11]);

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

		let vertices = [p1, p2, p3, p4, p5, p6, p7, p8]
			.map((vert) => Util.vecOimoToThree(vert).applyMatrix4(mat))
			.map((vert) => Util.vecThreeToOimo(vert));

		let geometry = new OIMO.ConvexHullGeometry(vertices);
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = geometry;
		let shape = new OIMO.Shape(shapeConfig);
		shape.userData = this.id;
		let bodyConfig = new OIMO.RigidBodyConfig();
		bodyConfig.type = OIMO.RigidBodyType.STATIC;
		let body = new OIMO.RigidBody(bodyConfig);
		body.addShape(shape);

		this.body = body;
	}

	onMarbleInside(time: TimeState) {}
	onMarbleEnter(time: TimeState) {}
	onMarbleLeave(time: TimeState) {}
}