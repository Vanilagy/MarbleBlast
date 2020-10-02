import { DifParser } from "./parsing/dif_parser";
import { Interior } from "./interior";
import * as THREE from "three";
import { renderer, camera, orthographicCamera } from "./rendering";
import OIMO from "./declarations/oimo";
import { Marble } from "./marble";
import { Shape } from "./shape";
import { MissionElementSimGroup, MissionElementType, MissionElementStaticShape, MissionElementItem, MisParser, MissionElementSun, MissionElementSky, MissionElementTrigger, MissionElementInteriorInstance, MissionElementScriptObject, MissionElementAudioProfile } from "./parsing/mis_parser";
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
import { Util, Scheduler } from "./util";
import { PowerUp } from "./shapes/power_up";
import { gameButtons } from "./input";
import { SmallDuctFan } from "./shapes/small_duct_fan";
import { PathedInterior } from "./pathed_interior";
import { Trigger } from "./triggers/trigger";
import { InBoundsTrigger } from "./triggers/in_bounds_trigger";
import { HelpTrigger } from "./triggers/help_trigger";
import { OutOfBoundsTrigger } from "./triggers/out_of_bounds_trigger";
import { displayTime, displayAlert, displayGemCount, gemCountElement, numberSources, setCenterText, displayHelp } from "./ui/game";
import { ResourceManager } from "./resources";
import { AudioManager, AudioSource } from "./audio";
import { PhysicsHelper } from "./physics";
import { ParticleManager } from "./particles";

export const PHYSICS_TICK_RATE = 120;
const SHAPE_OVERLAY_OFFSETS = {
	"shapes/images/helicopter.dts": -67,
	"shapes/items/superjump.dts": -70,
	"shapes/items/superbounce.dts": -55,
	"shapes/items/superspeed.dts": -53,
	"shapes/items/shockabsorber.dts": -53
};
export const GO_TIME = 3500;
const DEFAULT_PITCH = 0.45;

export interface TimeState {
	timeSinceLoad: number,
	currentAttemptTime: number,
	gameplayClock: number,
	physicsTickCompletion: number
}

export class Level extends Scheduler {
	mission: MissionElementSimGroup;
	scene: THREE.Scene;
	physics: PhysicsHelper;
	particles: ParticleManager;
	
	marble: Marble;
	interiors: Interior[] = [];
	shapes: Shape[] = [];
	overlayShapes: Shape[] = [];
	overlayScene: THREE.Scene;
	sunlight: THREE.DirectionalLight;
	sunDirection: THREE.Vector3;

	timeState: TimeState;
	lastPhysicsTick: number = null;
	
	pitch = 0;
	yaw = 0;
	currentTimeTravelBonus = 0;
	outOfBounds = false;
	finishTime: TimeState = null;
	finishYaw: number;
	finishPitch: number;

	currentUp = new OIMO.Vec3(0, 0, 1);
	orientationChangeTime = -Infinity;
	oldOrientationQuat = new THREE.Quaternion();
	newOrientationQuat = new THREE.Quaternion();
	heldPowerUp: PowerUp = null;
	totalGems = 0;
	gemCount = 0;
	timeTravelSound: AudioSource;
	music: AudioSource;

	constructor(missionGroup: MissionElementSimGroup) {
		super();

		this.mission = missionGroup;
		this.init();
	}

	async init() {
		this.physics = new PhysicsHelper(this);
		await this.initScene();
		await this.initMarble();
		await this.addSimGroup(this.mission);
		await this.initUi();
		await this.initSounds();

		this.particles = new ParticleManager(this);
		await this.particles.init();

		this.timeState = {
			timeSinceLoad: 0,
			currentAttemptTime: 0,
			gameplayClock: 0,
			physicsTickCompletion: 0
		};

		this.restart();
		for (let shape of this.shapes) await shape.onLevelStart();

		this.updateCamera(this.timeState); // Ensure that the camera is positioned correctly before the first tick
		this.render();
		setInterval(() => this.tick());
	}

