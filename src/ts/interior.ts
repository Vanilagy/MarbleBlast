import { DifFile, InteriorDetailLevel } from "./parsing/dif_parser";
import * as THREE from "three";
import OIMO from "./declarations/oimo";
import { TimeState, Level, PHYSICS_TICK_RATE } from "./level";
import { Util } from "./util";
import { Point3F } from "./parsing/binary_file_parser";
import { Octree, OctreeObject } from "./octree";
import { StorageManager } from "./storage";
import { Geometry } from "./rendering/geometry";
import { Mesh } from "./rendering/mesh";
import { Material } from "./rendering/material";

export const INTERIOR_DEFAULT_FRICTION = 1;
export const INTERIOR_DEFAULT_RESTITUTION = 1;
const SMOOTH_SHADING_ANGLE_THRESHOLD = Math.cos(Util.degToRad(15));

export const specialFrictionFactor: Record<string, number> = {
	"friction_high": 1.5,
	"friction_low": 0.2,
	"friction_none": 0.01,
	"friction_ramp_yellow": 2.0,
	"grass": 1.5,
	"mmg_grass": 0.9,
	"tarmac": 0.35,
	"sand": 4.0,
	"mmg_sand": 6.0,
	"carpet": 6.0,
	"rug": 6.0,
	"water": 6.0,
	"mmg_water": 6.0,
	"ice1": 0.03,
	"mmg_ice": 0.03,
	"floor_bounce": 0.2,
	"mbp_chevron_friction": 0.0,
	"mbp_chevron_friction2": 0.0,
	"mbp_chevron_friction3": 0.0
};
const specialResistutionFactor: Record<string, number> = {
	"friction_high": 0.5,
	"friction_low": 0.5,
	"friction_none": 0.5,
	"grass": 0.35,
	"mmg_grass": 0.5,
	"tarmac": 0.7,
	"sand": 0.1,
	"mmg_sand": 0.1,
	"carpet": 0.5,
	"rug": 0.5,
	"water": 0.0,
	"mmg_water": 0.0,
	"ice1": 0.95,
	"mmg_ice": 0.95,
	//"floor_bounce": 0.0
};
const specialForces: Record<string, number> = {
	"floor_bounce": 15
};
const specialMaterials = new Set([...Object.keys(specialFrictionFactor), ...Object.keys(specialResistutionFactor), ...Object.keys(specialForces)]);

/** Creates a material with an additional normal map. */
const createNormalMapMaterial = async (interior: Interior, baseTexture: string, normalTexture: string) => {
	let diffuseMap = await interior.level.mission.getTexture(`interiors_mbu/${baseTexture}`);
	let normalMap = await interior.level.mission.getTexture(`shaders/tex/${normalTexture}`);

	let mat = new Material();

	mat.normalMap = normalMap;
	mat.diffuseMap = diffuseMap;
	mat.saturateIncomingLight = false;
	mat.receiveShadows = true;

	return mat;
};

/** Creates a material with an additional normal and specularity map. */
const createPhongMaterial = async (interior: Interior, baseTexture: string, specTexture: string, normalTexture: string, shininess: number, specularIntensity: number, secondaryMapUvFactor = 1) => {
	let specularMap = specTexture && await interior.level.mission.getTexture(`shaders/tex/${specTexture}`);
	let normalMap = normalTexture && await interior.level.mission.getTexture(`shaders/tex/${normalTexture}`);
	let texture = await interior.level.mission.getTexture(`interiors_mbu/${baseTexture}`);

	let mat = new Material();

	mat.diffuseMap = texture;
	mat.specularMap = specularMap;
	mat.normalMap = normalMap;
	mat.shininess = shininess;
	mat.specularIntensity = specularIntensity;
	mat.secondaryMapUvFactor = secondaryMapUvFactor;
	mat.saturateIncomingLight = false;
	mat.receiveShadows = true;

	return mat;
};

