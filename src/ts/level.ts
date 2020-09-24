import { DifParser } from "./parsing/dif_parser";
import { Interior } from "./interior";
import * as THREE from "three";
import { renderer, camera } from "./rendering";
import OIMO from "./declarations/oimo";
import { Marble } from "./marble";
import { Shape } from "./shape";
import { MissionElementSimGroup, MissionElementType, MissionElementStaticShape, MissionElementItem, MisParser, MissionElementSun } from "./parsing/mis_parser";
import { StartPad } from "./shapes/start_pad";
import { SignFinish } from "./shapes/sign_finish";
import { SignPlain } from "./shapes/sign_plain";
import { EndPad } from "./shapes/end_pad";
import { Gem } from "./shapes/gem";
import { SuperJump } from "./shapes/super_jump";
import { SignCaution } from "./shapes/sign_caution";
import { SuperBounce } from "./shapes/super_bounce";
import { RoundBumper } from "./shapes/round_bumper";
import { Helicopter } from "./shapes/helicopter";
import { DuctFan } from "./shapes/duct_fan";
import { AntiGravity } from "./shapes/anti_gravity";
import { LandMine } from "./shapes/land_mine";
import { ShockAbsorber } from "./shapes/shock_absorber";
import { SuperSpeed } from "./shapes/super_speed";
import { TimeTravel } from "./shapes/time_travel";
import { Tornado } from "./shapes/tornado";
import { TrapDoor } from "./shapes/trap_door";
import { TriangleBumper } from "./shapes/triangle_bumper";
import { Oilslick } from "./shapes/oilslick";
import { Util } from "./util";
import { PowerUp } from "./shapes/power_up";
import { gameButtons } from "./input";

export const PHYSICS_TICK_RATE = 120;

export class Level {
	scene: THREE.Scene;
	physicsWorld: OIMO.World;
	marble: Marble;
	shapes: Shape[] = [];
	shapeLookup = new Map<any, Shape>();
	shapeColliderLookup = new Map<any, Shape>();

	lastPhysicsTick: number = null;
	shapeImmunity = new Set<Shape>();
	shapeInside = new Map<Shape, boolean>();
	pitch = 0;
	yaw = 0;

	auxPhysicsWorld: OIMO.World;
	auxMarbleShape: OIMO.Shape;
	auxMarbleBody: OIMO.RigidBody;

	currentUp = new OIMO.Vec3(0, 0, 1);
	orientationChangeTime = -Infinity;
	oldOrientationQuat = new THREE.Quaternion();
	newOrientationQuat = new THREE.Quaternion();
	heldPowerUp: PowerUp = null;

	constructor(missionGroup: MissionElementSimGroup) {
		this.init(missionGroup);
	}