	async initScene() {
		this.scene = new THREE.Scene();

		let sunElement = this.mission.elements.find((element) => element._type === MissionElementType.Sun) as MissionElementSun;
		this.sunDirection = MisParser.parseVector3(sunElement.direction);
		let directionalColor = MisParser.parseVector4(sunElement.color);
		let ambientColor = MisParser.parseVector4(sunElement.ambient);

		let ambientLight = new THREE.AmbientLight(new THREE.Color(ambientColor.x, ambientColor.y, ambientColor.z), 1);
        ambientLight.position.z = 0;
        ambientLight.position.y = 5;
		this.scene.add(ambientLight);
		
        let sunlight = new THREE.DirectionalLight(new THREE.Color(directionalColor.x, directionalColor.y, directionalColor.z), 1);
        this.scene.add(sunlight);
		sunlight.castShadow = true;
		sunlight.shadow.camera.far = 10000;
        sunlight.shadow.camera.left = -0.5;
        sunlight.shadow.camera.right = 0.5;
        sunlight.shadow.camera.bottom = -0.5;
		sunlight.shadow.camera.top = 0.5;
		sunlight.shadow.mapSize.width = 128;
		sunlight.shadow.mapSize.height = 128;
		sunlight.shadow.radius = 2;
		this.scene.add(sunlight.target); // Necessary for it to update
		this.sunlight = sunlight;

		let skyboxImages = await ResourceManager.loadImages([
            './assets/data/skies/sky_lf.jpg',
            './assets/data/skies/sky_rt.jpg',
            './assets/data/skies/sky_bk.jpg',
            './assets/data/skies/sky_fr.jpg',
            './assets/data/skies/sky_up.jpg',
            './assets/data/skies/sky_dn.jpg',
		]) as (HTMLImageElement | HTMLCanvasElement)[];
		skyboxImages[0] = Util.modifyImageWithCanvas(skyboxImages[0], -Math.PI/2, true);
		skyboxImages[1] = Util.modifyImageWithCanvas(skyboxImages[1], Math.PI/2, true);
		skyboxImages[2] = Util.modifyImageWithCanvas(skyboxImages[2], 0, true);
		skyboxImages[3] = Util.modifyImageWithCanvas(skyboxImages[3], Math.PI, true);
		skyboxImages[4] = Util.modifyImageWithCanvas(skyboxImages[4], Math.PI, true);
		skyboxImages[5] = Util.modifyImageWithCanvas(skyboxImages[5], 0, true);
		let skyboxTexture = new THREE.CubeTexture(skyboxImages);
		skyboxTexture.needsUpdate = true;
		this.scene.background = skyboxTexture;
	}

	async initMarble() {
		this.marble = new Marble(this);
		await this.marble.init();

		this.scene.add(this.marble.group);
		this.physics.initMarble();
	}

	async initUi() {
		await ResourceManager.loadImages(Object.values(numberSources).map(x => "./assets/ui/game/numbers/" + x));
		await ResourceManager.loadImages(["ready.png", "set.png", "go.png", "outofbounds.png", "powerup.png"].map(x => "./assets/ui/game/" + x));

		let hudOverlayShapePaths = new Set<string>();
		for (let shape of this.shapes) {
			if (shape instanceof PowerUp || shape instanceof Gem) {
				hudOverlayShapePaths.add(shape.dtsPath);
			}
		}

		this.overlayScene = new THREE.Scene();
		let overlayLight = new THREE.AmbientLight(0xffffff);
		this.overlayScene.add(overlayLight);

		for (let path of hudOverlayShapePaths) {
			let shape = new Shape();
			shape.dtsPath = path;
			shape.ambientRotate = true;
			await shape.init();

			this.overlayShapes.push(shape);
			if (path.includes("gem")) shape.ambientSpinFactor /= -2;
			else shape.ambientSpinFactor /= 2;
		}

		if (this.totalGems > 0) {
			gemCountElement.style.display = '';
			let gemOverlayShape = this.overlayShapes.find((shape) => shape.dtsPath.includes("gem"));
			this.overlayScene.add(gemOverlayShape.group);
		} else {
			gemCountElement.style.display = 'none';
		}
	}

	async initSounds() {
		let musicProfile = this.mission.elements.find((element) => element._type === MissionElementType.AudioProfile && element.description === "AudioMusic") as MissionElementAudioProfile;
		let musicFileName = musicProfile.fileName.slice(musicProfile.fileName.lastIndexOf('/') + 1);

		await AudioManager.loadBuffers(["spawn.wav", "ready.wav", "set.wav", "go.wav", "whoosh.wav", "timetravelactive.wav", "infotutorial.wav", musicFileName]);
		this.music = await AudioManager.createAudioSource(musicFileName, AudioManager.musicGain);
		this.music.node.loop = true;
		//this.music.play();
		// NO! TODO! I WANNA HEAR MORE THAN FUCKING SHELL!
	}