/** Creates a material for a tile texture using an overlaid noise pattern. */
const createNoiseTileMaterial = async (interior: Interior, baseTexture: string, noiseSuffix: string) => {
	let diffuseMap = await interior.level.mission.getTexture(`interiors_mbu/${baseTexture}`);
	let specularMap = await interior.level.mission.getTexture('shaders/tex/tile_mbu.spec.jpg');
	let noiseMap = await interior.level.mission.getTexture(`shaders/tex/noise${noiseSuffix}.jpg`);
	let normalMap = await interior.level.mission.getTexture('shaders/tex/tile_mbu.normal.png');

	let mat = new Material();

	mat.diffuseMap = diffuseMap;
	mat.specularMap = specularMap;
	mat.normalMap = normalMap;
	mat.noiseMap = noiseMap;
	mat.shininess = 40;
	mat.specularIntensity = 0.7;
	mat.saturateIncomingLight = false;
	mat.receiveShadows = true;

	return mat;
};

/** A list of custom materials for MBU. */
const customMaterialFactories: Record<string, (interior: Interior) => Promise<Material>> = {
	'plate_1': (interior: Interior) => createPhongMaterial(interior, 'plate_1.jpg', 'plate_mbu.spec.jpg', 'plate_mbu.normal.png', 30, 0.5),
	'tile_beginner': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_beginner.png', ''),
	'tile_beginner_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_beginner_shadow.png', ''),
	'tile_beginner_red': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_beginner_red.jpg', ''),
	'tile_beginner_red_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_beginner_red_shadow.png', ''),
	'tile_beginner_blue': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_beginner_blue.jpg', ''),
	'tile_beginner_blue_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_beginner_blue_shadow.png', ''),
	'tile_intermediate': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_intermediate.png', ''),
	'tile_intermediate_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_intermediate_shadow.png', ''),
	'tile_intermediate_red': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_intermediate_red.jpg', ''),
	'tile_intermediate_red_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_intermediate_red_shadow.png', ''),
	'tile_intermediate_green': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_intermediate_green.jpg', ''),
	'tile_intermediate_green_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_intermediate_green_shadow.png', ''),
	'tile_advanced': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_advanced.png', ''),
	'tile_advanced_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_advanced_shadow.png', ''),
	'tile_advanced_blue': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_advanced_blue.jpg', ''),
	'tile_advanced_blue_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_advanced_blue_shadow.png', ''),
	'tile_advanced_green': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_advanced_green.jpg', ''),
	'tile_advanced_green_shadow': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_advanced_green_shadow.png', ''),
	'tile_underside': (interior: Interior) => createNoiseTileMaterial(interior, 'tile_underside.jpg', ''),
	'wall_beginner': (interior: Interior) => createPhongMaterial(interior, 'wall_beginner.png', 'wall_mbu.spec.png', 'wall_mbu.normal.png', 30, 0.5),
	'edge_white': (interior: Interior) => createPhongMaterial(interior, 'edge_white.jpg', 'edge_white_mbu.spec.jpg', 'edge_white_mbu.normal.jpg', 50, 4),
	'edge_white_shadow': (interior: Interior) => createPhongMaterial(interior, 'edge_white_shadow.png', 'edge_white_mbu.spec.jpg', 'edge_white_mbu.normal.jpg', 50, 4),
	'beam': (interior: Interior) => createNormalMapMaterial(interior, 'beam.png', 'beam_side_mbu.normal.png'),
	'beam_side': (interior: Interior) => createNormalMapMaterial(interior, 'beam_side.png', 'beam_side_mbu.normal.png'),
	'friction_low': (interior: Interior) => createPhongMaterial(interior, 'friction_low.jpg', null/*'friction_low_mbu.spec.png'*/, 'friction_low_mbu.normal.png', 100, 3),
	'friction_low_shadow': (interior: Interior) => createPhongMaterial(interior, 'friction_low_shadow.png', null/*'friction_low_mbu.spec.png'*/, 'friction_low_mbu.normal.png', 100, 3),
	'friction_high': (interior: Interior) => createPhongMaterial(interior, 'friction_high.png', 'friction_high_mbu.spec.png', 'friction_high_mbu.normal.png', 30, 0.8, 2),
	'friction_high_shadow': (interior: Interior) => createPhongMaterial(interior, 'friction_high_shadow.png', 'friction_high_mbu.spec.png', 'friction_high_mbu.normal.png', 30, 0.8, 2),
};

