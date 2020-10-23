import { DifFile, InteriorDetailLevel } from "./parsing/dif_parser";
import * as THREE from "three";
import OIMO from "./declarations/oimo";
import { TimeState, Level } from "./level";
import { Util, MaterialGeometry } from "./util";
import { Point3F } from "./parsing/binary_file_parser";

export const INTERIOR_DEFAULT_FRICTION = 1;
export const INTERIOR_DEFAULT_RESTITUTION = 0.5;
const SMOOTH_SHADING_ANGLE_THRESHOLD = Math.cos(Util.degToRad(15));

const specialFriction: Record<string, number> = {
	"friction_high": 1.5,
	"friction_low": 0.025,
	"friction_none": 0.001,
	"friction_ramp_yellow": 2.0
};
const specialResistutionFactor: Record<string, number> = {
	"friction_high": 0.35,
	"friction_low": 0.5,
	"friction_none": 0.5
};
const specialMaterials = new Set(Object.keys(specialFriction));

/** Stores a list of all vertices with similar face normal. */
interface VertexBucket {
	referenceNormal: THREE.Vector3,
	/** The index of the material used for each vertex. */
	materialIndices: number[],
	/** The index at which to write the normal vector. */
	normalIndices: number[],
	/** The face normal per vertex. */
	normals: THREE.Vector3[]
}

interface SharedInteriorData {
	instancedMesh: THREE.InstancedMesh,
	instanceIndex: number
}

/** Represents a Torque 3D Interior, used for the main surfaces and geometry of levels. */
export class Interior {
	level: Level;
	dif: DifFile;
	difPath: string;
	mesh: THREE.Mesh;
	/** The collision body of the interior. */
	body: OIMO.RigidBody;
	/** The relevant detail level to read from (non-default for pathed interiors) */
	detailLevel: DifFile["detailLevels"][number];
	worldMatrix = new THREE.Matrix4();
	materialGeometry: MaterialGeometry = [];
	/** Simply contains the file names of the materials without the path to them. */
	materialNames: string[] = [];
	/** The data shared with other interiors with the same detail level (used for instancing). */
	sharedData: SharedInteriorData;
	/** Whether or not to use instancing. Usually true, but not for Macs. */
	useInstancing = true;
	instanceIndex: number;

	constructor(file: DifFile, path: string, level: Level, subObjectIndex?: number) {
		this.dif = file;
		this.difPath = path;
		this.level = level;
		this.detailLevel = (subObjectIndex === undefined)? file.detailLevels[0] : file.subObjects[subObjectIndex];
		this.materialNames = this.detailLevel.materialList.materials.map(x => x.split('/').pop().toLowerCase());

		let rigidBodyConfig =  new OIMO.RigidBodyConfig();
		rigidBodyConfig.type = (subObjectIndex === undefined)? OIMO.RigidBodyType.STATIC : OIMO.RigidBodyType.KINEMATIC;
		this.body = new OIMO.RigidBody(rigidBodyConfig);
		this.useInstancing = !Util.isMac();
	}

