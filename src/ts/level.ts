import { Interior } from "./interior";
import * as THREE from "three";
import { renderer, camera, orthographicCamera, mainCanvas, marbleReflectionCamera, resize } from "./rendering";
import OIMO from "./declarations/oimo";
import { Marble, bounceParticleOptions } from "./marble";
import { Shape, SharedShapeData } from "./shape";
import { MissionElementSimGroup, MissionElementType, MissionElementStaticShape, MissionElementItem, MisParser, MissionElementTrigger, MissionElementInteriorInstance, MissionElementTSStatic, MissionElementParticleEmitterNode, MissionElementSky } from "./parsing/mis_parser";
import { StartPad } from "./shapes/start_pad";
import { SignFinish } from "./shapes/sign_finish";
import { SignPlain } from "./shapes/sign_plain";
import { EndPad, fireworkSmoke, redSpark, redTrail, blueSpark, blueTrail } from "./shapes/end_pad";
import { Gem } from "./shapes/gem";
import { SuperJump, superJumpParticleOptions } from "./shapes/super_jump";
import { SignCaution } from "./shapes/sign_caution";
import { SuperBounce } from "./shapes/super_bounce";
import { RoundBumper } from "./shapes/round_bumper";
import { Helicopter } from "./shapes/helicopter";
import { DuctFan } from "./shapes/duct_fan";
import { AntiGravity } from "./shapes/anti_gravity";
import { LandMine, landMineSmokeParticle, landMineSparksParticle } from "./shapes/land_mine";
import { ShockAbsorber } from "./shapes/shock_absorber";
import { SuperSpeed, superSpeedParticleOptions } from "./shapes/super_speed";
import { TimeTravel } from "./shapes/time_travel";
import { Tornado } from "./shapes/tornado";
import { TrapDoor } from "./shapes/trap_door";
import { TriangleBumper } from "./shapes/triangle_bumper";
import { Oilslick } from "./shapes/oilslick";
import { Util, Scheduler } from "./util";
import { PowerUp } from "./shapes/power_up";
import { isPressed, releaseAllButtons, gamepadAxes, getPressedFlag, resetPressedFlag } from "./input";
import { SmallDuctFan } from "./shapes/small_duct_fan";
import { PathedInterior } from "./pathed_interior";
import { Trigger } from "./triggers/trigger";
import { InBoundsTrigger } from "./triggers/in_bounds_trigger";
import { HelpTrigger } from "./triggers/help_trigger";
import { OutOfBoundsTrigger } from "./triggers/out_of_bounds_trigger";
import { ResourceManager } from "./resources";
import { AudioManager, AudioSource } from "./audio";
import { PhysicsHelper } from "./physics";
import { ParticleManager, ParticleEmitterOptions, particleNodeEmittersEmitterOptions, ParticleEmitter } from "./particles";
import { StorageManager } from "./storage";
import { Replay } from "./replay";
import { Mission } from "./mission";
import { PushButton } from "./shapes/push_button";
import { DifFile } from "./parsing/dif_parser";
import { state } from "./state";
import { Sign } from "./shapes/sign";
import { Magnet } from "./shapes/magnet";
import { Nuke, nukeSmokeParticle, nukeSparksParticle } from "./shapes/nuke";
import { TeleportTrigger } from "./triggers/teleport_trigger";
import { DestinationTrigger } from "./triggers/destination_trigger";
import { Checkpoint } from "./shapes/checkpoint";
import { CheckpointTrigger } from "./triggers/checkpoint_trigger";
import { EasterEgg } from "./shapes/easter_egg";
import { RandomPowerUp } from "./shapes/random_power_up";
import { MbpPauseScreen } from "./ui/pause_screen_mbp";
import { MbpHud } from "./ui/hud_mbp";
import { Sky } from "./shapes/sky";
import { Glass } from "./shapes/glass";
import { Blast } from "./shapes/blast";
import { MegaMarble } from "./shapes/mega_marble";

/** How often the physics will be updated, per second. */
export const PHYSICS_TICK_RATE = 120;
const PLAYBACK_SPEED = 1; // Major attack surface for cheaters here 😟
/** The vertical offsets of overlay shapes to get them all visually centered. */
const SHAPE_OVERLAY_OFFSETS = {
	"shapes/images/helicopter.dts": -67,
	"shapes/items/superjump.dts": -70,
	"shapes/items/superbounce.dts": -55,
	"shapes/items/superspeed.dts": -53,
	"shapes/items/shockabsorber.dts": -53,
	"shapes/items/megamarble.dts": -70,
};
const SHAPE_OVERLAY_SCALES = {
	"shapes/items/megamarble.dts": 60,
};
/** The time in milliseconds when the marble is released from the start pad. */
export const GO_TIME = 3500;
/** Default camera pitch */
export const DEFAULT_PITCH = 0.45;
const BLAST_CHARGE_TIME = 25000;
const MAX_TIME = 999 * 60 * 1000 + 59 * 1000 + 999; // 999:59.99, should be large enough
const MBP_SONGS = ['astrolabe.ogg', 'endurance.ogg', 'flanked.ogg', 'grudge.ogg', 'mbp old shell.ogg', 'quiet lab.ogg', 'rising temper.ogg', 'seaside revisited.ogg', 'the race.ogg'];

/** The map used to get particle emitter options for a ParticleEmitterNode. */
const particleEmitterMap: Record<string, ParticleEmitterOptions> = {
	MarbleBounceEmitter: bounceParticleOptions,
	MarbleTrailEmitter: particleNodeEmittersEmitterOptions.MarbleTrailEmitter,
	MarbleSuperJumpEmitter: Object.assign(ParticleEmitter.cloneOptions(superJumpParticleOptions), {
		emitterLifetime: 5000,
		ambientVelocity: new THREE.Vector3(-0.3, 0, -0.5)
	}),
	MarbleSuperSpeedEmitter: Object.assign(ParticleEmitter.cloneOptions(superSpeedParticleOptions), {
		emitterLifetime: 5000,
		ambientVelocity: new THREE.Vector3(-0.5, 0, -0.5)
	}),
	LandMineEmitter: particleNodeEmittersEmitterOptions.LandMineEmitter,
	LandMineSmokeEmitter: landMineSmokeParticle,
	LandMineSparkEmitter: landMineSparksParticle,
	NukeEmitter: particleNodeEmittersEmitterOptions.LandMineEmitter, // It ain't any different
	NukeSmokeEmitter: nukeSmokeParticle,
	NukeSparkEmitter: nukeSparksParticle,
	FireWorkSmokeEmitter: fireworkSmoke,
	RedFireWorkSparkEmitter: redSpark,
	RedFireWorkTrailEmitter: redTrail,
	BlueFireWorkSparkEmitter: blueSpark,
	BlueFireWorkTrailEmitter: blueTrail
};

export interface TimeState {
	/** The time since the level was loaded, this ticks up continuously. */
	timeSinceLoad: number,
	/** The time of the current attempt, this also ticks up continuously but is reset to 0 on restart. */
	currentAttemptTime: number,
	/** The gameplay time, affected by time travels and what not. */
	gameplayClock: number,
	/** A value in [0, 1], representing how far in between two physics ticks we are. */
	physicsTickCompletion: number
}

interface LoadingState {
	/** How many things have loaded */
	loaded: number,
	/** How many things are going to be loaded */
	total: number
}

/** The central control unit of gameplay. Handles loading, simulation and rendering. */
export class Level extends Scheduler {
	mission: Mission;
	/** Whether or not this level has the classic additional features of MBU levels, such as a larger marble and the blast functionality. */
	loadingState: LoadingState;

	scene: THREE.Scene;
	sunlight: THREE.DirectionalLight;
	sunDirection: THREE.Vector3;
	envMap: THREE.Texture;
	physics: PhysicsHelper;
	particles: ParticleManager;
	marble: Marble;
	interiors: Interior[] = [];
	sharedInteriorData = new Map<DifFile["detailLevels"][number], any>();
	triggers: Trigger[] = [];

	shapes: Shape[] = [];
	/** Holds data shared between multiple shapes with the same constructor and .dts path. */
	sharedShapeData = new Map<string, Promise<SharedShapeData>>();
	/** The shapes used for drawing HUD overlay (powerups in the corner) */
	overlayShapes: Shape[] = [];
	overlayScene: THREE.Scene;
	/** The last end pad element in the mission file. */
	endPadElement: MissionElementStaticShape;

	/** Holds the setInterval id */
	tickInterval: number;
	timeState: TimeState;
	/** The last performance.now() time the physics were ticked. */
	lastPhysicsTick: number = null;
	paused = true;
	/** If the level is stopped, it shouldn't be used anymore. */
	stopped = false;
	/** The timestate at the moment of finishing. */
	finishTime: TimeState = null;
	finishYaw: number;
	finishPitch: number;
	/** The maximum time that has been displayed in the current attempt. */
	maxDisplayedTime = 0;
	