	async addSimGroup(simGroup: MissionElementSimGroup) {
		if (simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior)) {
			let pathedInterior = await PathedInterior.createFromSimGroup(simGroup);

			this.scene.add(pathedInterior.group);
			this.physics.addInterior(pathedInterior);
			this.interiors.push(pathedInterior);

			return;
		}

		let promises: Promise<any>[] = [];

		for (let element of simGroup.elements) {
			switch (element._type) {
				case MissionElementType.SimGroup: {
					promises.push(this.addSimGroup(element));
				}; break;
				case MissionElementType.InteriorInstance: {
					promises.push(this.addInterior(element));
				}; break;
				case MissionElementType.StaticShape: case MissionElementType.Item: {
					promises.push(this.addShape(element));
				}; break;
				case MissionElementType.Trigger: {
					this.addTrigger(element);
				}; break;
			}
		}

		await Promise.all(promises);
	}

	async addInterior(element: MissionElementInteriorInstance) {
		let path = element.interiorFile.slice(element.interiorFile.indexOf('data/'));
		let difFile = await DifParser.loadFile('./assets/' + path);
		if (!difFile) return;

		let interior = new Interior(difFile);
		await interior.init();
		interior.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation));

		this.scene.add(interior.group);
		this.physics.addInterior(interior);
		this.interiors.push(interior);
	}

	async addShape(element: MissionElementStaticShape | MissionElementItem) {
		let shape: Shape;

		let dataBlockLowerCase = element.dataBlock.toLowerCase();
		if (dataBlockLowerCase === "startpad") shape = new StartPad();
		else if (dataBlockLowerCase === "endpad") shape = new EndPad();
		else if (dataBlockLowerCase === "signfinish") shape = new SignFinish();
		else if (dataBlockLowerCase.startsWith("signplain")) shape = new SignPlain(element as MissionElementStaticShape);
		else if (dataBlockLowerCase.startsWith("gemitem")) shape = new Gem(element as MissionElementItem), this.totalGems++;
		else if (dataBlockLowerCase === "superjumpitem") shape = new SuperJump();
		else if (dataBlockLowerCase.startsWith("signcaution")) shape = new SignCaution(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "superbounceitem") shape = new SuperBounce();
		else if (dataBlockLowerCase === "roundbumper") shape = new RoundBumper();
		else if (dataBlockLowerCase === "trianglebumper") shape = new TriangleBumper();
		else if (dataBlockLowerCase === "helicopteritem") shape = new Helicopter();
		else if (dataBlockLowerCase === "ductfan") shape = new DuctFan();
		else if (dataBlockLowerCase === "smallductfan") shape = new SmallDuctFan();
		else if (dataBlockLowerCase === "antigravityitem") shape = new AntiGravity();
		else if (dataBlockLowerCase === "landmine") shape = new LandMine();
		else if (dataBlockLowerCase === "shockabsorberitem") shape = new ShockAbsorber();
		else if (dataBlockLowerCase === "superspeeditem") shape = new SuperSpeed();
		else if (dataBlockLowerCase === "timetravelitem") shape = new TimeTravel(element as MissionElementItem);
		else if (dataBlockLowerCase === "tornado") shape = new Tornado();
		else if (dataBlockLowerCase === "trapdoor") shape = new TrapDoor(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "oilslick") shape = new Oilslick();

		if (!shape) return;
		await shape.init();

		shape.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		this.scene.add(shape.group);
		this.physics.addShape(shape);
		this.shapes.push(shape);
	}

	addTrigger(element: MissionElementTrigger) {
		let trigger: Trigger;

		if (element.dataBlock === "OutOfBoundsTrigger") {
			trigger = new OutOfBoundsTrigger(element);
		} else if (element.dataBlock === "InBoundsTrigger") {
			trigger = new InBoundsTrigger(element);
		} else if (element.dataBlock === "HelpTrigger") {
			trigger = new HelpTrigger(element);
		}

		if (!trigger) return;

		this.physics.addTrigger(trigger);
	}

	restart() {
		this.timeState.currentAttemptTime = 0;
		this.timeState.gameplayClock = 0;
		this.currentTimeTravelBonus = 0;
		this.outOfBounds = false;
		
		if (this.totalGems > 0) {
			this.gemCount = 0;
			displayGemCount(this.gemCount, this.totalGems);
		}

		this.finishTime = null;

		let startPad = this.shapes.find((shape) => shape instanceof StartPad);
		this.marble.body.setPosition(new OIMO.Vec3(startPad.worldPosition.x, startPad.worldPosition.y, startPad.worldPosition.z + 3));
		this.marble.group.position.copy(Util.vecOimoToThree(this.marble.body.getPosition()));
		this.marble.reset();

		let euler = new THREE.Euler();
		euler.setFromQuaternion(startPad.worldOrientation, "ZXY");
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;

		let missionInfo = this.mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === "MissionInfo") as MissionElementScriptObject;
		if (missionInfo.startHelpText) displayHelp(missionInfo.startHelpText);

		for (let shape of this.shapes) shape.reset();
		for (let interior of this.interiors) interior.reset();

		this.currentUp = new OIMO.Vec3(0, 0, 1);
		this.orientationChangeTime = -Infinity;
		this.oldOrientationQuat = new THREE.Quaternion();
		this.newOrientationQuat = new THREE.Quaternion();
		this.setGravityIntensity(20);
		this.physics.reset();
		
		this.deselectPowerUp();
		setCenterText('none');

		this.timeTravelSound?.stop();
		this.timeTravelSound = null;

		//AudioManager.play('spawn.wav');

		this.clearSchedule();
		this.schedule(500, () => {
			setCenterText('ready');
			//AudioManager.play('ready.wav');
		});
		this.schedule(2000, () => {
			setCenterText('set');
			//AudioManager.play('set.wav');
		});
		this.schedule(GO_TIME, () => {
			setCenterText('go');
			//AudioManager.play('go.wav');
		});
		this.schedule(5500, () => {
			setCenterText('none');
		});
	}

	render() {
		let time = performance.now();
		this.tick(time);

		let physicsTickLength = 1000 / PHYSICS_TICK_RATE;
		let completion = Util.clamp((time - this.lastPhysicsTick) / physicsTickLength, 0, 1);
		let tempTimeState: TimeState = {
			timeSinceLoad: this.timeState.timeSinceLoad + completion * physicsTickLength,
			currentAttemptTime: this.timeState.currentAttemptTime + completion * physicsTickLength,
			gameplayClock: this.timeState.gameplayClock + completion * physicsTickLength,
			physicsTickCompletion: completion
		};

		this.marble.render(tempTimeState);
		for (let interior of this.interiors) interior.render(tempTimeState);
		for (let shape of this.shapes) shape.render(tempTimeState);
		this.particles.render(tempTimeState.timeSinceLoad);

		this.updateCamera(tempTimeState);

		let shadowCameraPosition = this.marble.group.position.clone();
		shadowCameraPosition.sub(this.sunDirection.clone().multiplyScalar(5));
		this.sunlight.shadow.camera.position.copy(shadowCameraPosition);
		this.sunlight.position.copy(shadowCameraPosition);
		this.sunlight.target.position.copy(this.marble.group.position);

		renderer.render(this.scene, camera);

		for (let overlayShape of this.overlayShapes) {
			overlayShape.group.position.x = 500;
			overlayShape.render(this.timeState);

			if (overlayShape.dtsPath.includes("gem")) {
				overlayShape.group.scale.setScalar(45);
				overlayShape.group.position.y = 25;
				overlayShape.group.position.z = -35;
			} else {
				overlayShape.group.scale.setScalar(40);
				overlayShape.group.position.y = window.innerWidth - 55;
				overlayShape.group.position.z = SHAPE_OVERLAY_OFFSETS[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_OFFSETS];
			}
		}

		renderer.autoClear = false;
		renderer.render(this.overlayScene, orthographicCamera);
		renderer.autoClear = true;

		displayTime(this.timeState.gameplayClock / 1000);

		requestAnimationFrame(() => this.render());
	}

	updateCamera(timeState: TimeState) {
		let marblePosition = Util.vecThreeToOimo(this.marble.group.position);
		let orientationQuat = this.getOrientationQuat(timeState);
		let up = new THREE.Vector3(0, 0, 1).applyQuaternion(orientationQuat);
		let directionVector = new THREE.Vector3(1, 0, 0);
		let cameraVerticalTranslation = new THREE.Vector3(0, 0, 0.3);

		if (this.finishTime) {
			this.pitch = Util.lerp(this.finishPitch, DEFAULT_PITCH, Util.clamp((timeState.timeSinceLoad - this.finishTime.timeSinceLoad) / 333, 0, 1));
			this.yaw = this.finishYaw - (timeState.timeSinceLoad - this.finishTime.timeSinceLoad) / 1000 * 0.6;
		}

		if (!this.outOfBounds) {
			camera.position.set(marblePosition.x, marblePosition.y, marblePosition.z);
			directionVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
			directionVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
			directionVector.applyQuaternion(orientationQuat);

			cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
			cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
			cameraVerticalTranslation.applyQuaternion(orientationQuat);

			let translationVec = directionVector.clone().multiplyScalar(-2.5).add(cameraVerticalTranslation);
			let ogTranslationLength = translationVec.length();
			translationVec.multiplyScalar(1 + 0.25 / translationVec.length());
			let rayCastDest = camera.position.clone().add(translationVec);

			let self = this;
			let minDistance = Infinity;
			this.physics.world.rayCast(marblePosition, Util.vecThreeToOimo(rayCastDest), {
				process(shape, hit) {
					if (shape === self.marble.shape) return;
					minDistance = Math.min(minDistance, hit.fraction * translationVec.length());
				}
			});

			let fac = Util.clamp(minDistance / ogTranslationLength - 0.25 / ogTranslationLength, 0.2, 1);

			cameraVerticalTranslation.multiplyScalar(fac);
			directionVector.multiplyScalar(2.5 * fac);
			camera.position.sub(directionVector);
			camera.up = up;
			camera.lookAt(Util.vecOimoToThree(marblePosition));
			camera.position.add(cameraVerticalTranslation);
		} else {
			camera.lookAt(Util.vecOimoToThree(marblePosition));
		}
	}

	tick(time?: number) {
		if (time === undefined) time = performance.now();

		if (gameButtons.use) {
			if (this.outOfBounds) {
				this.clearSchedule();
				this.restart();
			} else if (this.heldPowerUp) {
				this.heldPowerUp.use(this.timeState);
				this.deselectPowerUp();
			}
		}

		if (this.lastPhysicsTick === null) {
			this.lastPhysicsTick = time - 1000 / PHYSICS_TICK_RATE * 1.1;
		}

		let elapsed = time - this.lastPhysicsTick;
		if (elapsed >= 1000) {
			elapsed = 1000;
			this.lastPhysicsTick = time - 1000;
		}

		let tickDone = false;
		while (elapsed >= 1000 / PHYSICS_TICK_RATE) {
			this.timeState.timeSinceLoad += 1000 / PHYSICS_TICK_RATE;
			this.timeState.currentAttemptTime += 1000 / PHYSICS_TICK_RATE;
			this.lastPhysicsTick += 1000 / PHYSICS_TICK_RATE;
			elapsed -= 1000 / PHYSICS_TICK_RATE;

			this.tickSchedule(this.timeState.currentAttemptTime);
			this.physics.step();

			for (let shape of this.shapes) shape.tick(this.timeState);
			for (let interior of this.interiors) if (interior instanceof PathedInterior) interior.updatePosition();
			this.marble.handleControl(this.timeState);

			if (this.timeState.currentAttemptTime < GO_TIME) {
				let startPad = this.shapes.find((element) => element instanceof StartPad);
				let position = this.marble.body.getPosition().clone();
				position.x = startPad.worldPosition.x;
				position.y = startPad.worldPosition.y;
				this.marble.body.setPosition(position);

				let vel = this.marble.body.getLinearVelocity();
				vel.x = vel.y = 0;
				this.marble.body.setLinearVelocity(vel);

				let angVel = this.marble.body.getAngularVelocity();
				if (angVel.length() > 70) angVel.normalize().scaleEq(70);
				this.marble.body.setAngularVelocity(angVel);

				this.marble.shape.setFriction(0);
			} else {
				this.marble.shape.setFriction(1);

				if (this.currentTimeTravelBonus > 0) {
					this.currentTimeTravelBonus -= 1000 / PHYSICS_TICK_RATE;

					if (!this.timeTravelSound) {
						AudioManager.createAudioSource('timetravelactive.wav').then((source) => {
							this.timeTravelSound = source;
							this.timeTravelSound.node.loop = true;
							this.timeTravelSound.play();
						});
					}
				} else {
					this.timeState.gameplayClock += 1000 / PHYSICS_TICK_RATE;

					this.timeTravelSound?.stop();
					this.timeTravelSound = null;
				}

				if (this.currentTimeTravelBonus < 0) {
					this.timeState.gameplayClock += -this.currentTimeTravelBonus;
					this.currentTimeTravelBonus = 0;
				}
			}

			this.particles.tick();
			tickDone = true;
		}

		AudioManager.updatePositionalAudio(this.timeState, camera.position, this.yaw);
		if (tickDone) this.calculatePreemptiveTransforms();
	}

	calculatePreemptiveTransforms() {
		let vel = this.marble.body.getLinearVelocity();
		let predictedPosition = this.marble.body.getPosition().add(vel.scale(1 / PHYSICS_TICK_RATE)).add(this.physics.world.getGravity().scale(1 / PHYSICS_TICK_RATE**2 / 2));

		let angVel = this.marble.body.getAngularVelocity();
		let orientation = this.marble.body.getOrientation();
		let threeOrientation = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
		let changeQuat = new THREE.Quaternion();
		changeQuat.setFromAxisAngle(Util.vecOimoToThree(angVel).normalize(), angVel.length() / PHYSICS_TICK_RATE);
		threeOrientation.multiply(changeQuat);
		let predictedOrientation = new OIMO.Quat(threeOrientation.x, threeOrientation.y, threeOrientation.z, threeOrientation.w);

		this.marble.preemptivePosition = predictedPosition;
		this.marble.preemptiveOrientation = predictedOrientation;
	}

	getOrientationQuat(time: TimeState) {
		let completion = Util.clamp((time.currentAttemptTime - this.orientationChangeTime) / 300, 0, 1);
		return this.oldOrientationQuat.clone().slerp(this.newOrientationQuat, completion);
	}

	setUp(vec: OIMO.Vec3, time: TimeState) {
		this.currentUp = vec;
		this.physics.world.setGravity(vec.scale(-1 * this.physics.world.getGravity().length()));

		let currentQuat = this.getOrientationQuat(time);
		let oldUp = new THREE.Vector3(0, 0, 1);
		oldUp.applyQuaternion(currentQuat);

		let quatChange = new THREE.Quaternion();
		quatChange.setFromUnitVectors(oldUp, Util.vecOimoToThree(vec));

		this.newOrientationQuat = currentQuat.clone().multiply(quatChange);
		this.oldOrientationQuat = currentQuat;
		this.orientationChangeTime = time.currentAttemptTime;
	}

	setGravityIntensity(intensity: number) {
		let gravityVector = this.currentUp.scale(-1 * intensity);
		this.physics.world.setGravity(gravityVector);
	}

	onMouseMove(e: MouseEvent) {
		if (!document.pointerLockElement || this.finishTime) return;

		this.pitch += e.movementY / 1000;
		this.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, this.pitch)); // The player can't look straight up
		this.yaw -= e.movementX / 1000;
	}

	pickUpPowerUp(powerUp: PowerUp) {
		if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;
		this.heldPowerUp = powerUp;

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;

			if (overlayShape.dtsPath === powerUp.dtsPath) this.overlayScene.add(overlayShape.group);
			else this.overlayScene.remove(overlayShape.group);
		}

		AudioManager.play(powerUp.sounds[0]);

		return true;
	}

	deselectPowerUp() {
		if (!this.heldPowerUp) return;
		this.heldPowerUp = null;

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;
			this.overlayScene.remove(overlayShape.group);
		}
	}

	pickUpGem() {
		this.gemCount++;
		let string: string;

		if (this.gemCount === this.totalGems) {
			string = "You have all the gems, head for the finish!";
			AudioManager.play('gotallgems.wav');
		} else {
			string = "You picked up a gem.  ";

			let remaining = this.totalGems - this.gemCount;
			if (remaining === 1) {
				string += "Only one gem to go!";
			} else {
				string += `${remaining} gems to go!`;
			}

			AudioManager.play('gotgem.wav');
		}

		displayAlert(string);
		displayGemCount(this.gemCount, this.totalGems);
	}

	addTimeTravelBonus(bonus: number) {
		this.currentTimeTravelBonus += bonus;
	}

	goOutOfBounds() {
		if (this.outOfBounds) return;
		this.outOfBounds = true;

		this.updateCamera(this.timeState);
		setCenterText('outofbounds');
		AudioManager.play('whoosh.wav');

		this.schedule(this.timeState.currentAttemptTime + 2000, () => this.restart());
	}

	touchFinish() {
		if (this.finishTime !== null) return;

		if (this.gemCount < this.totalGems) {
			AudioManager.play('missinggems.wav');
			displayAlert("You can't finish without all the gems!!");
		} else {
			this.finishTime = Util.jsonClone(this.timeState);
			this.finishYaw = this.yaw;
			this.finishPitch = this.pitch;

			let endPad = this.shapes.find((shape) => shape instanceof EndPad) as EndPad;
			endPad.spawnFirework(this.timeState);
		}
	}
}