	async init(missionGroup: MissionElementSimGroup) {
		this.scene = new THREE.Scene();
		this.physicsWorld = new OIMO.World(OIMO.BroadPhaseType.BVH, new OIMO.Vec3(0, 0, -20));
		this.auxPhysicsWorld = new OIMO.World(OIMO.BroadPhaseType.BVH, new OIMO.Vec3(0, 0, 0));

		let sunElement = missionGroup.elements.find((element) => element._type === MissionElementType.Sun) as MissionElementSun;
		let sunDirection = MisParser.parsePosition(sunElement.direction);

		let ambientLight = new THREE.AmbientLight(new THREE.Color(0.3, 0.3, 0.475), 1);
        ambientLight.position.z = 0;
        ambientLight.position.y = 5;
        this.scene.add(ambientLight);
        let sunlight = new THREE.DirectionalLight(new THREE.Color(1.4, 1.2, 0.4), 0.9);
        this.scene.add(sunlight);
        sunlight.position.x = -sunDirection.x * 30;
        sunlight.position.y = -sunDirection.y * 30;
		sunlight.position.z = -sunDirection.z * 30;

		const skyboxLoader = new THREE.CubeTextureLoader();
        const texture = skyboxLoader.load([
            './assets/data/skies/sky_lf.jpg',
            './assets/data/skies/sky_rt.jpg',
            './assets/data/skies/sky_bk.jpg',
            './assets/data/skies/sky_fr.jpg',
            './assets/data/skies/sky_up.jpg',
            './assets/data/skies/sky_dn.jpg',
		], () => {
			this.scene.background = texture;

			texture.images[0] = Util.modifyImageWithCanvas(texture.images[0], -Math.PI/2, true);
			texture.images[1] = Util.modifyImageWithCanvas(texture.images[1], Math.PI/2, true);
			texture.images[2] = Util.modifyImageWithCanvas(texture.images[2], 0, true);
			texture.images[3] = Util.modifyImageWithCanvas(texture.images[3], Math.PI, true);
			texture.images[4] = Util.modifyImageWithCanvas(texture.images[4], Math.PI, true);
			texture.images[5] = Util.modifyImageWithCanvas(texture.images[5], 0, true);

			texture.needsUpdate = true;
		});

		this.marble = new Marble();
		await this.marble.init();
		this.scene.add(this.marble.group);
		this.marble.group.renderOrder = 10;
		this.physicsWorld.addRigidBody(this.marble.body);

		let auxMarbleGeometry = new OIMO.CapsuleGeometry(0.2 * Math.sqrt(3), 0); // The normal game's hitbox can expand to up to sqrt(3)x the normal size
		this.auxMarbleShape = new OIMO.Shape(new OIMO.ShapeConfig());
		this.auxMarbleShape._geom = auxMarbleGeometry;
		this.auxMarbleBody = new OIMO.RigidBody(new OIMO.RigidBodyConfig());
		this.auxMarbleBody.addShape(this.auxMarbleShape);
		this.auxPhysicsWorld.addRigidBody(this.auxMarbleBody);

		this.addSimGroup(missionGroup);

		this.render();
		setInterval(() => this.tick());
	}

	async addSimGroup(simGroup: MissionElementSimGroup) {
		for (let element of simGroup.elements) {
			switch (element._type) {
				case MissionElementType.SimGroup: {
					await this.addSimGroup(element);
				}; break;
				case MissionElementType.InteriorInstance: {
					let path = element.interiorFile.slice(element.interiorFile.indexOf('data/'));
					let difFile = await DifParser.loadFile('./assets/' + path);
					let interior = new Interior(difFile);
					interior.setTransform(MisParser.parsePosition(element.position), MisParser.parseRotation(element.rotation));
	
					this.scene.add(interior.group);
					this.physicsWorld.addRigidBody(interior.body);
				}; break;
				case MissionElementType.StaticShape: case MissionElementType.Item: {
					await this.addShape(element);
				}; break;
			}
		}
	}