/** Stores a list of all vertices with similar face normal. */
interface VertexBucket {
	referenceNormal: THREE.Vector3,
	/** The index at which to write the normal vector. */
	normalIndices: number[],
	/** The face normal per vertex. */
	normals: THREE.Vector3[]
}

interface ConvexHullOctreeObject extends OctreeObject {
	hullIndex: number
}

interface InitCacheType {
	geometry: Geometry,
	materials: Material[],
	fancyShaders: boolean
}

/** Represents a Torque 3D Interior, used for the main surfaces and geometry of levels. */
export class Interior {
	/** The unique id of this interior. */
	id: number;
	level: Level;
	dif: DifFile;
	difPath: string;
	mesh: Mesh;
	/** The collision body of the interior. */
	body: OIMO.RigidBody;
	/** The relevant detail level to read from (non-default for pathed interiors) */
	detailLevel: DifFile["detailLevels"][number];
	worldMatrix = new THREE.Matrix4();
	scale: THREE.Vector3;
	materials: THREE.Material[];
	//materialGeometry: MaterialGeometry = [];
	/** Simply contains the file names of the materials without the path to them. */
	materialNames: string[] = [];
	forceShapes = new WeakMap<OIMO.Shape, number>();
	randomForces = new WeakSet<OIMO.Shape>();
	/** Whether or not frictions and bouncy floors work on this interior. */
	allowSpecialMaterials = true;
	/** An octree containing all Torque convex hulls of this interior. Used to build OIMO collision geometry quickly and on-demand. */
	convexHullOctree = new Octree();
	addedHulls = new Set<number>();
	canMove = false;
	specialMaterials: Set<string>;

	/** Avoids recomputation of the same interior. */
	static initCache = new WeakMap<InteriorDetailLevel, Promise<InitCacheType>>();

	constructor(file: DifFile, path: string, level: Level, subObjectIndex?: number) {
		this.dif = file;
		this.difPath = path;
		this.level = level;
		this.detailLevel = (subObjectIndex === undefined)? file.detailLevels[0] : file.subObjects[subObjectIndex];
		this.materialNames = this.detailLevel.materialList.materials.map(x => x.split('/').pop().toLowerCase());

		let rigidBodyConfig =  new OIMO.RigidBodyConfig();
		rigidBodyConfig.type = (subObjectIndex === undefined)? OIMO.RigidBodyType.STATIC : OIMO.RigidBodyType.KINEMATIC;
		this.body = new OIMO.RigidBody(rigidBodyConfig);

		// Combine the default special materials with the special ones specified in the .mis file
		this.specialMaterials = new Set([...specialMaterials, ...Object.keys(this.level.mission.misFile.materialMappings)]);
	}

	async init(id: number) {
		this.id = id;

		let cached = await Interior.initCache.get(this.detailLevel);
		if (cached && cached.fancyShaders !== StorageManager.data.settings.fancyShaders) {
			// The cached interior was created with a different shader setting, so assume it's invalid
			Interior.initCache.delete(this.detailLevel);
			cached = null;
		}

		if (!cached) {
			// There is no cached init data for this detail level yet, so go and create it, girl

			let resolveFunc: (data: InitCacheType) => any;
			let promise = new Promise<InitCacheType>(resolve => resolveFunc = resolve);
			Interior.initCache.set(this.detailLevel, promise);

			let materials: Material[] = [];

			for (let i = 0; i < this.detailLevel.materialList.materials.length; i++) {
				let texName = this.detailLevel.materialList.materials[i].toLowerCase();
				let fileName = texName.split('/').pop();

				if (StorageManager.data.settings.fancyShaders && this.level.mission.modification === 'ultra' && customMaterialFactories[fileName]) {
					// There's a special way to create this material, prefer this instead of the normal way
					materials.push(await customMaterialFactories[fileName](this));
					continue;
				}

				let mat = new Material();
				mat.receiveShadows = true;
				materials.push(mat);

				// Check for this special material which just makes the surface invisible (like a colmesh)
				if (this.level.mission.modification === 'ultra' && fileName === 'tools_invisible') {
					mat.opacity = 0;
					continue;
				}
				
				let fullPath = this.difPath.includes('data/')?
					this.difPath.slice(this.difPath.indexOf('data/') + 'data/'.length)
					: this.difPath.slice(this.difPath.indexOf('data_mbp/') + 'data_mbp/'.length);

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
							mat.diffuseMap = texture;
		
							break;
						}
					}
				};
	