	async init() {
		let materials: THREE.Material[] = [];

		// Check if there's already shared data from another interior
		let sharedDataPromise = this.level.sharedInteriorData.get(this.detailLevel);
		if (this.useInstancing && sharedDataPromise) {
			// If so, wait for that interior to complete initiation...
			this.sharedData = await sharedDataPromise;
			this.instanceIndex = ++this.sharedData.instanceIndex;
		} else {
			// If we're here, we're the first interior of this type, so let's prepare the shared data (if we're instanced)
			let resolveFunc: (data: SharedInteriorData) => any;
			if (this.useInstancing && this.level) {
				let sharedDataPromise = new Promise<SharedInteriorData>((resolve) => resolveFunc = resolve);
				this.level.sharedInteriorData.set(this.detailLevel, sharedDataPromise);
			}

			for (let i = 0; i < this.detailLevel.materialList.materials.length; i++) {
				let texName = this.detailLevel.materialList.materials[i].toLowerCase();
				let fileName = texName.split('/').pop();
				let mat = new THREE.MeshLambertMaterial();
				materials.push(mat);
				
				let fullPath = this.difPath.slice(this.difPath.indexOf('data/') + 'data/'.length);
				const lookForTexture = async () => {
					let currentPath = fullPath;
	
					while (true) {
						// Search for the texture file inside-out, first looking in the closest directory and then searching in parent directories until it is found.
		
						currentPath = currentPath.slice(0, Math.max(0, currentPath.lastIndexOf('/')));
						if (!currentPath) break; // Nothing found
		
						let fullNames = this.level.mission.getFullNamesOf(currentPath + '/' + fileName);
						if (fullNames.length > 0) {
							let name = fullNames.find(x => !x.endsWith('.dif'));
							if (!name) break;
		
							// We found the texture file; create the texture.
							let texture = await this.level.mission.getTexture(currentPath + '/' + name);
							texture.wrapS = THREE.RepeatWrapping;
							texture.wrapT = THREE.RepeatWrapping;
							mat.map = texture;
		
							break;
						}
					}
				};
	
				await lookForTexture(); // First look for the texture regularly
				if (!mat.map && fullPath.includes('interiors/')) {
					// If we didn't find the texture, try looking for it in the MBP folder.
					fullPath = fullPath.replace('interiors/', 'interiors_mbp/');
					await lookForTexture();
				}
	
				this.materialGeometry.push({
					vertices: [],
					normals: [],
					uvs: [],
					indices: []
				});
			}
	
			let vertexBuckets = new Map<Point3F, VertexBucket[]>(); // Used for computing vertex normals by averaging face normals
	
			// Add every surface
			for (let surface of this.detailLevel.surfaces) this.addSurface(surface, vertexBuckets);
	
			// In order to achieve smooth shading, compute vertex normals by average face normals of faces with similar angles
			for (let [, buckets] of vertexBuckets) {
				for (let i = 0; i < buckets.length; i++) {
					let bucket = buckets[i];
					let avgNormal = new THREE.Vector3();
	
					// Average all vertex normals of this bucket
					for (let j = 0; j < bucket.normals.length; j++) avgNormal.add(bucket.normals[j]);
					avgNormal.multiplyScalar(1 / bucket.normals.length);
	
					// Write the normal vector into the buffers
					for (let j = 0; j < bucket.materialIndices.length; j++) {
						let index = bucket.materialIndices[j];
						let arr = this.materialGeometry[index].normals;
						let start = bucket.normalIndices[j];
						arr[start + 0] = avgNormal.x;
						arr[start + 1] = avgNormal.y;
						arr[start + 2] = avgNormal.z;
					}
				}
			}

			let geometry = Util.createGeometryFromMaterialGeometry(this.materialGeometry);
			let mesh: THREE.Mesh;

			if (this.useInstancing) {
				// Create the instanced mesh with appropriate instance count
				let instanceCount = this.level.interiors.filter(x => x.detailLevel === this.detailLevel).length;	
				mesh = new THREE.InstancedMesh(geometry, materials, instanceCount);

				this.instanceIndex = 0;
				this.sharedData = {
					instancedMesh: mesh as THREE.InstancedMesh,
					instanceIndex: this.instanceIndex
				};
				resolveFunc(this.sharedData);
			} else {
				mesh = new THREE.Mesh(geometry, materials);
			}
			
			mesh.receiveShadow = true;
			mesh.matrixAutoUpdate = false;
			this.level.scene.add(mesh);
			this.mesh = mesh;
		}

		this.level.loadingState.loaded++;
	}