	pitch = 0;
	yaw = 0;
	/** Where the camera was when the marble went OOB. */
	oobCameraPosition: THREE.Vector3;
	lastVerticalTranslation = new THREE.Vector3();
	currentUp = new OIMO.Vec3(0, 0, 1);
	/** The last time the orientation was changed (by a gravity modifier) */
	orientationChangeTime = -Infinity;
	/** The old camera orientation quat */
	oldOrientationQuat = new THREE.Quaternion();
	/** The new target camera orientation quat  */
	newOrientationQuat = new THREE.Quaternion();
	/** See usage. */
	previousMouseMovementDistance = 0;

	defaultGravity = 20;
	currentTimeTravelBonus = 0;
	heldPowerUp: PowerUp = null;
	totalGems = 0;
	gemCount = 0;
	blastAmount = 0;
	outOfBounds = false;
	outOfBoundsTime: TimeState;
	/** When the jump button was pressed, remember that it was pressed until the next tick to execute the jump. */
	jumpQueued = false;
	useQueued = false;
	blastQueued = false;
	/** Whether or not the player is currently pressing the restart button. */
	pressingRestart = false;
	restartPressTime: number = null;
	/** The time state at the last point the help text was updated. */
	helpTextTimeState: TimeState = null;
	/** The time state at the last point the alert text was updated. */
	alertTextTimeState: TimeState = null;

	/** Stores the shape that is the destination of the current checkpoint. */
	currentCheckpoint: Shape = null;
	/** If the checkpoint was triggered by a trigger, this field stores that trigger. */
	currentCheckpointTrigger: CheckpointTrigger = null;
	checkpointCollectedGems = new Set<Gem>();
	checkpointHeldPowerUp: PowerUp = null;
	/** Up vector at the point of checkpointing */
	checkpointUp: OIMO.Vec3 = null;
	checkpointBlast: number = null;
	
	timeTravelSound: AudioSource;
	/** The alarm that plays in MBP when the player is about to pass the "par time". */
	alarmSound: AudioSource;
	music: AudioSource;
	originalMusicName: string;
	replay: Replay;

	constructor(mission: Mission) {
		super();
		this.mission = mission;
		this.loadingState = { loaded: 0, total: 0 };
	}

	/** Loads all necessary resources and builds the mission. */
	async init() {
		// Scan the mission for elements to determine required loading effort
		for (let element of this.mission.allElements) {
			if ([MissionElementType.InteriorInstance, MissionElementType.Item, MissionElementType.PathedInterior, MissionElementType.StaticShape, MissionElementType.TSStatic].includes(element._type)) {
				this.loadingState.total++;

				// Override the end pad element. We do this because only the last finish pad element will actually do anything.
				if (element._type === MissionElementType.StaticShape && element.datablock?.toLowerCase() === 'endpad') this.endPadElement = element;
			}
		}
		this.loadingState.total += 6 + 1 + 3 + 6; // For the scene, marble, UI and sounds (includes music!)

		this.timeState = {
			timeSinceLoad: 0,
			currentAttemptTime: 0,
			gameplayClock: 0,
			physicsTickCompletion: 0
		};

		// Apply overridden gravity
		if (this.mission.misFile.marbleAttributes["gravity"] !== undefined) {
			this.defaultGravity = MisParser.parseNumber(this.mission.misFile.marbleAttributes["gravity"]);
		}

		this.physics = new PhysicsHelper(this);
		await this.initScene();
		await this.initMarble(); this.loadingState.loaded += 1;
		this.particles = new ParticleManager(this);
		await this.particles.init();
		let soundPromise = this.initSounds();
		await this.addSimGroup(this.mission.root);
		await this.initUi(); this.loadingState.loaded += 3;
		await soundPromise; this.loadingState.loaded += 6;

		this.replay = new Replay(this);
	}

	async start() {
		if (this.stopped) return;

		this.paused = false;
		this.restart(true);
		for (let interior of this.interiors) await interior.onLevelStart();
		for (let shape of this.shapes) await shape.onLevelStart();
		AudioManager.normalizePositionalAudioVolume();

		resize(); // To update renderer
		mainCanvas.classList.remove('hidden');
		this.updateCamera(this.timeState); // Ensure that the camera is positioned correctly before the first tick for correct positional audio playback
		this.render(); // This will also do a tick
		this.tickInterval = setInterval(() => this.tick());
		this.music.play();

		// Render them once
		for (let shape of this.shapes) if (shape.isTSStatic) shape.render(this.timeState);
	}

	async initScene() {
		this.scene = new THREE.Scene();

		let addedShadow = false;
		// There could be multiple suns, so do it for all of them
		for (let element of this.mission.allElements) {
			if (element._type !== MissionElementType.Sun) continue;

			let directionalColor = MisParser.parseVector4(element.color);
			let ambientColor = MisParser.parseVector4(element.ambient);
			let sunDirection = MisParser.parseVector3(element.direction);

			// Create the ambient light
			let ambientLight = new THREE.AmbientLight(new THREE.Color(ambientColor.x, ambientColor.y, ambientColor.z), 1);
			ambientLight.position.z = 0;
			ambientLight.position.y = 5;
			this.scene.add(ambientLight);

			// Create the sunlight and set up the shadow camera
			let sunlight = new THREE.DirectionalLight(new THREE.Color(directionalColor.x, directionalColor.y, directionalColor.z), 1);
			this.scene.add(sunlight);

			// The first sun will be the "shadow sun"
			if (!addedShadow) {
				addedShadow = true;

				sunlight.castShadow = true;
				sunlight.shadow.camera.far = 10000;
				sunlight.shadow.camera.left = -0.8; // The shadow area itself is very small 'cause it only needs to cover the marble and the gyrocopter
				sunlight.shadow.camera.right = 0.8;
				sunlight.shadow.camera.bottom = -0.8;
				sunlight.shadow.camera.top = 0.8;
				sunlight.shadow.mapSize.width = 200;
				sunlight.shadow.mapSize.height = 200;
				sunlight.shadow.radius = 2;
				this.scene.add(sunlight.target); // Necessary for it to update

				this.sunlight = sunlight;
				this.sunDirection = sunDirection;
			} else {
				sunlight.position.copy(sunDirection.multiplyScalar(-1));
			}
		}

		let skyElement = this.mission.allElements.find((element) => element._type === MissionElementType.Sky) as MissionElementSky;

		let fogColor = MisParser.parseVector4(skyElement.fogcolor);
		// Uber strange way Torque maps these values:
		if (fogColor.x > 1) fogColor.x = 1 - (fogColor.x - 1) % 256 / 256;
		if (fogColor.y > 1) fogColor.y = 1 - (fogColor.y - 1) % 256 / 256;
		if (fogColor.z > 1) fogColor.z = 1 - (fogColor.z - 1) % 256 / 256;

		let skySolidColor = MisParser.parseVector4(skyElement.skysolidcolor);
		// This is kind of a weird situation here. It seems as if when the skysolidcolor isn't the default value, it's used as the skycolor; otherwise, fog color is used. Strange.
		if (skySolidColor.x !== 0.6 || skySolidColor.y !== 0.6 || skySolidColor.z !== 0.6) fogColor = skySolidColor;
		
		renderer.setClearColor(new THREE.Color(fogColor.x, fogColor.y, fogColor.z), 1);

		camera.far = MisParser.parseNumber(skyElement.visibledistance);
		camera.fov = StorageManager.data.settings.fov;
		camera.updateProjectionMatrix();

		if (skyElement.useskytextures === "1") {
			// Create the skybox
			let skyboxCubeTexture = await this.createSkyboxCubeTexture(skyElement.materiallist.slice(skyElement.materiallist.indexOf('data/') + 'data/'.length), true);
			if (skyboxCubeTexture) this.scene.background = skyboxCubeTexture;
		}

		let envmapCubeTexture = await this.createSkyboxCubeTexture('skies/sky_day.dml', false); // Always the default MBG skybox
		// Create the environment map from the skybox. Don't use the actual envmap image file because its projection requires like three PhDs in mathematics.
		this.envMap = Util.downsampleCubeTexture(renderer, envmapCubeTexture as any);
	}