	async addShape(element: MissionElementStaticShape | MissionElementItem) {
		let shape: Shape;

		if (element.dataBlock === "StartPad") {
			shape = new StartPad();
		} else if (element.dataBlock === "EndPad") {
			shape = new EndPad();
		} else if (element.dataBlock === "SignFinish") {
			shape = new SignFinish();
		} else if (element.dataBlock.startsWith("SignPlain")) {
			shape = new SignPlain(element as MissionElementStaticShape);
		} else if (element.dataBlock.startsWith("GemItem")) {
			shape = new Gem(element as MissionElementItem);
		} else if (element.dataBlock === "SuperJumpItem") {
			shape = new SuperJump();
		} else if (element.dataBlock.startsWith("SignCaution")) {
			shape = new SignCaution(element as MissionElementStaticShape);
		} else if (element.dataBlock === "SuperBounceItem") {
			shape = new SuperBounce();
		} else if (element.dataBlock === "RoundBumper") {
			shape = new RoundBumper();
		} else if (element.dataBlock === "TriangleBumper") {
			shape = new TriangleBumper();
		} else if (element.dataBlock === "HelicopterItem") {
			shape = new Helicopter();
		} else if (element.dataBlock === "DuctFan") {
			shape = new DuctFan();
		} else if (element.dataBlock === "AntiGravityItem") {
			shape = new AntiGravity();
		} else if (element.dataBlock === "LandMine") {
			shape = new LandMine();
		} else if (element.dataBlock === "ShockAbsorberItem") {
			shape = new ShockAbsorber();
		} else if (element.dataBlock === "SuperSpeedItem") {
			shape = new SuperSpeed();
		} else if (element.dataBlock === "TimeTravelItem") {
			shape = new TimeTravel();
		} else if (element.dataBlock === "Tornado") {
			shape = new Tornado();
		} else if (element.dataBlock === "TrapDoor") {
			shape = new TrapDoor();
		} else if (element.dataBlock === "oilslick") {
			shape = new Oilslick();
		}

		if (!shape) return;
		await shape.init();

		shape.setTransform(MisParser.parsePosition(element.position), MisParser.parseRotation(element.rotation));

		// temp
		if (shape instanceof StartPad) this.marble.body.setPosition(new OIMO.Vec3(shape.worldPosition.x, shape.worldPosition.y, shape.worldPosition.z + 2));

		this.scene.add(shape.group);
		for (let body of shape.bodies) {
			if (shape.collideable) this.physicsWorld.addRigidBody(body);
			else this.auxPhysicsWorld.addRigidBody(body);
		}
		for (let collider of shape.colliders) {
			this.auxPhysicsWorld.addRigidBody(collider.body);
			this.shapeColliderLookup.set(collider.id, shape);
		}
		this.shapes.push(shape);
		this.shapeLookup.set(shape.id, shape);
	}

	render() {
		let time = performance.now();

		this.tick(time);

		let marblePosition = this.marble.body.getPosition();
		let orientationQuat = this.getOrientationQuat(time);
		let up = new THREE.Vector3(0, 0, 1).applyQuaternion(orientationQuat);
		let directionVector = new THREE.Vector3(1, 0, 0);
		let cameraVerticalTranslation = new THREE.Vector3(0, 0, 0.3);
		
		camera.position.set(marblePosition.x, marblePosition.y, marblePosition.z);
		directionVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
		directionVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
		cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
		cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
		cameraVerticalTranslation.applyQuaternion(orientationQuat);
		directionVector.multiplyScalar(2.5);
		directionVector.applyQuaternion(orientationQuat);
		camera.position.sub(directionVector);
		camera.up = up;
		camera.lookAt(new THREE.Vector3(marblePosition.x, marblePosition.y, marblePosition.z));
		camera.position.add(cameraVerticalTranslation);

		this.marble.render(time);
		for (let shape of this.shapes) shape.render(time);

		renderer.render(this.scene, camera);		

		requestAnimationFrame(() => this.render());
	}