	/** Adds one surface worth of geometry. */
	addSurface(surface: InteriorDetailLevel["surfaces"][number], vertexBuckets: Map<Point3F, VertexBucket[]>) {
		let detailLevel = this.detailLevel;
		let texGenEqs = detailLevel.texGenEqs[surface.texGenIndex];
		// These are needed for UVs
		let texPlaneX = new THREE.Plane(new THREE.Vector3(texGenEqs.planeX.x, texGenEqs.planeX.y, texGenEqs.planeX.z), texGenEqs.planeX.d);
		let texPlaneY = new THREE.Plane(new THREE.Vector3(texGenEqs.planeY.x, texGenEqs.planeY.y, texGenEqs.planeY.z), texGenEqs.planeY.d);
		let planeData = detailLevel.planes[surface.planeIndex & ~0x8000]; // Mask it here because the bit at 0x8000 specifies whether or not to invert the plane's normal.
		let planeNormal = detailLevel.normals[planeData.normalIndex];
		let geometryData = this.materialGeometry[surface.textureIndex];

		let k = 0; // Keep track of the face's index for corrent vertex winding order.
		for (let i = surface.windingStart; i < surface.windingStart + surface.windingCount - 2; i++) {
			let i1 = this.detailLevel.windings[i];
			let i2 = this.detailLevel.windings[i+1];
			let i3 = this.detailLevel.windings[i+2];

			if (k % 2 === 0) {
				// Swap the first and last index to mainting correct winding order
				let temp = i1;
				i1 = i3;
				i3 = temp;
			}

			let faceNormal = new THREE.Vector3(planeNormal.x, planeNormal.y, planeNormal.z);
			if (surface.planeIndex & 0x8000) faceNormal.multiplyScalar(-1); // Invert the plane if so specified

			for (let index of [i1, i2, i3]) {
				let vertex = this.detailLevel.points[index];
				geometryData.vertices.push(vertex.x, vertex.y, vertex.z);

				// Figure out UV coordinates by getting the distances of the corresponding vertices to the plane.
				let u = texPlaneX.distanceToPoint(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
				let v = texPlaneY.distanceToPoint(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
				geometryData.uvs.push(u, v);

				geometryData.normals.push(0, 0, 0); // Push a placeholder, we'll compute a proper normal later

				// Find the buckets for this vertex
				let buckets = vertexBuckets.get(vertex);
				if (!buckets) {
					// Create a new list of buckets if necessary
					buckets = [];
					vertexBuckets.set(vertex, buckets);
				}
				// Find the bucket for this vertex
				let bucket: VertexBucket;
				for (let j = 0; j < buckets.length; j++) {
					bucket = buckets[j];
					// Check if the reference normal and current face normal point in roughly the same direction; in that case, use that bucket.
					if (faceNormal.dot(bucket.referenceNormal) > SMOOTH_SHADING_ANGLE_THRESHOLD) break;
					bucket = null;
				}
				if (!bucket) {
					// Create a new bucket if necessary
					bucket = {
						referenceNormal: faceNormal,
						materialIndices: [],
						normalIndices: [],
						normals: []
					};
					buckets.push(bucket);
				}

				// Add data
				bucket.materialIndices.push(surface.textureIndex);
				bucket.normalIndices.push(geometryData.normals.length - 3);
				bucket.normals.push(faceNormal);
			}

			k++;
		}
	}

	/** Builds the collision geometry of this interior based on convex hull descriptions. */
	buildCollisionGeometry(scale: THREE.Vector3) {
		/** Adds a convex hull collision shape. */
		const addShape = (vertices: OIMO.Vec3[], material: string) => {
			let geometry = new OIMO.ConvexHullGeometry(vertices);
			let shapeConfig = new OIMO.ShapeConfig();
			shapeConfig.geometry = geometry;
			shapeConfig.restitution = INTERIOR_DEFAULT_RESTITUTION * (specialResistutionFactor[material] ?? 1);
			shapeConfig.friction = INTERIOR_DEFAULT_FRICTION * (specialFriction[material] ?? 1);
			let shape = new OIMO.Shape(shapeConfig);
			this.body.addShape(shape);
		};

		for (let i = 0; i < this.detailLevel.convexHulls.length; i++) {
			let hull = this.detailLevel.convexHulls[i];
			let vertices: OIMO.Vec3[] = [];
 
			// Get the vertices
			for (let j = hull.hullStart; j < hull.hullStart + hull.hullCount; j++) {
				let point = this.detailLevel.points[this.detailLevel.hullIndices[j]];
				vertices.push(new OIMO.Vec3(point.x * scale.x, point.y * scale.y, point.z * scale.z));
			}

			let materials = new Set();
			let firstMaterial: string;

			// Add all materials
			for (let j = hull.surfaceStart; j < hull.surfaceStart + hull.surfaceCount; j++) {
				let surface = this.detailLevel.surfaces[this.detailLevel.hullSurfaceIndices[j]];
				if (!surface) continue;
				
				let material = this.materialNames[surface.textureIndex];
				materials.add(material);
				firstMaterial = material;
			}

			// In case there is more than one material and one of them is special, generate geometry directly from the surfaces instead of from the convex hull.
			if (materials.size > 1 && Util.setsHaveOverlap(materials, specialMaterials)) {
				for (let j = hull.surfaceStart; j < hull.surfaceStart + hull.surfaceCount; j++) {
					let surface = this.detailLevel.surfaces[this.detailLevel.hullSurfaceIndices[j]];
					if (!surface) continue;

					let material = this.materialNames[surface.textureIndex];
					let vertices: OIMO.Vec3[] = [];

					for (let k = surface.windingStart; k < surface.windingStart + surface.windingCount; k++) {
						let point = this.detailLevel.points[this.detailLevel.windings[k]];
						vertices.push(new OIMO.Vec3(point.x * scale.x, point.y * scale.y, point.z * scale.z));
					}

					addShape(vertices, material);
				}
			} else {
				// Otherwise, just add one shape for the entire convex hull.
				addShape(vertices, firstMaterial);
			}
		}
	}

	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion, scale: THREE.Vector3) {
		this.worldMatrix.compose(position, orientation, scale);
		if (this.useInstancing) {
			this.sharedData.instancedMesh.setMatrixAt(this.instanceIndex, this.worldMatrix);
			this.sharedData.instancedMesh.instanceMatrix.needsUpdate = true;
		} else {
			this.mesh.matrix.copy(this.worldMatrix);
		}

		this.buildCollisionGeometry(scale);

		this.body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
		this.body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
	}

	tick(time: TimeState) {}
	render(time: TimeState) {}
	reset() {}
}