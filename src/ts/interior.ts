import { DifFile, InteriorDetailLevel } from "./parsing/dif_parser";
import * as THREE from "three";
import OIMO from "./declarations/oimo";
import { ResourceManager } from "./resources";
import { TimeState } from "./level";
import { Util } from "./util";

const specialFriction: Record<string, number> = {
	"friction_high": 1.5,
	"friction_low": 0.2,
	"friction_none": 0.001,
	"friction_ramp_yellow": 2.0
};
const specialResistutionFactor: Record<string, number> = {
	"friction_high": 0.35,
	"friction_low": 0.5,
	"friction_none": 0.5
};
const specialMaterials = new Set(Object.keys(specialFriction));

export class Interior {
	dif: DifFile;
	group: THREE.Group;
	body: OIMO.RigidBody;
	detailLevel: DifFile["detailLevels"][number];
	worldMatrix = new THREE.Matrix4();

	constructor(file: DifFile, subObjectIndex?: number) {
		this.group = new THREE.Group();
		this.dif = file;
		this.detailLevel = (subObjectIndex === undefined)? file.detailLevels[0] : file.subObjects[subObjectIndex];

		let rigidBodyConfig =  new OIMO.RigidBodyConfig();
		rigidBodyConfig.type = (subObjectIndex === undefined)? OIMO.RigidBodyType.STATIC : OIMO.RigidBodyType.KINEMATIC;
		this.body = new OIMO.RigidBody(rigidBodyConfig);
	}

	async init() {
		let geometry = new THREE.Geometry();
		geometry.vertices.push(...this.detailLevel.points.map((vert) => new THREE.Vector3(vert.x, vert.y, vert.z)));
		for (let surface of this.detailLevel.surfaces) {
			await this.addSurface(surface, geometry);
		}
		geometry.computeFaceNormals();
		// No need to compute vertex normals here because interiors aren't shaded smoothly

		let materials: THREE.Material[] = [];
		for (let i = 0; i < this.detailLevel.materialList.materials.length; i++) {
			let mat = new THREE.MeshLambertMaterial();
			materials.push(mat);

			if (ResourceManager.getFullNameOf("interiors/" + this.detailLevel.materialList.materials[i]).length) {
				let texture = await ResourceManager.getTexture("interiors/" + this.detailLevel.materialList.materials[i] + '.jpg');
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
	
				mat.map = texture;
			}
		}

		let mesh = new THREE.Mesh(geometry, materials);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.group.add(mesh);

		this.buildCollisionGeometry();
	}

	async addSurface(surface: InteriorDetailLevel["surfaces"][number], geometry: THREE.Geometry) {
		let detailLevel = this.detailLevel;
		let texGenEqs = detailLevel.texGenEqs[surface.texGenIndex];
		let planeX = new THREE.Plane(new THREE.Vector3(texGenEqs.planeX.x, texGenEqs.planeX.y, texGenEqs.planeX.z), texGenEqs.planeX.d);
		let planeY = new THREE.Plane(new THREE.Vector3(texGenEqs.planeY.x, texGenEqs.planeY.y, texGenEqs.planeY.z), texGenEqs.planeY.d);

		let k = 0;
		for (let i = surface.windingStart; i < surface.windingStart + surface.windingCount - 2; i++) {
			let i1 = this.detailLevel.windings[i];
			let i2 = this.detailLevel.windings[i+1];
			let i3 = this.detailLevel.windings[i+2];

			if (k%2 === 0) {
				let temp = i1;
				i1 = i3;
				i3 = temp;
			}

			let face = new THREE.Face3(i1, i2, i3);
			let uvs = [i1, i2, i3].map((index) => {
				let point = this.detailLevel.points[index];
				let u = planeX.distanceToPoint(new THREE.Vector3(point.x, point.y, point.z));
				let v = planeY.distanceToPoint(new THREE.Vector3(point.x, point.y, point.z));

				return new THREE.Vector2(u, v);
			});

			face.materialIndex = surface.textureIndex;

			geometry.faceVertexUvs[0].push(uvs);
			geometry.faces.push(face);

			k++;
		}
	}

	buildCollisionGeometry() {
		const addShape = (vertices: OIMO.Vec3[], material: string) => {
			let geometry = new OIMO.ConvexHullGeometry(vertices);
			let shapeConfig = new OIMO.ShapeConfig();
			shapeConfig.geometry = geometry;
			shapeConfig.restitution = 0.5 * (specialResistutionFactor[material] ?? 1);
			shapeConfig.friction = specialFriction[material] ?? 1;
			let shape = new OIMO.Shape(shapeConfig);
			this.body.addShape(shape);
		};

		for (let i = 0; i < this.detailLevel.convexHulls.length; i++) {
			let hull = this.detailLevel.convexHulls[i];
			let vertices: OIMO.Vec3[] = [];

			for (let j = hull.hullStart; j < hull.hullStart + hull.hullCount; j++) {
				let point = this.detailLevel.points[this.detailLevel.hullIndices[j]];
				vertices.push(new OIMO.Vec3(point.x, point.y, point.z));
			}

			let materials = new Set();
			let firstMaterial: string;

			for (let j = hull.surfaceStart; j < hull.surfaceStart + hull.surfaceCount; j++) {
				let surface = this.detailLevel.surfaces[this.detailLevel.hullSurfaceIndices[j]];
				let material = this.detailLevel.materialList.materials[surface.textureIndex];
				materials.add(material);
				firstMaterial = material;
			}

			// In case there is more than one material and one of them is special, generate geometry directly from the surfaces instead of from the convex hull.
			if (materials.size > 1 && Util.setsHaveOverlap(materials, specialMaterials)) {
				for (let j = hull.surfaceStart; j < hull.surfaceStart + hull.surfaceCount; j++) {
					let surface = this.detailLevel.surfaces[this.detailLevel.hullSurfaceIndices[j]];
					let material = this.detailLevel.materialList.materials[surface.textureIndex];

					let vertices: OIMO.Vec3[] = [];
					for (let k = surface.windingStart; k < surface.windingStart + surface.windingCount; k++) {
						let point = this.detailLevel.points[this.detailLevel.windings[k]];
						vertices.push(new OIMO.Vec3(point.x, point.y, point.z));
					}

					addShape(vertices, material);
				}
			} else {
				addShape(vertices, firstMaterial);
			}
		}
	}

	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion) {
		this.group.position.copy(position);
		this.group.quaternion.copy(orientation);
		this.worldMatrix.compose(position, orientation, new THREE.Vector3(1, 1, 1));

		this.body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
		this.body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
	}

	tick(time: TimeState) {}
}