	tick(time?: number) {
		if (time === undefined) time = performance.now();

		if (gameButtons.use) {
			this.heldPowerUp?.use(time);
			this.heldPowerUp = null;
		}

		if (this.lastPhysicsTick === null) {
			this.lastPhysicsTick = time;
		} else {
			let elapsed = time - this.lastPhysicsTick;
			if (elapsed >= 1000) {
				// temp: (for quicker loading)
				elapsed = 1000;
				this.lastPhysicsTick = time - 1000;
			}

			while (elapsed >= 1000 / PHYSICS_TICK_RATE) {
				let newImmunity: Shape[] = [];

				let calledShapes = new Set<Shape>();
				let linkedList = this.marble.body.getContactLinkList();
				while (linkedList) {
					let contact = linkedList.getContact();
					let contactShape = contact.getShape1();
					if (contactShape === this.marble.shape) contactShape = contact.getShape2();

					if (contactShape.userData && contact.isTouching()) {
						let shape = this.shapeLookup.get(contactShape.userData);

						if (shape && !this.shapeImmunity.has(shape) && !calledShapes.has(shape)) {
							calledShapes.add(shape);
							newImmunity.push(shape);
							shape.onMarbleContact(contact, time);
						}
					}

					linkedList = linkedList.getNext();
				}

				this.marble.handleControl(time);				

				let prevMarblePosition = this.marble.body.getPosition().clone();
				this.physicsWorld.step(1 / PHYSICS_TICK_RATE);

				this.marble.update();

				this.lastPhysicsTick += 1000 / PHYSICS_TICK_RATE;
				elapsed -= 1000 / PHYSICS_TICK_RATE;

				this.shapeImmunity.clear();
				for (let s of newImmunity) this.shapeImmunity.add(s);

				let movementDiff = this.marble.body.getPosition().sub(prevMarblePosition);
				let movementDist = movementDiff.length();
				let movementRot = new OIMO.Quat();
				movementRot.setArc(new OIMO.Vec3(0, 1, 0), movementDiff.clone().normalize());

				(this.auxMarbleShape._geom as OIMO.CapsuleGeometry)._halfHeight = movementDist;
				let pos = this.marble.body.getPosition().add(movementDiff.scale(0.5));

				this.auxMarbleBody.setPosition(pos);
				this.auxMarbleBody.setOrientation(movementRot);
				this.auxPhysicsWorld.getContactManager()._updateContacts();

				let current = this.auxMarbleBody.getContactLinkList();
				while (current) {
					let contact = current.getContact();
					contact._updateManifold();
					let contactShape = contact.getShape1();
					if (contactShape === this.auxMarbleShape) contactShape = contact.getShape2();
					let shape = this.shapeLookup.get(contactShape.userData);

					if (!shape) {
						if (contact.isTouching()) {
							shape = this.shapeColliderLookup.get(contactShape.userData);
							shape.onColliderInside(contactShape.userData);
						}
					} else {
						if (contact.isTouching()) {
							shape.onMarbleInside(time);
							if (!this.shapeInside.get(shape)) {
								this.shapeInside.set(shape, true);
								shape.onMarbleEnter(time);
							}
						} else {
							if (this.shapeInside.get(shape)) {
								this.shapeInside.set(shape, false);
								shape.onMarbleLeave(time);
							}
						}
					}

					current = current.getNext();
				}
			}
		}
	}

	getOrientationQuat(time: number) {
		let completion = Util.clamp((time - this.orientationChangeTime) / 300, 0, 1);
		return this.oldOrientationQuat.clone().slerp(this.newOrientationQuat, completion);
	}

	setUp(vec: OIMO.Vec3, time: number) {
		this.currentUp = vec;
		this.physicsWorld.setGravity(vec.scale(-1 * this.physicsWorld.getGravity().length()));

		let currentQuat = this.getOrientationQuat(time);
		let oldUp = new THREE.Vector3(0, 0, 1);
		oldUp.applyQuaternion(currentQuat);

		let quatChange = new THREE.Quaternion();
		quatChange.setFromUnitVectors(oldUp, Util.vecOimoToThree(vec));

		this.newOrientationQuat = currentQuat.clone().multiply(quatChange);
		this.oldOrientationQuat = currentQuat;
		this.orientationChangeTime = time;
	}

	setGravityIntensity(intensity: number) {
		let gravityVector = this.currentUp.scale(-1 * intensity);
		this.physicsWorld.setGravity(gravityVector);
	}

	onMouseMove(e: MouseEvent) {
		if (!document.pointerLockElement) return;

		this.pitch += e.movementY / 1000;
		this.pitch = Math.max(-Math.PI/2 + 0.0001, Math.min(Math.PI/2 - 0.0001, this.pitch));
		this.yaw -= e.movementX / 1000;
	}

	pickUpPowerUp(powerUp: PowerUp) {
		if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;
		this.heldPowerUp = powerUp;

		return true;
	}
}