	async createSkyboxCubeTexture(dmlPath: string, increaseLoading: boolean) {
		let dmlDirectoryPath = dmlPath.slice(0, dmlPath.lastIndexOf('/'));
		let dmlFile = await this.mission.getResource(dmlPath);
		if (dmlFile) {
			// Get all skybox images
			let lines = (await ResourceManager.readBlobAsText(dmlFile)).split('\n').map(x => x.trim().toLowerCase());
			let skyboxImages: (HTMLImageElement | HTMLCanvasElement)[] = [];

			for (let i = 0; i < 6; i++) {
				let line = lines[i];
				let filename = this.mission.getFullNamesOf(dmlDirectoryPath + '/' + line)[0];

				if (!filename) {
					skyboxImages.push(new Image());
				} else {
					let image = await this.mission.getImage(dmlDirectoryPath + '/' + filename);
					skyboxImages.push(image);
				}

				if (increaseLoading) this.loadingState.loaded++;
			}

			// Reorder them to three.js order
			skyboxImages = Util.remapIndices(skyboxImages, [3, 1, 2, 0, 4, 5]);

			// three.js skyboxes are aligned with respect to y-up, but everything here is z-up. Therefore we need to do some manual image transformation hackery.
			skyboxImages[0] = Util.modifyImageWithCanvas(skyboxImages[0], -Math.PI/2, true);
			skyboxImages[1] = Util.modifyImageWithCanvas(skyboxImages[1], Math.PI/2, true);
			skyboxImages[2] = Util.modifyImageWithCanvas(skyboxImages[2], 0, true);
			skyboxImages[3] = Util.modifyImageWithCanvas(skyboxImages[3], Math.PI, true);
			skyboxImages[4] = Util.modifyImageWithCanvas(skyboxImages[4], Math.PI, true);
			skyboxImages[5] = Util.modifyImageWithCanvas(skyboxImages[5], 0, true);
			let skyboxTexture = new THREE.CubeTexture(skyboxImages);
			skyboxTexture.needsUpdate = true;

			return skyboxTexture;
		} else {
			if (increaseLoading) this.loadingState.loaded += 6;
			return null;
		}
	}

	async initMarble() {
		this.marble = new Marble(this);
		await this.marble.init();

		this.scene.add(this.marble.group);
		this.physics.initMarble();
	}

	async initUi() {
		// Load all necessary UI image elements
		await state.menu.hud.load();

		// Set up the HUD overlay

		let hudOverlayShapePaths = new Set<string>();
		for (let shape of this.shapes) {
			if (shape instanceof PowerUp || shape instanceof Gem) {
				if (shape instanceof PowerUp && shape.autoUse) continue; // Can't collect these aye

				// We need to display the gem and powerup shapes in the HUD
				if (shape instanceof RandomPowerUp) {
					for (let path of shape.getAllDtsPaths()) hudOverlayShapePaths.add(path);
				} else {
					hudOverlayShapePaths.add(shape.dtsPath);
				}
			}
		}

		this.overlayScene = new THREE.Scene();
		let overlayLight = new THREE.AmbientLight(0xffffff);
		this.overlayScene.add(overlayLight);

		for (let path of hudOverlayShapePaths) {
			let shape = new Shape();
			shape.dtsPath = path;
			shape.ambientRotate = true;
			shape.showSequences = false;
			// MBP's UI gem color is randomized
			if (path.includes("gem") && state.menu.hud instanceof MbpHud) shape.matNamesOverride['base.gem'] = Gem.pickRandomColor() + '.gem';

			await shape.init();

			this.overlayShapes.push(shape);
			this.overlayScene.add(shape.group); // Add the shape temporarily (permanently if gem) for a GPU update
			if (path.includes("gem")) shape.ambientSpinFactor /= -2; // Gems spin the other way apparently
			else shape.ambientSpinFactor /= 2;
		}

		if (this.totalGems > 0) {
			// Show the gem overlay
			state.menu.hud.setGemVisibility(true);
		} else {
			// Hide the gem UI
			state.menu.hud.setGemVisibility(false);
		}

		// Render everything once to force a GPU upload
		renderer.render(this.overlayScene, orthographicCamera);

		// Remove everything but gems again
		for (let shape of this.overlayShapes) {
			if (shape.dtsPath.includes('gem')) continue;
			this.overlayScene.remove(shape.group);
		}

		if (state.menu.pauseScreen instanceof MbpPauseScreen) state.menu.pauseScreen.jukebox.reset();
	}

	async initSounds() {
		let musicFileName: string;
		if (this.mission.missionInfo.music && this.mission.missionInfo.music.toLowerCase() !== 'pianoforte.ogg') {
			musicFileName = this.mission.missionInfo.music.toLowerCase();
			this.originalMusicName = musicFileName;
		} else {
			if (this.mission.modification === 'gold') {
				// Play the song based on the level index
				let levelIndex = state.menu.levelSelect.currentMissionArray.indexOf(this.mission);
				musicFileName = ['groovepolice.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3]; // The default music choice is based off of level index
				// Yes, the extra space is intentional
				this.originalMusicName = ['groove police.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3];
			} else {
				// Play a random *MBP* song
				musicFileName = Util.randomFromArray(MBP_SONGS);
				this.originalMusicName = musicFileName;
			}
		}
		if (state.modification === 'platinum') musicFileName = 'music/' + musicFileName;

		let toLoad = ["spawn.wav", "ready.wav", "set.wav", "go.wav", "whoosh.wav", musicFileName];
		if (isFinite(this.mission.qualifyTime) && state.modification === 'platinum') toLoad.push("alarm.wav", "alarm_timeout.wav", "infotutorial.wav");

		try {
			await AudioManager.loadBuffers(toLoad);
		} catch (e) {
			// Something died, maybe it was the music, try replacing it with a song we know exists
			let newMusic = Util.randomFromArray(MBP_SONGS);
			this.originalMusicName = newMusic;
			toLoad[toLoad.indexOf(musicFileName)] = 'music/' + newMusic;
			musicFileName = 'music/' + newMusic;
			await AudioManager.loadBuffers(toLoad);
		}
		
		this.music = AudioManager.createAudioSource(musicFileName, AudioManager.musicGain);
		this.music.setLoop(true);
		await this.music.promise;
	}

	/** Adds all elements within a sim group. */
	async addSimGroup(simGroup: MissionElementSimGroup) {
		// Check if it's a pathed interior group
		if (simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior)) {
			// Create the pathed interior
			let pathedInterior = await PathedInterior.createFromSimGroup(simGroup, this);
			if (!pathedInterior) return;

			if (pathedInterior.hasCollision) this.physics.addInterior(pathedInterior);
			for (let trigger of pathedInterior.triggers) this.triggers.push(trigger);

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
					promises.push(this.addTrigger(element));
				}; break;
				case MissionElementType.TSStatic: {
					promises.push(this.addTSStatic(element));
				}; break;
				case MissionElementType.ParticleEmitterNode: {
					this.addParticleEmitterNode(element);
				}; break;
			}
		}