				await lookForTexture(); // First look for the texture regularly
				if (!mat.diffuseMap && fullPath.includes('interiors/')) {
					// If we didn't find the texture, try looking for it in the MBP folder.
					fullPath = fullPath.replace('interiors/', 'interiors_mbp/');
					await lookForTexture();
				}
			}

			let geometry = new Geometry();
			let vertexBuckets = new Map<Point3F, VertexBucket[]>(); // Used for computing vertex normals by averaging face normals

			// Add every surface
			for (let surface of this.detailLevel.surfaces) this.addSurface(geometry, surface, vertexBuckets);
	
			// In order to achieve smooth shading, compute vertex normals by average face normals of faces with similar angles
			for (let [, buckets] of vertexBuckets) {
				for (let i = 0; i < buckets.length; i++) {
					let bucket = buckets[i];
					let avgNormal = new THREE.Vector3();
	
					// Average all vertex normals of this bucket
					for (let j = 0; j < bucket.normals.length; j++) avgNormal.add(bucket.normals[j]);
					avgNormal.multiplyScalar(1 / bucket.normals.length);
	
					// Write the normal vector into the buffers
					for (let j = 0; j < bucket.normalIndices.length; j++) {
						let arr = geometry.normals;
						let start = bucket.normalIndices[j];
						arr[start + 0] = avgNormal.x;
						arr[start + 1] = avgNormal.y;
						arr[start + 2] = avgNormal.z;
					}
				}
			}

			cached = {
				geometry,
				materials,
				fancyShaders: StorageManager.data.settings.fancyShaders
			};
			resolveFunc(cached);
		}

		// Create the mesh, add it to the scene, and done
		let mesh = new Mesh(cached.geometry, cached.materials);
		this.mesh = mesh;

		this.level.loadingState.loaded++;
	}

	/** Adds one surface worth of geometry. */
	addSurface(geometry: Geometry, surface: InteriorDetailLevel["surfaces"][number], vertexBuckets: Map<Point3F, VertexBucket[]>) {
		let detailLevel = this.detailLevel;
		let texGenEqs = detailLevel.texGenEqs[surface.texGenIndex];
		// These are needed for UVs
		let texPlaneX = new THREE.Plane(new THREE.Vector3(texGenEqs.planeX.x, texGenEqs.planeX.y, texGenEqs.planeX.z), texGenEqs.planeX.d);
		let texPlaneY = new THREE.Plane(new THREE.Vector3(texGenEqs.planeY.x, texGenEqs.planeY.y, texGenEqs.planeY.z), texGenEqs.planeY.d);
		let planeData = detailLevel.planes[surface.planeIndex & ~0x8000]; // Mask it here because the bit at 0x8000 specifies whether or not to invert the plane's normal.
		let planeNormal = detailLevel.normals[planeData.normalIndex];
		//let geometryData = this.materialGeometry[surface.textureIndex];
		let material = this.materialNames[surface.textureIndex];

		let k = 0; // Keep track of the face's index for corrent vertex winding order.
		for (let i = surface.windingStart; i < surface.windingStart + surface.windingCount - 2; i++) {
			let i1 = this.detailLevel.windings[i];
			let i2 = this.detailLevel.windings[i+1];
			let i3 = this.detailLevel.windings[i+2];

			if (k % 2 === 0) {
				// Swap the first and last index to maintain correct winding order
				let temp = i1;
				i1 = i3;
				i3 = temp;
			}

			let faceNormal = new THREE.Vector3(planeNormal.x, planeNormal.y, planeNormal.z);
			if (surface.planeIndex & 0x8000) faceNormal.multiplyScalar(-1); // Invert the plane if so specified

			for (let index of [i1, i2, i3]) {
				let position = this.detailLevel.points[index];

				// Figure out UV coordinates by getting the distances of the corresponding vertices to the plane.
				let u = texPlaneX.distanceToPoint(new THREE.Vector3(position.x, position.y, position.z));
				let v = texPlaneY.distanceToPoint(new THREE.Vector3(position.x, position.y, position.z));
				if (this.level.mission.modification === 'ultra' && material === 'plate_1') u /= 2, v/= 2; // This one texture gets scaled up by 2x probably in the shader, but to avoid writing a separate shader we do it here.

				geometry.positions.push(position.x, position.y, position.z);
				geometry.normals.push(0, 0, 0); // Push a placeholder, we'll compute a proper normal later
				geometry.uvs.push(u, v);
				geometry.materials.push(surface.textureIndex);
				geometry.indices.push(geometry.indices.length);

				// Find the buckets for this vertex
				let buckets = vertexBuckets.get(position);
				if (!buckets) {
					// Create a new list of buckets if necessary
					buckets = [];
					vertexBuckets.set(position, buckets);
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
						normalIndices: [],
						normals: []
					};
					buckets.push(bucket);
				}

				// Add data
				bucket.normalIndices.push(geometry.normals.length - 3);
				bucket.normals.push(faceNormal);
			}

			k++;
		}
	}

	/** Adds a convex hull collision shape. */
	addShape(vertices: OIMO.Vec3[], material: string) {
		let geometry = new OIMO.ConvexHullGeometry(vertices);
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = geometry;
		shapeConfig.restitution = INTERIOR_DEFAULT_RESTITUTION;
		shapeConfig.friction = INTERIOR_DEFAULT_FRICTION;
		let force: number;

		if (this.allowSpecialMaterials) {
			// Check for a custom material property override in the mission file
			let specialMatProperties = this.level.mission.misFile.materialProperties[this.level.mission.misFile.materialMappings[material]];
			
			let restitution = specialMatProperties?.['restitution'] ?? specialResistutionFactor[material] ?? 1;
			let friction = specialMatProperties?.['friction'] ?? specialFrictionFactor[material] ?? 1;
			force = specialMatProperties?.['force'] ?? specialForces[material];

			if (force !== undefined) restitution = 1; // Because we don't want anything to act weird

			shapeConfig.restitution *= restitution;
			shapeConfig.friction *= friction;
		}

		let shape = new OIMO.Shape(shapeConfig);
		shape.userData = this.id;
		if (this.allowSpecialMaterials && material?.startsWith('mbp_chevron_friction')) this.randomForces.add(shape);
		if (force !== undefined) this.forceShapes.set(shape, force);

		this.body.addShape(shape);
	}

	addConvexHull(hullIndex: number, scale: THREE.Vector3) {
		let hull = this.detailLevel.convexHulls[hullIndex];
		let materials = new Set();
		let firstMaterial: string;

		// Add all materials
		for (let j = hull.surfaceStart; j < hull.surfaceStart + hull.surfaceCount; j++) {
			let surface = this.detailLevel.surfaces[this.detailLevel.hullSurfaceIndices[j]];
			if (!surface) continue;
			
			let material = this.materialNames[surface.textureIndex];
			if (!material) continue;

			materials.add(material);
			firstMaterial = material;
		}

		// In case there is more than one material and one of them is special, generate geometry directly from the surfaces instead of from the convex hull.
		if (materials.size > 1 && Util.setsHaveOverlap(materials, this.specialMaterials)) {
			for (let j = hull.surfaceStart; j < hull.surfaceStart + hull.surfaceCount; j++) {
				let surface = this.detailLevel.surfaces[this.detailLevel.hullSurfaceIndices[j]];
				if (!surface) continue;

				let material = this.materialNames[surface.textureIndex];
				if (!material) continue;
				let vertices: OIMO.Vec3[] = [];

				for (let k = surface.windingStart; k < surface.windingStart + surface.windingCount; k++) {
					let point = this.detailLevel.points[this.detailLevel.windings[k]];
					vertices.push(new OIMO.Vec3(point.x * scale.x, point.y * scale.y, point.z * scale.z));
				}

				this.addShape(vertices, material);
			}
		} else {
			// Otherwise, just add one shape for the entire convex hull.
			let vertices: OIMO.Vec3[] = [];

			// Get the vertices
			for (let j = hull.hullStart; j < hull.hullStart + hull.hullCount; j++) {
				let point = this.detailLevel.points[this.detailLevel.hullIndices[j]];
				vertices.push(new OIMO.Vec3(point.x * scale.x, point.y * scale.y, point.z * scale.z));
			}

			if (firstMaterial) this.addShape(vertices, firstMaterial);
		}
	}

	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion, scale: THREE.Vector3) {
		this.worldMatrix.compose(position, orientation, scale);
		this.scale = scale;
		this.mesh.transform.copy(this.worldMatrix);
		
		this.initConvexHullOctree();

		this.body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
		this.body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
	}

	/** Initiates the octree with all convex hull collision geometries for fast querying later. */
	initConvexHullOctree() {
		for (let i = 0; i < this.detailLevel.convexHulls.length; i++) {
			let hull = this.detailLevel.convexHulls[i];
			let vertices: THREE.Vector3[] = [];
 
			// Get the vertices
			for (let j = hull.hullStart; j < hull.hullStart + hull.hullCount; j++) {
				let point = this.detailLevel.points[this.detailLevel.hullIndices[j]];
				vertices.push(new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(this.worldMatrix));
			}

			let aabb = new THREE.Box3();
			aabb.setFromPoints(vertices);

			let object: ConvexHullOctreeObject = { boundingBox: aabb, isIntersectedByRay: null, hullIndex: i };
			this.convexHullOctree.insert(object);
		}
	}

	/** Adds collision geometry for nearby convex hulls. */
	buildCollisionGeometry() {
		if (this.canMove) return; // We already added everything

		let marble = this.level.marble;

		// Create a sphere that includes all geometry possibly reachable by the marble
		let sphere = new THREE.Sphere();
		sphere.center.copy(Util.vecOimoToThree(marble.body.getPosition()));
		sphere.radius = 5 + marble.body.getLinearVelocity().length() / PHYSICS_TICK_RATE * 2; // Should be plenty (constant summand because of camera)

		let intersects = this.convexHullOctree.intersectSphere(sphere) as ConvexHullOctreeObject[];
		for (let intersect of intersects) {
			if (this.addedHulls.has(intersect.hullIndex)) continue; // We already added this convex hull, skip it
			this.addConvexHull(intersect.hullIndex, this.scale);
			this.addedHulls.add(intersect.hullIndex);
		}
	}

	onMarbleContact(time: TimeState, contact?: OIMO.Contact): boolean {
		let contactShape = contact.getShape1();
		if (contactShape === this.level.marble.shape) contactShape = contact.getShape2();

		let marble = this.level.marble;
		// Get the contact normal
		let contactNormal = contact.getManifold().getNormal();
		if (contact.getShape1().userData === this.id) contactNormal.scaleEq(-1);

		if (this.forceShapes.has(contactShape)) {
			// Set the velocity along the contact normal, but make sure it's capped
			marble.setLinearVelocityInDirection(contactNormal, this.forceShapes.get(contactShape), false);
			marble.slidingTimeout = 2; // Make sure we don't slide on the interior after bouncing off it

			return false;
		} else if (this.randomForces.has(contactShape)) {
			let angVel = marble.body.getAngularVelocity();
			let movementVec = angVel.cross(contactNormal);
			// Move the marble in the opposite direction
			marble.body.addLinearVelocity(movementVec.scaleEq(-0.0015));
			marble.body.setAngularVelocity(angVel.scaleEq(1.07 * marble.speedFac));

			return true; // Prevent immunity so we can trigger this code every tick and not every second tick or whatever
		}

		return true;
	}

	/* eslint-disable @typescript-eslint/no-unused-vars */
	tick(time: TimeState) {}
	render(time: TimeState) {}
	reset() {}
	async onLevelStart() {}
}