		await Promise.all(promises);
	}

	async addInterior(element: MissionElementInteriorInstance) {
		let { dif: difFile, path } = await this.mission.getDif(element.interiorfile);
		if (!difFile) return;

		let interior = new Interior(difFile, path, this);
		this.interiors.push(interior);

		await Util.wait(10); // See shapes for the meaning of this hack
		await interior.init(element._id);

		let interiorPosition = MisParser.parseVector3(element.position);
		let interiorRotation = MisParser.parseRotation(element.rotation);
		let interiorScale = MisParser.parseVector3(element.scale);
		let hasCollision = interiorScale.x !== 0 && interiorScale.y !== 0 && interiorScale.z !== 0; // Don't want to add buggy geometry

		// Fix zero-volume interiors so they receive correct lighting
		if (interiorScale.x === 0) interiorScale.x = 0.0001;
		if (interiorScale.y === 0) interiorScale.y = 0.0001;
		if (interiorScale.z === 0) interiorScale.z = 0.0001;

		interior.setTransform(interiorPosition, interiorRotation, interiorScale);

		if (hasCollision) this.physics.addInterior(interior);
	}

	async addShape(element: MissionElementStaticShape | MissionElementItem) {
		let shape: Shape;

		// Add the correct shape based on type
		let dataBlockLowerCase = element.datablock?.toLowerCase();
		if (!dataBlockLowerCase) {} // Make sure we don't do anything if there's no data block
		else if (dataBlockLowerCase === "startpad") shape = new StartPad();
		else if (dataBlockLowerCase === "endpad") shape = new EndPad(element === this.endPadElement);
		else if (dataBlockLowerCase === "signfinish") shape = new SignFinish();
		else if (dataBlockLowerCase.startsWith("signplain")) shape = new SignPlain(element as MissionElementStaticShape);
		else if (dataBlockLowerCase.startsWith("gemitem")) shape = new Gem(element as MissionElementItem), this.totalGems++;
		else if (dataBlockLowerCase === "superjumpitem") shape = new SuperJump(element as MissionElementItem);
		else if (dataBlockLowerCase.startsWith("signcaution")) shape = new SignCaution(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "superbounceitem") shape = new SuperBounce(element as MissionElementItem);
		else if (dataBlockLowerCase === "roundbumper") shape = new RoundBumper();
		else if (dataBlockLowerCase === "trianglebumper") shape = new TriangleBumper();
		else if (dataBlockLowerCase === "helicopteritem") shape = new Helicopter(element as MissionElementItem);
		else if (dataBlockLowerCase === "ductfan") shape = new DuctFan();
		else if (dataBlockLowerCase === "smallductfan") shape = new SmallDuctFan();
		else if (dataBlockLowerCase === "antigravityitem") shape = new AntiGravity(element as MissionElementItem);
		else if (dataBlockLowerCase === "norespawnantigravityitem") shape = new AntiGravity(element as MissionElementItem, true);
		else if (dataBlockLowerCase === "landmine") shape = new LandMine();
		else if (dataBlockLowerCase === "shockabsorberitem") shape = new ShockAbsorber(element as MissionElementItem);
		else if (dataBlockLowerCase === "superspeeditem") shape = new SuperSpeed(element as MissionElementItem);
		else if (["timetravelitem", "timepenaltyitem"].includes(dataBlockLowerCase)) shape = new TimeTravel(element as MissionElementItem);
		else if (dataBlockLowerCase === "tornado") shape = new Tornado();
		else if (dataBlockLowerCase === "trapdoor") shape = new TrapDoor(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "oilslick") shape = new Oilslick();
		else if (dataBlockLowerCase === "pushbutton") shape = new PushButton();
		else if (dataBlockLowerCase.startsWith("sign") || dataBlockLowerCase === "arrow") shape = new Sign(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "magnet") shape = new Magnet();
		else if (dataBlockLowerCase === "nuke") shape = new Nuke();
		else if (dataBlockLowerCase === "checkpoint") shape = new Checkpoint();
		else if (dataBlockLowerCase === "easteregg") shape = new EasterEgg(element as MissionElementItem);
		else if (dataBlockLowerCase === "randompowerupitem") shape = new RandomPowerUp(element as MissionElementItem);
		else if (["clear", "cloudy", "dusk", "wintry"].includes(dataBlockLowerCase)) shape = new Sky(dataBlockLowerCase);
		else if (/glass_\d+shape/.test(dataBlockLowerCase)) shape = new Glass(dataBlockLowerCase);
		else if (dataBlockLowerCase === "blastitem") shape = new Blast(element as MissionElementItem);
		else if (dataBlockLowerCase === "megamarbleitem") shape = new MegaMarble(element as MissionElementItem);

		if (!shape) return;

		this.shapes.push(shape);
		// This is a bit hacky, but wait a short amount so that all shapes will have been created by the time this codepath continues. This is necessary for correct sharing of data between shapes.
		await Util.wait(10);
		await shape.init(this, element);

		// Set the shape's transform
		let shapePosition = MisParser.parseVector3(element.position);
		let shapeRotation = MisParser.parseRotation(element.rotation);
		let shapeScale = MisParser.parseVector3(element.scale);

		// Apparently we still do collide with zero-volume shapes
		if (shapeScale.x === 0) shapeScale.x = 0.0001;
		if (shapeScale.y === 0) shapeScale.y = 0.0001;
		if (shapeScale.z === 0) shapeScale.z = 0.0001;

		shape.setTransform(shapePosition, shapeRotation, shapeScale);

		this.scene.add(shape.group);
		this.physics.addShape(shape);
	}

	async addTrigger(element: MissionElementTrigger) {
		let trigger: Trigger;

		// Create a trigger based on type
		let dataBlockLowerCase = element.datablock?.toLowerCase();
		if (dataBlockLowerCase === "outofboundstrigger") {
			trigger = new OutOfBoundsTrigger(element, this);
		} else if (dataBlockLowerCase === "inboundstrigger") {
			trigger = new InBoundsTrigger(element, this);
		} else if (dataBlockLowerCase === "helptrigger") {
			trigger = new HelpTrigger(element, this);
		} else if (dataBlockLowerCase === "teleporttrigger") {
			trigger = new TeleportTrigger(element, this);
		} else if (dataBlockLowerCase === "destinationtrigger") {
			trigger = new DestinationTrigger(element, this);
		} else if (dataBlockLowerCase === "checkpointtrigger") {
			trigger = new CheckpointTrigger(element, this);
		}

		if (!trigger) return;

		this.triggers.push(trigger);
		this.physics.addTrigger(trigger);

		await trigger.init();
	}

	/** Adds a TSStatic (totally static shape) to the world. */
	async addTSStatic(element: MissionElementTSStatic) {
		let shape = new Shape();
		let shapeName = element.shapename.toLowerCase();
		let index = shapeName.indexOf('data/');
		if (index === -1) return;

		shape.dtsPath = shapeName.slice(index + 'data/'.length);
		shape.isTSStatic = true;
		shape.shareId = 1;
		shape.useInstancing = true; // We can safely instance all TSStatics
		if (shapeName.includes('colmesh')) shape.receiveShadows = false; // Special case for colmesh

		this.shapes.push(shape);
		await Util.wait(10); // Same hack as for regular shapes
		try {
			await shape.init(this, element);
		} catch (e) {
			console.error("Error in creating TSStatic, skipping it for now.", e);
			Util.removeFromArray(this.shapes, shape);
			return;
		}

		shape.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		this.scene.add(shape.group);
		if (shape.worldScale.x !== 0 && shape.worldScale.y !== 0 && shape.worldScale.z !== 0) this.physics.addShape(shape); // Only add the shape if it actually has any volume
	}

	/** Adds a ParticleEmitterNode to the world. */
	addParticleEmitterNode(element: MissionElementParticleEmitterNode) {
		let emitterOptions = particleEmitterMap[element.emitter];
		if (!emitterOptions) return;

		this.particles.createEmitter(emitterOptions, MisParser.parseVector3(element.position));
	}

	/** Restarts and resets the level. */
	restart(forceHardRestart: boolean) {
		if (!forceHardRestart && this.currentCheckpoint) {
			// There's a checkpoint, so load its state instead of restarting the whole level
			this.loadCheckpointState();
			return;
		}

		let hud = state.menu.hud;

		this.timeState.currentAttemptTime = 0;
		this.timeState.gameplayClock = 0;
		this.currentTimeTravelBonus = 0;
		this.outOfBounds = false;
		this.lastPhysicsTick = null;
		this.maxDisplayedTime = 0;
		this.blastAmount = 0;
		
		if (this.totalGems > 0) {
			this.gemCount = 0;
			hud.displayGemCount(this.gemCount, this.totalGems);
		}

		this.currentCheckpoint = null;
		this.currentCheckpointTrigger = null;
		this.checkpointCollectedGems.clear();
		this.checkpointHeldPowerUp = null;
		this.checkpointUp = null;
		this.checkpointBlast = null;
		this.restartPressTime = null;

		this.finishTime = null;

		let { position: startPosition, euler } = this.getStartPositionAndOrientation();

		// Place the marble a bit above the start pad position
		this.marble.body.setPosition(new OIMO.Vec3(startPosition.x, startPosition.y, startPosition.z + 3));
		this.marble.group.position.copy(Util.vecOimoToThree(this.marble.body.getPosition()));
		this.marble.reset();

		// Determine starting camera orientation based on the start pad
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;

		let missionInfo = this.mission.missionInfo;
		if (missionInfo.starthelptext) state.menu.hud.displayHelp(missionInfo.starthelptext); // Show the start help text

		for (let shape of this.shapes) shape.reset();
		for (let interior of this.interiors) interior.reset();
		for (let trigger of this.triggers) trigger.reset();

		// Reset the physics
		this.currentUp = new OIMO.Vec3(0, 0, 1);
		this.orientationChangeTime = -Infinity;
		this.oldOrientationQuat = new THREE.Quaternion();
		this.newOrientationQuat = new THREE.Quaternion();
		this.setGravityIntensity(this.defaultGravity);
		this.physics.reset();
		
		this.deselectPowerUp();
		hud.setCenterText('none');

		this.timeTravelSound?.stop();
		this.timeTravelSound = null;
		this.alarmSound?.stop();
		this.alarmSound = null;

		this.replay.init();

		// Queue the ready-set-go events

		AudioManager.play('spawn.wav');

		this.clearSchedule();
		this.schedule(500, () => {
			hud.setCenterText('ready');
			AudioManager.play('ready.wav');
		});
		this.schedule(2000, () => {
			hud.setCenterText('set');
			AudioManager.play('set.wav');
		});
		this.schedule(GO_TIME, () => {
			hud.setCenterText('go');
			AudioManager.play('go.wav');
		});
		this.schedule(5500, () => {
			if (!this.outOfBounds) hud.setCenterText('none');
		});
	}

	render() {
		if (this.stopped) return;

		let time = performance.now();
		this.tick(time);

		let physicsTickLength = 1000 / PHYSICS_TICK_RATE / PLAYBACK_SPEED;
		let completion = Util.clamp((time - this.lastPhysicsTick) / physicsTickLength, 0, 1);
		// Set up an intermediate time state for smoother rendering
		let tempTimeState: TimeState = {
			timeSinceLoad: this.timeState.timeSinceLoad + completion * physicsTickLength,
			currentAttemptTime: this.timeState.currentAttemptTime + completion * physicsTickLength,
			gameplayClock: (this.currentTimeTravelBonus || this.timeState.currentAttemptTime < GO_TIME)? this.timeState.gameplayClock : this.timeState.gameplayClock + completion * physicsTickLength,
			physicsTickCompletion: completion
		};

		this.marble.render(tempTimeState);
		for (let interior of this.interiors) interior.render(tempTimeState);
		for (let shape of this.shapes) if (!shape.isTSStatic) shape.render(tempTimeState);
		this.particles.render(tempTimeState.timeSinceLoad);

		this.updateCamera(tempTimeState);

		// Update the shadow camera
		let shadowCameraPosition = this.marble.group.position.clone();
		shadowCameraPosition.sub(this.sunDirection.clone().multiplyScalar(5));
		this.sunlight.shadow.camera.position.copy(shadowCameraPosition);
		this.sunlight.position.copy(shadowCameraPosition);
		this.sunlight.target.position.copy(this.marble.group.position);

		this.marble.renderReflection();
		renderer.render(this.scene, camera);

		// Update the overlay
		for (let overlayShape of this.overlayShapes) {
			overlayShape.group.position.x = 500;
			overlayShape.render(this.timeState);

			if (overlayShape.dtsPath.includes("gem")) {
				overlayShape.group.scale.setScalar(45);
				overlayShape.group.position.y = 25;
				overlayShape.group.position.z = -35;
			} else {
				overlayShape.group.scale.setScalar(SHAPE_OVERLAY_SCALES[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_SCALES] ?? 40);
				overlayShape.group.position.y = window.innerWidth - 55;
				overlayShape.group.position.z = SHAPE_OVERLAY_OFFSETS[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_OFFSETS];
			}
		}

		renderer.autoClear = false; // Make sure not to clear the previous canvas
		renderer.render(this.overlayScene, orthographicCamera);
		renderer.autoClear = true;

		// This might seem a bit strange, but the time we display is actually a few milliseconds in the PAST (unless the user is currently in TT or has finished), for the reason that time was able to go backwards upon finishing or collecting TTs due to CCD time correction. That felt wrong, so we accept this inaccuracy in displaying time for now.
		let timeToDisplay = tempTimeState.gameplayClock;
		if (this.finishTime) timeToDisplay = this.finishTime.gameplayClock;
		if (this.currentTimeTravelBonus === 0 && !this.finishTime) timeToDisplay = Math.max(timeToDisplay - 1000 / PHYSICS_TICK_RATE, 0);
		this.maxDisplayedTime = Math.max(timeToDisplay, this.maxDisplayedTime);
		if (this.currentTimeTravelBonus === 0 && !this.finishTime) timeToDisplay = this.maxDisplayedTime;

		timeToDisplay = Math.min(timeToDisplay, MAX_TIME);

		let hud = state.menu.hud;
		hud.displayTime(timeToDisplay / 1000, this.determineClockColor(timeToDisplay));
		hud.displayBlastMeterFullness(this.blastAmount);
		hud.displayFps();

		// Update help and alert text visibility
		let helpTextTime = this.helpTextTimeState?.timeSinceLoad ?? -Infinity;
		let alertTextTime = this.alertTextTimeState?.timeSinceLoad ?? -Infinity;
		let helpTextCompletion = Util.clamp((this.timeState.timeSinceLoad - helpTextTime - 3000) / 1000, 0, 1) ** 2;
		let alertTextCompletion = Util.clamp((this.timeState.timeSinceLoad - alertTextTime - 3000) / 1000, 0, 1) ** 2;

		hud.helpElement.style.opacity = (1 - helpTextCompletion).toString();
		hud.helpElement.style.filter = `brightness(${Util.lerp(1, 0.25, helpTextCompletion)})`;
		hud.alertElement.style.opacity = (1 - alertTextCompletion).toString();
		hud.alertElement.style.filter = `brightness(${Util.lerp(1, 0.25, alertTextCompletion)})`;

		requestAnimationFrame(() => this.render());
	}

	determineClockColor(timeToDisplay: number) {
		if (state.modification === 'gold') return;

		if (this.finishTime) return 'green'; // Even if not qualified
		if (this.timeState.currentAttemptTime < GO_TIME || this.currentTimeTravelBonus > 0) return 'green';
		if (timeToDisplay >= this.mission.qualifyTime) return 'red';

		if (this.timeState.currentAttemptTime >= GO_TIME && isFinite(this.mission.qualifyTime) && state.modification === 'platinum') {
			// Create the flashing effect
			let alarmStart = this.mission.computeAlarmStartTime();
			let elapsed = timeToDisplay - alarmStart;
			if (elapsed < 0) return;
			if (Math.floor(elapsed / 1000) % 2 === 0) return 'red';
		}

		return; // Default yellow
	}

	/** Updates the position of the camera based on marble position and orientation. */
	updateCamera(timeState: TimeState) {
		let marblePosition = Util.vecThreeToOimo(this.marble.group.position);
		let orientationQuat = this.getOrientationQuat(timeState);
		let up = new THREE.Vector3(0, 0, 1).applyQuaternion(orientationQuat);
		let directionVector = new THREE.Vector3(1, 0, 0);
		// The camera is translated up a bit so it looks "over" the marble
		let cameraVerticalTranslation = new THREE.Vector3(0, 0, 0.3);

		if (this.replay.mode === 'playback') {
			let indexLow = Math.max(0, this.replay.currentTickIndex - 1);
			let indexHigh = this.replay.currentTickIndex;

			// Smoothly interpolate pitch and yaw between the last two keyframes
			this.pitch = Util.lerp(this.replay.cameraOrientations[indexLow].pitch, this.replay.cameraOrientations[indexHigh].pitch, timeState.physicsTickCompletion);
			this.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, this.pitch)); // This bounds thing might have gotten inaccurate in the conversion from float64 to float32, so do it here again
			this.yaw = Util.lerp(this.replay.cameraOrientations[indexLow].yaw, this.replay.cameraOrientations[indexHigh].yaw, timeState.physicsTickCompletion);
		}

		if (this.finishTime) {
			// Make the camera spin around slowly
			this.pitch = Util.lerp(this.finishPitch, DEFAULT_PITCH, Util.clamp((timeState.currentAttemptTime - this.finishTime.currentAttemptTime) / 333, 0, 1));
			this.yaw = this.finishYaw - (timeState.currentAttemptTime - this.finishTime.currentAttemptTime) / 1000 * 0.6;
		}

		if (!this.outOfBounds) {
			directionVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
			directionVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
			directionVector.applyQuaternion(orientationQuat);

			cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
			cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
			cameraVerticalTranslation.applyQuaternion(orientationQuat);

			camera.up = up;
			camera.position.set(marblePosition.x, marblePosition.y, marblePosition.z).sub(directionVector.clone().multiplyScalar(2.5));
			camera.lookAt(Util.vecOimoToThree(marblePosition));
			camera.position.add(cameraVerticalTranslation);
			marbleReflectionCamera.up = up;

			// Handle wall intersections:

			const closeness = 0.1;
			let rayCastOrigin = marblePosition.add(this.currentUp.scale(this.marble.radius));

			let processedShapes = new Set<OIMO.Shape>();
			for (let i = 0; i < 3; i++) {
				// Shoot rays from the marble to the postiion of the camera
				let rayCastDirection = Util.vecThreeToOimo(camera.position).subEq(rayCastOrigin);
				rayCastDirection.addEq(rayCastDirection.clone().normalize().scale(2));

				let firstHit: OIMO.RayCastHit = null;
				let firstHitShape: OIMO.Shape = null;
				let self = this;
				this.physics.world.rayCast(rayCastOrigin, rayCastOrigin.add(rayCastDirection), {
					process(shape, hit) {
						if (shape !== self.marble.shape && !processedShapes.has(shape) && (!firstHit || hit.fraction < firstHit.fraction)) {
							firstHit = Util.jsonClone(hit);
							firstHitShape = shape;
						}
					}
				});

				if (firstHit) {
					processedShapes.add(firstHitShape);

					// Construct a plane at the point of ray impact based on the normal
					let plane = new THREE.Plane();
					let normal = Util.vecOimoToThree(firstHit.normal).multiplyScalar(-1);
					let position = Util.vecOimoToThree(firstHit.position);
					plane.setFromNormalAndCoplanarPoint(normal, position);

					// Project the camera position onto the plane
					let target = new THREE.Vector3();
					let projected = plane.projectPoint(camera.position, target);

					// If the camera is too far from the plane anyway, break
					let dist = plane.distanceToPoint(camera.position);
					if (dist >= closeness) break;

					// Go the projected point and look at the marble
					camera.position.copy(projected.add(normal.multiplyScalar(closeness)));
					Util.cameraLookAtDirect(camera, Util.vecOimoToThree(marblePosition));

					let rotationAxis = new THREE.Vector3(1, 0, 0);
					rotationAxis.applyQuaternion(camera.quaternion);

					let theta = Math.atan(0.3 / 2.5); // 0.3 is the vertical translation, 2.5 the distance away from the marble.

					// Rotate the camera back upwards such that the marble is in the same visual location on screen as before
					camera.rotateOnWorldAxis(rotationAxis, theta);
					continue;
				}
				
				break;
			}

			this.lastVerticalTranslation = cameraVerticalTranslation;
		} else {
			// Simply look at the marble
			camera.position.copy(this.oobCameraPosition);
			camera.position.sub(this.lastVerticalTranslation)
			camera.lookAt(Util.vecOimoToThree(marblePosition));
			camera.position.add(this.lastVerticalTranslation);
		}
	}

	tick(time?: number) {
		if (this.paused) return;
		if (this.stopped) return;
		if (time === undefined) time = performance.now();
		let playReplay = this.replay.mode === 'playback';

		if (!playReplay && (isPressed('use') || this.useQueued) && getPressedFlag('use')) {
			if (this.outOfBounds && !this.finishTime) {
				// Skip the out of bounds "animation" and restart immediately
				this.restart(false);
				return;
			} else if (this.heldPowerUp) {
				this.replay.recordUsePowerUp(this.heldPowerUp);
				this.heldPowerUp.use(this.timeState);
			}
		}
		if (!playReplay && (isPressed('blast') || this.blastQueued) && getPressedFlag('blast')) {
			this.marble.useBlast();
		}
		this.useQueued = false;
		this.blastQueued = false;

		state.menu.finishScreen.handleGamepadInput();

		// Handle pressing of the gamepad pause button
		if (!this.finishTime && isPressed('pause') && getPressedFlag('pause')) {
			resetPressedFlag('pause');
			resetPressedFlag('jump');
			resetPressedFlag('use');
			resetPressedFlag('restart');
			this.pause();
		}

		if (this.lastPhysicsTick === null) {
			// If there hasn't been a physics tick yet, ensure there is one now
			this.lastPhysicsTick = time - 1000 / PHYSICS_TICK_RATE * 1.1 / PLAYBACK_SPEED;
		}

		/** Time since the last physics tick */
		let elapsed = time - this.lastPhysicsTick;
		elapsed *= PLAYBACK_SPEED;
		if (elapsed >= 1000) {
			elapsed = 1000;
			this.lastPhysicsTick = time - 1000;
		}

		let tickDone = false;
		// Make sure to execute the correct amount of ticks
		while (elapsed >= 1000 / PHYSICS_TICK_RATE) {
			// By ticking we advance time, so advance time.
			this.timeState.timeSinceLoad += 1000 / PHYSICS_TICK_RATE;
			this.timeState.currentAttemptTime += 1000 / PHYSICS_TICK_RATE;
			this.lastPhysicsTick += 1000 / PHYSICS_TICK_RATE / PLAYBACK_SPEED;
			elapsed -= 1000 / PHYSICS_TICK_RATE;

			this.tickSchedule(this.timeState.currentAttemptTime);

			if (this.mission.hasBlast && this.blastAmount < 1) this.blastAmount = Util.clamp(this.blastAmount + 1000 / BLAST_CHARGE_TIME / PHYSICS_TICK_RATE, 0, 1);

			// Update pathed interior velocities before running the simulation step
			// Note: We do this even in replay playback mode, because pathed interior body position is relevant for the camera code.
			for (let interior of this.interiors) interior.tick(this.timeState);
			for (let trigger of this.triggers) trigger.tick(this.timeState);

			// Step the physics
			for (let interior of this.interiors) interior.buildCollisionGeometry(); // Update collision geometry for interiors
			if (!playReplay) this.physics.step();

			for (let shape of this.shapes) if (!shape.isTSStatic) shape.tick(this.timeState);

			// Update pathed interior positions after the physics tick because they will have changed position only after the physics tick was calculated, not during.
			for (let interior of this.interiors) if (interior instanceof PathedInterior) interior.updatePosition();

			// Major bruh energy here: Simply updating the interior positions isn't enough, OIMO needs to do some extra broadphase stuff or something. That's why we do this call here.
			if (playReplay) (this.physics.world as any)._updateContacts();

			if (!playReplay) this.marble.tick(this.timeState);
			this.marble.updatePowerUpStates(this.timeState);

			this.jumpQueued = false;

			if (this.timeState.currentAttemptTime < GO_TIME && !playReplay) {
				// Lock the marble to the space above the start pad

				let { position: startPosition } = this.getStartPositionAndOrientation();
				let position = this.marble.body.getPosition().clone();
				position.x = startPosition.x;
				position.y = startPosition.y;
				this.marble.body.setPosition(position);

				let vel = this.marble.body.getLinearVelocity();
				vel.x = vel.y = 0;
				this.marble.body.setLinearVelocity(vel);

				let angVel = this.marble.body.getAngularVelocity();
				// Cap the angular velocity so it doesn't go haywire
				if (angVel.length() > 60) angVel.normalize().scaleEq(60);
				this.marble.body.setAngularVelocity(angVel);

				this.marble.shape.setFriction(0);
			} else {
				this.marble.shape.setFriction(1);
			}

			let yawChange = 0.0;
			let pitchChange = 0.0;
			let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');
			let amount = Util.lerp(1, 6, StorageManager.data.settings.keyboardSensitivity);
			if (isPressed('cameraLeft')) yawChange += amount;
			if (isPressed('cameraRight')) yawChange -= amount;
			if (isPressed('cameraUp')) pitchChange -= amount;
			if (isPressed('cameraDown')) pitchChange += amount;
			
			yawChange -= gamepadAxes.cameraX * 5.0;
			if (freeLook) pitchChange += gamepadAxes.cameraY * 5.0;
			
			this.yaw += yawChange / PHYSICS_TICK_RATE;
			this.pitch += pitchChange / PHYSICS_TICK_RATE;

			this.particles.tick();
			tickDone = true;

			// Record or playback the replay
			if (!playReplay) this.replay.record();
			else {
				this.replay.playBack();
				if (this.replay.isPlaybackComplete()) {
					this.stopAndExit();
					return;
				}
			}

			let prevGameplayClock = this.timeState.gameplayClock;

			// Note: It is incorrect that this TT code here runs after physics and shape updating, it should run at the top of this loop's body. However, changing this code's position now would make all TT catches about ~8 milliseconds later, giving an unfair advantage to those who have already set leaderboard scores using the previous calculation. So, for the sake of score integrity, we're keeping it this way.
			if (this.timeState.currentAttemptTime >= GO_TIME) {
				if (this.currentTimeTravelBonus > 0) {
					// Subtract remaining time travel time
					this.currentTimeTravelBonus -= 1000 / PHYSICS_TICK_RATE;
	
					if (!this.timeTravelSound) {
						this.timeTravelSound = AudioManager.createAudioSource('timetravelactive.wav');
						this.timeTravelSound.setLoop(true);
						this.timeTravelSound.play();
					}
				} else {
					// Increase the gameplay time
					this.timeState.gameplayClock += 1000 / PHYSICS_TICK_RATE;
	
					this.timeTravelSound?.stop();
					this.timeTravelSound = null;
				}
	
				if (this.currentTimeTravelBonus < 0) {
					// If we slightly undershot the zero mark of the remaining time travel bonus, add the "lost time" back onto the gameplay clock:
					this.timeState.gameplayClock += -this.currentTimeTravelBonus;
					this.currentTimeTravelBonus = 0;
				}
			}

			// Handle alarm warnings (that the user is about to exceed the par time)
			if (this.timeState.currentAttemptTime >= GO_TIME && isFinite(this.mission.qualifyTime) && state.modification === 'platinum' && !this.finishTime) {
				let alarmStart = this.mission.computeAlarmStartTime();

				if (prevGameplayClock <= alarmStart && this.timeState.gameplayClock >= alarmStart) {
					// Start the alarm
					this.alarmSound = AudioManager.createAudioSource('alarm.wav');
					this.alarmSound.setLoop(true);
					this.alarmSound.play();
					state.menu.hud.displayHelp(`You have ${(this.mission.qualifyTime - alarmStart) / 1000} seconds remaining.`, true);
				}
				if (prevGameplayClock < this.mission.qualifyTime && this.timeState.gameplayClock >= this.mission.qualifyTime) {
					// Stop the alarm
					this.alarmSound?.stop();
					this.alarmSound = null;
					state.menu.hud.displayHelp("The clock has passed the Par Time.", true);
					AudioManager.play('alarm_timeout.wav');
				}
			}
		}

		AudioManager.updatePositionalAudio(this.timeState, camera.position, this.yaw);
		this.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, this.pitch)); // The player can't look straight up
		if (tickDone) this.marble.calculatePredictiveTransforms();

		// Handle pressing of the restart button
		if (!this.finishTime && isPressed('restart') && !this.pressingRestart) {
			this.restart(false);
			if (this.currentCheckpoint) this.restartPressTime = performance.now();
			this.pressingRestart = true;
		} else if (!isPressed('restart')) {
			this.pressingRestart = false;
		}

		// Holding down the restart button for 1 second will force a hard restart
		if (!this.finishTime && isPressed('restart') && this.restartPressTime !== null) {
			if (this.restartPressTime !== null && performance.now() - this.restartPressTime >= 1000)
				this.restart(true);
		}
	}

	/** Get the current interpolated orientation quaternion. */
	getOrientationQuat(time: TimeState) {
		let completion = Util.clamp((time.currentAttemptTime - this.orientationChangeTime) / 300, 0, 1);
		return this.oldOrientationQuat.clone().slerp(this.newOrientationQuat, completion);
	}

	/** Sets the current up vector and gravity with it. */
	setUp(newUp: OIMO.Vec3, time: TimeState, instant = false) {
		newUp.normalize(); // We never know 👀
		this.currentUp = newUp;
		this.physics.world.setGravity(newUp.scale(-1 * this.physics.world.getGravity().length()));

		let currentQuat = this.getOrientationQuat(time);
		let oldUp = new THREE.Vector3(0, 0, 1);
		oldUp.applyQuaternion(currentQuat);

		let quatChange = new THREE.Quaternion();
		let dot = Util.vecOimoToThree(newUp).dot(oldUp);
		if (dot <= -(1 - 1e-15) && !(this.replay.version < 3)) { // If the old and new up are exact opposites, there are infinitely many possible rotations we could do. So choose the one that maintains the current look vector the best. Replay check so we don't break old stuff.
			let lookVector = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
			let intermediateVector = oldUp.clone().cross(lookVector).normalize();

			// First rotation to the intermediate vector, then rotate from there to the new up
			quatChange.setFromUnitVectors(oldUp, intermediateVector);
			quatChange.multiplyQuaternions(new THREE.Quaternion().setFromUnitVectors(intermediateVector, Util.vecOimoToThree(newUp)), quatChange);
		} else {
			// Instead of calculating the new quat from nothing, calculate it from the last one to guarantee the shortest possible rotation.
			quatChange.setFromUnitVectors(oldUp, Util.vecOimoToThree(newUp));
		}

		this.newOrientationQuat = quatChange.multiply(currentQuat);
		this.oldOrientationQuat = currentQuat;
		this.orientationChangeTime = instant? -Infinity : time.currentAttemptTime;
	}

	/** Gets the position and orientation of the player spawn point. */
	getStartPositionAndOrientation() {
		// The player is spawned at the last start pad in the mission file.
		let startPad = Util.findLast(this.shapes, (shape) => shape instanceof StartPad);
		let position: THREE.Vector3;
		let euler = new THREE.Euler();

		if (startPad) {
			// If there's a start pad, start there
			position = startPad.worldPosition;
			euler.setFromQuaternion(startPad.worldOrientation, "ZXY");
		} else {
			// Search for spawn points used for multiplayer
			let spawnPoints = this.mission.allElements.find(x => x._name === "SpawnPoints") as MissionElementSimGroup;
			if (spawnPoints) {
				let first = spawnPoints.elements[0] as MissionElementTrigger;
				position = MisParser.parseVector3(first.position);
			} else {
				// If there isn't anything, start at this weird point
				position = new THREE.Vector3(0, 0, 300);
			}
		}

		return { position, euler };
	}

	setGravityIntensity(intensity: number) {
		let gravityVector = this.currentUp.scale(-1 * intensity);
		this.physics.world.setGravity(gravityVector);
	}

	onMouseMove(e: MouseEvent) {
		if (!document.pointerLockElement || this.finishTime || this.paused || this.replay.mode === 'playback') return;

		let totalDistance = Math.hypot(e.movementX, e.movementY);
		if (totalDistance > 300 && location.search.includes('debug')) alert(totalDistance + ', ' + e.movementX + ' ' + e.movementY);

		// Strangely enough, Chrome really bugs out sometimes and flings the mouse into a random direction quickly. We try to catch that here and ignore the mouse movement if we detect it.
		if (totalDistance > 350 && this.previousMouseMovementDistance * 4 < totalDistance) {
			this.previousMouseMovementDistance *= 1.5; // Make the condition harder to hit the next time
			return;
		};
		this.previousMouseMovementDistance = totalDistance;

		let factor = Util.lerp(1 / 2500, 1 / 100, StorageManager.data.settings.mouseSensitivity);
		let xFactor = (StorageManager.data.settings.invertMouse & 0b01)? -1 : 1;
		let yFactor = (StorageManager.data.settings.invertMouse & 0b10)? -1 : 1;
		let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');

		if (freeLook) this.pitch += e.movementY * factor * yFactor;
		this.yaw -= e.movementX * factor * xFactor;
	}

	pickUpPowerUp(powerUp: PowerUp, playPickUpSound = true) {
		if (!powerUp) return false;
		if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;
		this.heldPowerUp = powerUp;

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;

			// Show the corresponding icon in the HUD
			if (overlayShape.dtsPath === powerUp.dtsPath) this.overlayScene.add(overlayShape.group);
			else this.overlayScene.remove(overlayShape.group);
		}

		if (playPickUpSound) AudioManager.play(powerUp.sounds[0]);

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

	pickUpGem(gem: Gem) {
		this.gemCount++;
		let string: string;
		let gemWord = (state.modification === 'gold')? 'gem' : 'diamond';

		// Show a notification (and play a sound) based on the gems remaining
		if (this.gemCount === this.totalGems) {
			string = `You have all the ${gemWord}s, head for the finish!`;
			AudioManager.play('gotallgems.wav');
			
			// Some levels with this package end immediately upon collection of all gems
			if (this.mission.misFile.activatedPackages.includes('endWithTheGems')) {
				let completionOfImpact = this.physics.computeCompletionOfImpactWithBody(gem.bodies[0], 2); // Get the exact point of impact
				this.touchFinish(completionOfImpact);
			}
		} else {
			string = `You picked up a ${gemWord}${state.modification === 'gold' ? '.' : '!'}  `;

			let remaining = this.totalGems - this.gemCount;
			if (remaining === 1) {
				string += `Only one ${gemWord} to go!`;
			} else {
				string += `${remaining} ${gemWord}s to go!`;
			}

			AudioManager.play('gotgem.wav');
		}

		state.menu.hud.displayAlert(string);
		state.menu.hud.displayGemCount(this.gemCount, this.totalGems);
	}

	addTimeTravelBonus(bonus: number, timeToRevert: number) {
		if (this.currentTimeTravelBonus === 0) {
			this.timeState.gameplayClock -= timeToRevert;
			if (this.timeState.gameplayClock < 0) this.timeState.gameplayClock = 0;
			bonus -= timeToRevert;
		}

		this.currentTimeTravelBonus += bonus;
	}

	/** Triggers the out-of-bounds state. */
	goOutOfBounds() {
		if (this.outOfBounds || this.finishTime) return;

		this.updateCamera(this.timeState); // Update the camera at the point of OOB-ing
		this.outOfBounds = true;
		this.outOfBoundsTime = Util.jsonClone(this.timeState);
		this.oobCameraPosition = camera.position.clone();
		state.menu.hud.setCenterText('outofbounds');
		AudioManager.play('whoosh.wav');

		if (this.replay.mode !== 'playback') this.schedule(this.timeState.currentAttemptTime + 2000, () => this.restart(false), 'oobRestart');
	}

	/** Sets a new active checkpoint. */
	saveCheckpointState(shape: Shape, trigger?: CheckpointTrigger) {
		if (this.currentCheckpoint === shape) return;

		let disableOob = (shape.srcElement as any)?.disableOob || trigger?.element.disableOob;
		if (MisParser.parseBoolean(disableOob) && this.outOfBounds) return; // The checkpoint is configured to not work when the player is already OOB

		this.currentCheckpoint = shape;
		this.currentCheckpointTrigger = trigger;
		this.checkpointCollectedGems.clear();
		this.checkpointUp = this.currentUp.clone();
		this.checkpointBlast = this.blastAmount;

		// Remember all gems that were collected up to this point
		for (let shape of this.shapes) {
			if (!(shape instanceof Gem)) continue;
			if (shape.pickedUp) this.checkpointCollectedGems.add(shape);
		}

		this.checkpointHeldPowerUp = this.heldPowerUp;

		state.menu.hud.displayAlert("Checkpoint reached!");
		AudioManager.play('checkpoint.wav');
	}

	/** Resets to the last stored checkpoint state. */
	loadCheckpointState() {
		if (!this.currentCheckpoint) return;

		let marble = this.marble;

		let gravityField = (this.currentCheckpoint.srcElement as any)?.gravity || this.currentCheckpointTrigger?.element.gravity;
		if (MisParser.parseBoolean(gravityField)) {
			// In this case, we set the gravity to the relative "up" vector of the checkpoint shape.
			let up = new THREE.Vector3(0, 0, 1);
			up.applyQuaternion(this.currentCheckpoint.worldOrientation);
			this.setUp(Util.vecThreeToOimo(up), this.timeState, true);
		} else {
			// Otherwise, we restore gravity to what was stored.
			this.setUp(this.checkpointUp, this.timeState, true);
		}

		// Determine where to spawn the marble
		let offset = new OIMO.Vec3();
		let add = (this.currentCheckpoint.srcElement as any)?.add || this.currentCheckpointTrigger?.element.add;
		if (add) offset.addEq(Util.vecThreeToOimo(MisParser.parseVector3(add)));
		let sub = (this.currentCheckpoint.srcElement as any)?.sub || this.currentCheckpointTrigger?.element.sub;
		if (sub) offset.subEq(Util.vecThreeToOimo(MisParser.parseVector3(sub)));
		if (!add && !sub) offset.z = 3; // Defaults to (0, 0, 3)

		marble.body.setPosition(Util.vecThreeToOimo(this.currentCheckpoint.worldPosition).add(offset));
		marble.body.setLinearVelocity(new OIMO.Vec3());
		marble.body.setAngularVelocity(new OIMO.Vec3());

		// Set camera orienation
		let euler: THREE.Euler = new THREE.Euler();
		euler.setFromQuaternion(this.currentCheckpoint.worldOrientation, "ZXY");
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;

		// Restore gem states
		for (let shape of this.shapes) {
			if (!(shape instanceof Gem)) continue;
			if (shape.pickedUp && !this.checkpointCollectedGems.has(shape)) {
				shape.reset();
				this.gemCount--;
			}
		}
		state.menu.hud.displayGemCount(this.gemCount, this.totalGems);
		state.menu.hud.setCenterText('none');

		// Turn all of these off
		marble.superBounceEnableTime = -Infinity;
		marble.shockAbsorberEnableTime = -Infinity;
		marble.helicopterEnableTime = -Infinity;
		marble.megaMarbleEnableTime = -Infinity;

		this.clearSchedule();
		this.outOfBounds = false;
		this.blastAmount = this.checkpointBlast;
		this.finishTime = null; // For those very, very rare cases where the player touched the finish while OOB, but not fast enough, so they get respawned at the checkpoint and we need to remove the "finish lock".

		this.deselectPowerUp(); // Always deselect first
		// Wait a bit to select the powerup to prevent immediately using it incase the user skipped the OOB screen by clicking
		if (this.checkpointHeldPowerUp) this.schedule(this.timeState.currentAttemptTime + 500, () => this.pickUpPowerUp(this.checkpointHeldPowerUp, false));

		AudioManager.play('spawn.wav');
		this.replay.recordCheckpointRespawn();
	}

	touchFinish(completionOfImpactOverride?: number) {
		if (this.finishTime !== null) return;

		this.replay.recordTouchFinish();

		if (completionOfImpactOverride === undefined && this.gemCount < this.totalGems) {
			AudioManager.play('missinggems.wav');
			state.menu.hud.displayAlert((state.modification === 'gold')? "You can't finish without all the gems!!" : "You may not finish without all the diamonds!");
		} else {
			let completionOfImpact: number;
			if (completionOfImpactOverride === undefined) {
				// Compute the time of finishing. Like with start pads, use the last end pad.
				let finishAreaShape = Util.findLast(this.shapes, (shape) => shape instanceof EndPad).colliders[0].body.getShapeList();
				completionOfImpact = this.physics.computeCompletionOfImpactWithShapes(new Set([finishAreaShape]), 1);
			} else {
				completionOfImpact = completionOfImpactOverride;
			}
			let toSubtract = (1 - completionOfImpact) * 1000 / PHYSICS_TICK_RATE;

			this.finishTime = Util.jsonClone(this.timeState);
			// Compute the precise finish time here
			this.finishTime.timeSinceLoad -= toSubtract;
			this.finishTime.currentAttemptTime -= toSubtract;
			if (this.currentTimeTravelBonus === 0) this.finishTime.gameplayClock -= toSubtract;
			this.finishTime.gameplayClock = Math.min(this.finishTime.gameplayClock, MAX_TIME); // Apply the time cap
			this.finishTime.physicsTickCompletion = completionOfImpact;
			this.currentTimeTravelBonus = 0;
			this.alarmSound?.stop();

			if (this.replay.mode === 'playback') this.finishTime = this.replay.finishTime;

			this.finishYaw = this.yaw;
			this.finishPitch = this.pitch;

			let endPad = Util.findLast(this.shapes, (shape) => shape instanceof EndPad) as EndPad;
			endPad?.spawnFirework(this.timeState); // EndPad *might* not exist, in that case no fireworks lol

			state.menu.hud.displayAlert("Congratulations! You've finished!");

			// Check if the player is OOB, but still allow finishing with less than half a second of having been OOB
			if (this.outOfBounds && this.timeState.currentAttemptTime - this.outOfBoundsTime.currentAttemptTime >= 500) return;

			// When we reach this point, the player has actually successfully completed the level.

			this.clearScheduleId('oobRestart'); // Make sure we don't restart the level now
			// Schedule the finish screen to be shown
			if (this.replay.mode !== 'playback') this.schedule(this.timeState.currentAttemptTime + 2000, () => {
				// Show the finish screen
				document.exitPointerLock();
				state.menu.finishScreen.show();
				resetPressedFlag('use');
				resetPressedFlag('jump');
				resetPressedFlag('restart');
			});
		}
	}

	/** Pauses the level. */
	pause() {
		this.paused = true;
		document.exitPointerLock();
		releaseAllButtons(); // Safety measure to prevent keys from getting stuck
		state.menu.pauseScreen.show();
	}

	/** Unpauses the level. */
	unpause() {
		this.paused = false;
		document.documentElement.requestPointerLock();
		state.menu.pauseScreen.hide();
		this.lastPhysicsTick = performance.now();
	}

	/** Ends the level irreversibly. */
	stop() {
		this.stopped = true;
		clearInterval(this.tickInterval);
		this.dispose();

		this.music.stop();
		for (let interior of this.interiors) {
			if (interior instanceof PathedInterior) interior.soundSource?.stop();
		}
		for (let shape of this.shapes) {
			if (shape instanceof Tornado || shape instanceof DuctFan) shape.soundSource?.stop();
		}

		this.marble.rollingSound?.stop();
		this.marble.slidingSound?.stop();
		this.marble.helicopterSound?.stop();
		this.marble.shockAbsorberSound?.stop();
		this.marble.superBounceSound?.stop();

		AudioManager.stopAllAudio();
	}
	
	/** Stops and destroys the current level and returns back to the menu. */
	stopAndExit() {
		this.stop();
		state.level = null;
		mainCanvas.classList.add('hidden');

		state.menu.pauseScreen.hide();
		state.menu.levelSelect.show();
		state.menu.levelSelect.displayBestTimes(); // Potentially update best times having changed
		state.menu.finishScreen.hide();
		state.menu.hideGameUi();
		state.menu.show();
		
		document.exitPointerLock();
	}

	/** Returns how much percent the level has finished loading. */
	getLoadingCompletion() {
		return this.loadingState.total? this.loadingState.loaded / this.loadingState.total : 0;
	}

	/** Disposes the GPU assets used by the level. */
	dispose() {
		for (let interior of this.interiors) interior.dispose();
		for (let shape of this.shapes) shape.dispose();
		for (let overlayShape of this.overlayShapes) overlayShape.dispose();
	}
}