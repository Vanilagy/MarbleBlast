import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { PHYSICS_TICK_RATE, DEFAULT_PITCH } from "../level";
import { Plane } from "../math/plane";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { MissionElementType, MisParser, MissionElementSky } from "../parsing/mis_parser";
import { ParticleManager } from "../particles";
import { BallCollisionShape, CollisionShape } from "../physics/collision_shape";
import { AmbientLight } from "../rendering/ambient_light";
import { OrthographicCamera, PerspectiveCamera } from "../rendering/camera";
import { CubeTexture } from "../rendering/cube_texture";
import { DirectionalLight } from "../rendering/directional_light";
import { Geometry } from "../rendering/geometry";
import { Material } from "../rendering/material";
import { Mesh } from "../rendering/mesh";
import { Scene } from "../rendering/scene";
import { ResourceManager } from "../resources";
import { Shape } from "../shape";
import { Gem } from "../shapes/gem";
import { PowerUp } from "../shapes/power_up";
import { RandomPowerUp } from "../shapes/random_power_up";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Hud } from "../ui/hud";
import { MbpHud } from "../ui/hud_mbp";
import { mainRenderer, SCALING_RATIO } from "../ui/misc";
import { FRAME_RATE_OPTIONS } from "../ui/options_mbp";
import { MbpPauseScreen } from "../ui/pause_screen_mbp";
import { Util } from "../util";
import { Game } from "./game";
import { GAME_PLAYBACK_SPEED } from "./game_simulator";

// Used for frame rate limiting working correctly
const decoyCanvas = document.querySelector('#decoy-canvas') as HTMLCanvasElement;
const decoyCtx = decoyCanvas.getContext('2d');

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

export class GameRenderer {
	game: Game;

	scene: Scene;
	camera: PerspectiveCamera;
	envMap: CubeTexture;

	particles: ParticleManager;

	/** The shapes used for drawing HUD overlay (powerups in the corner) */
	overlayShapes: Shape[] = [];
	overlayScene: Scene;
	overlayCamera: OrthographicCamera;
	lastHeldPowerUp: PowerUp = null;

	lastFrameTime: number = null;
	/** The maximum time that has been displayed in the current attempt. */
	maxDisplayedTime = 0;

	/** The time state at the last point the help text was updated. */
	helpTextTimeState: number = null;
	/** The time state at the last point the alert text was updated. */
	alertTextTimeState: number = null;

	lastVerticalTranslation = new Vector3();

	constructor(game: Game) {
		this.game = game;

		this.scene = new Scene(mainRenderer);
		this.particles = new ParticleManager(game);
	}

	async init() {
		await this.initScene();

		await this.particles.init(mainRenderer);
		this.scene.particleManager = this.particles;
	}

	async initScene() {
		let { game } = this;

		let addedShadow = false;
		// There could be multiple suns, so do it for all of them
		for (let element of game.mission.allElements) {
			if (element._type !== MissionElementType.Sun) continue;

			let directionalColor = MisParser.parseVector4(element.color);
			let ambientColor = MisParser.parseVector4(element.ambient);
			let sunDirection = MisParser.parseVector3(element.direction);

			// Create the ambient light
			this.scene.addAmbientLight(new AmbientLight(new Vector3(ambientColor.x, ambientColor.y, ambientColor.z)));

			// Create the sunlight
			let directionalLight = new DirectionalLight(
				mainRenderer,
				new Vector3(directionalColor.x, directionalColor.y, directionalColor.z),
				sunDirection.clone()
			);
			this.scene.addDirectionalLight(directionalLight);

			if (!addedShadow) {
				addedShadow = true;

				let shadowCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 10);
				directionalLight.enableShadowCasting(256, shadowCamera);
			}
		}

		let skyElement = game.mission.allElements.find((element) => element._type === MissionElementType.Sky) as MissionElementSky;

		let fogColor = MisParser.parseVector4(skyElement.fogcolor);
		// Uber strange way Torque maps these values:
		if (fogColor.x > 1) fogColor.x = 1 - (fogColor.x - 1) % 256 / 256;
		if (fogColor.y > 1) fogColor.y = 1 - (fogColor.y - 1) % 256 / 256;
		if (fogColor.z > 1) fogColor.z = 1 - (fogColor.z - 1) % 256 / 256;

		let skySolidColor = MisParser.parseVector4(skyElement.skysolidcolor);
		// This is kind of a weird situation here. It seems as if when the skysolidcolor isn't the default value, it's used as the skycolor; otherwise, fog color is used. Strange.
		if (skySolidColor.x !== 0.6 || skySolidColor.y !== 0.6 || skySolidColor.z !== 0.6) fogColor = skySolidColor;

		mainRenderer.setClearColor(fogColor.x, fogColor.y, fogColor.z, 1);

		this.camera = new PerspectiveCamera(
			StorageManager.data.settings.fov,
			window.innerWidth / window.innerHeight,
			0.01,
			MisParser.parseNumber(skyElement.visibledistance)
		);

		if (skyElement.useskytextures === "1") {
			// Create the skybox
			let skyboxCubeTexture = await this.createSkyboxCubeTexture(skyElement.materiallist.slice(skyElement.materiallist.indexOf('data/') + 'data/'.length), true);
			if (skyboxCubeTexture) {
				let material = new Material();
				material.isSky = true;
				material.envMap = skyboxCubeTexture;
				material.depthWrite = false;
				material.renderOrder = -1000; // Render before everything else

				let geometry = new Geometry();
				geometry.positions.push(-1, -1, 0);
				geometry.positions.push(3, -1, 0);
				geometry.positions.push(-1, 3, 0);
				geometry.materials.push(0, 0, 0);
				geometry.indices.push(0, 1, 2);
				geometry.fillRest();

				let mesh = new Mesh(geometry, [material]);
				this.scene.add(mesh);
			}
		}

		let envmapCubeTexture = await this.createSkyboxCubeTexture('skies/sky_day.dml', false, 128); // Always the default MBG skybox
		// Use the skybox as the environment map. Don't use the actual envmap image file because its projection requires like three PhDs in mathematics.
		this.envMap = envmapCubeTexture;
	}

	async createSkyboxCubeTexture(dmlPath: string, increaseLoading: boolean, downsampleTo?: number) {
		let { game } = this;
		let { initter } = game;

		let dmlDirectoryPath = dmlPath.slice(0, dmlPath.lastIndexOf('/'));
		let dmlFile = await game.mission.getResource(dmlPath);
		if (dmlFile) {
			// Get all skybox images
			let lines = (await ResourceManager.readBlobAsText(dmlFile)).split('\n').map(x => x.trim().toLowerCase());
			let skyboxImages: HTMLImageElement[] = [];

			for (let i = 0; i < 6; i++) {
				let line = lines[i];
				let filename = game.mission.getFullNamesOf(dmlDirectoryPath + '/' + line)[0];

				if (!filename) {
					skyboxImages.push(new Image());
				} else {
					let image = await game.mission.getImage(dmlDirectoryPath + '/' + filename);
					skyboxImages.push(image);
				}

				if (increaseLoading) initter.loadingState.loaded++;
			}

			// Reorder them to the proper order
			skyboxImages = Util.remapIndices(skyboxImages, [1, 3, 4, 5, 0, 2]);
			if (downsampleTo) skyboxImages = await Promise.all(skyboxImages.map(x => Util.downsampleImage(x, downsampleTo, downsampleTo)));

			let skyboxTexture = new CubeTexture(mainRenderer, skyboxImages);
			return skyboxTexture;
		} else {
			if (increaseLoading) initter.loadingState.loaded += 6;
			return null;
		}
	}

	async initHud() {
		let { game } = this;

		// Load all necessary UI image elements
		await state.menu.hud.load();

		// Set up the HUD overlay

		let hudOverlayShapePaths = new Set<string>();
		for (let shape of game.shapes) {
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

		this.overlayScene = new Scene(mainRenderer);
		let overlayLight = new AmbientLight(new Vector3().setScalar(1));
		this.overlayScene.addAmbientLight(overlayLight);

		this.overlayCamera = new OrthographicCamera(
			-window.innerWidth/2,
			window.innerWidth/2,
			-window.innerHeight/2,
			window.innerHeight/2,
			1,
			1000
		);
		this.overlayCamera.up.set(0, 0, -1);
		this.overlayCamera.lookAt(new Vector3(1, 0, 0));

		for (let path of hudOverlayShapePaths) {
			let shape = new Shape();
			shape.dtsPath = path;
			shape.ambientRotate = true;
			shape.showSequences = false;
			// MBP's UI gem color is randomized
			if (path.includes("gem") && state.menu.hud instanceof MbpHud) shape.matNamesOverride['base.gem'] = Gem.pickRandomColor() + '.gem';

			await shape.init(game);

			this.overlayShapes.push(shape);
			this.overlayScene.add(shape.group);

			if (path.includes("gem")) {
				shape.ambientSpinFactor /= -2; // Gems spin the other way apparently
			} else {
				shape.ambientSpinFactor /= 2;
				shape.setOpacity(0);
			}
		}

		if (game.totalGems > 0) {
			// Show the gem overlay
			state.menu.hud.setGemVisibility(true);
		} else {
			// Hide the gem UI
			state.menu.hud.setGemVisibility(false);
		}

		this.overlayScene.compile();

		if (state.menu.pauseScreen instanceof MbpPauseScreen)
			state.menu.pauseScreen.jukebox.reset();
	}

	render() {
		let { game } = this;
		let { simulator } = game;

		if (game.stopped) return;

		let time = performance.now();
		if (this.lastFrameTime === null) {
			this.lastFrameTime = time;
		} else {
			let cap = FRAME_RATE_OPTIONS[StorageManager.data.settings.frameRateCap];

			// When FPS is unlocked in the browser but limited in-game, for some browser frames, the game won't draw anything. This makes the browser think it's okay to slow down the rate of requestAnimationFrame, which is not desirable in this case. Therefore we trick the browser into thinking the GPU is doing something by continuously clearing a 1x1 canvas each frame.
			if (isFinite(cap)) decoyCtx.clearRect(0, 0, 1, 1);

			// Take care of frame rate limiting:
			let elapsed = time - this.lastFrameTime;
			let required = 1000 / cap;
			if (elapsed < required) return;

			this.lastFrameTime += required;
			this.lastFrameTime = Math.max(this.lastFrameTime, time - 2 * required); // To avoid the last frame time from lagging behind
		}

		let gameFrameLength = 1000 / GAME_UPDATE_RATE;
		let completion = Util.clamp((time - game.lastGameUpdateTime) / gameFrameLength * GAME_PLAYBACK_SPEED, 0, 1);
		game.state.subframeCompletion = 0 ?? completion; // temp!!

		for (let entity of game.entities) entity.render();
		this.particles.render();

		this.updateCamera();
		this.camera.updateMatrixWorld();

		let marble = game.localPlayer.controlledMarble;

		// Update the shadow camera
		this.scene.directionalLights[0]?.updateCamera(marble.group.position.clone(), -1);

		// Render the scene
		this.scene.prepareForRender(this.camera);
		marble.renderReflection();
		mainRenderer.render(this.scene, this.camera);

		// This might seem a bit strange, but the time we display is actually a few milliseconds in the PAST (unless the user is currently in TT or has finished), for the reason that time was able to go backwards upon finishing or collecting TTs due to CCD time correction. That felt wrong, so we accept this inaccuracy in displaying time for now.
		/*
		let timeToDisplay = tempTimeState.gameplayClock;
		if (simulator.finishTime) timeToDisplay = simulator.finishTime.gameplayClock;
		if (simulator.currentTimeTravelBonus === 0 && !simulator.finishTime) timeToDisplay = Math.max(timeToDisplay - 1000 / PHYSICS_TICK_RATE, 0);
		this.maxDisplayedTime = Math.max(timeToDisplay, this.maxDisplayedTime);
		if (simulator.currentTimeTravelBonus === 0 && !simulator.finishTime) timeToDisplay = this.maxDisplayedTime;
		*/

		this.renderHud();

		game.state.subframeCompletion = 0;
	}

	/** Updates the position of the camera based on marble position and orientation. */
	updateCamera() {
		let { game } = this;
		let { simulator } = game;

		let marble = game.localPlayer.controlledMarble;

		let marblePosition = marble.group.position;
		let orientationQuat = marble.getInterpolatedOrientationQuat();
		let up = new Vector3(0, 0, 1).applyQuaternion(orientationQuat);
		let directionVector = new Vector3(1, 0, 0);
		// The camera is translated up a bit so it looks "over" the marble
		let cameraVerticalTranslation = new Vector3(0, 0, 0.3);

		let { pitch, yaw } = marble.currentControlState;

		/*
		if (game.replay.mode === 'playback') {
			let indexLow = Math.max(0, game.replay.currentTickIndex - 1);
			let indexHigh = game.replay.currentTickIndex;

			// Smoothly interpolate pitch and yaw between the last two keyframes
			simulator.pitch = Util.lerp(game.replay.cameraOrientations[indexLow].pitch, game.replay.cameraOrientations[indexHigh].pitch, timeState.physicsTickCompletion);
			simulator.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, simulator.pitch)); // This bounds thing might have gotten inaccurate in the conversion from float64 to float32, so do it here again
			simulator.yaw = Util.lerp(game.replay.cameraOrientations[indexLow].yaw, game.replay.cameraOrientations[indexHigh].yaw, timeState.physicsTickCompletion);
		}
		*/

		/*
		if (simulator.finishTime) {
			// Make the camera spin around slowly
			pitch = Util.lerp(game.marble.finishPitch, DEFAULT_PITCH, Util.clamp((timeState.currentAttemptTime - simulator.finishTime.currentAttemptTime) / 333, 0, 1));
			yaw = game.marble.finishYaw - (timeState.currentAttemptTime - simulator.finishTime.currentAttemptTime) / 1000 * 0.6;
		}
		*/

		if (marble.outOfBoundsFrame === null) {
			directionVector.applyAxisAngle(new Vector3(0, 1, 0), pitch);
			directionVector.applyAxisAngle(new Vector3(0, 0, 1), yaw);
			directionVector.applyQuaternion(orientationQuat);

			cameraVerticalTranslation.applyAxisAngle(new Vector3(0, 1, 0), pitch);
			cameraVerticalTranslation.applyAxisAngle(new Vector3(0, 0, 1), yaw);
			cameraVerticalTranslation.applyQuaternion(orientationQuat);

			this.camera.up = up;
			this.camera.position.copy(marblePosition).sub(directionVector.clone().multiplyScalar(2.5));
			this.camera.lookAt(marblePosition);
			this.camera.position.add(cameraVerticalTranslation);

			// Handle wall intersections:

			const closeness = 0.1;
			let rayCastOrigin = marblePosition;

			let processedShapes = new Set<CollisionShape>();
			for (let i = 0; i < 3; i++) {
				// Shoot rays from the marble to the postiion of the camera
				let rayCastDirection = this.camera.position.clone().sub(rayCastOrigin);
				rayCastDirection.addScaledVector(rayCastDirection.clone().normalize(), 2);

				let length = rayCastDirection.length();
				let hits = simulator.world.castRay(rayCastOrigin, rayCastDirection.normalize(), length);
				let firstHit = hits.find(x => !(x.shape instanceof BallCollisionShape)); // Ignore all marbles with the ray

				if (firstHit) {
					processedShapes.add(firstHit.shape);

					// Construct a plane at the point of ray impact based on the normal
					let plane = new Plane();
					let normal = firstHit.normal;
					let position = firstHit.point;
					plane.setFromNormalAndCoplanarPoint(normal, position);

					// Project the camera position onto the plane
					let target = new Vector3();
					let projected = plane.projectPoint(this.camera.position, target);

					// If the camera is too far from the plane anyway, break
					let dist = plane.distanceToPoint(this.camera.position);
					if (dist >= closeness) break;

					// Go the projected point and look at the marble
					this.camera.position.copy(projected.add(normal.multiplyScalar(closeness)));
					Util.cameraLookAtDirect(this.camera, marblePosition);

					let rotationAxis = new Vector3(1, 0, 0);
					rotationAxis.applyQuaternion(this.camera.orientation);

					let theta = Math.atan(0.3 / 2.5); // 0.3 is the vertical translation, 2.5 the distance away from the marble.

					// Rotate the camera back upwards such that the marble is in the same visual location on screen as before
					let rot = new Quaternion().setFromAxisAngle(rotationAxis, theta);
					this.camera.orientation.premultiply(rot);
					continue;
				}

				break;
			}

			this.lastVerticalTranslation = cameraVerticalTranslation;
		} else {
			// Simply look at the marble
			this.camera.position.copy(marble.outOfBoundsCameraPosition);
			this.camera.position.sub(this.lastVerticalTranslation);
			this.camera.lookAt(marblePosition);
			this.camera.position.add(this.lastVerticalTranslation);
		}
	}

	renderHud() {
		let { game } = this;
		let hud = state.menu.hud;

		if (game.localPlayer.controlledMarble.outOfBoundsFrame !== null) {
			hud.setCenterText('outofbounds');
		} else {
			let timeSinceRespawn = (game.state.frame - game.localPlayer.controlledMarble.respawnFrame) / GAME_UPDATE_RATE;
			if (timeSinceRespawn < 0.5 || timeSinceRespawn > 5.5) {
				hud.setCenterText('none');
			} else if (timeSinceRespawn > 3.5) {
				hud.setCenterText('go');
			} else if (timeSinceRespawn > 2) {
				hud.setCenterText('set');
			} else {
				hud.setCenterText('ready');
			}
		}

		let gemCount = 0;
		for (let i = 0; i < this.game.entities.length; i++) {
			let entity = this.game.entities[i];
			if (entity instanceof Gem && entity.pickedUpBy) gemCount++;
		}

		hud.displayGemCount(gemCount, this.game.totalGems);
		hud.displayFps();

		hud.helpElement.textContent = '';
		hud.alertElement.textContent = '';

		for (let i = hud.helpMessages.length-1; i >= 0; i--) {
			let helpMessage = hud.helpMessages[i];
			let message = helpMessage.getMessage();
			if (message === null) continue;

			let completion = Util.clamp(game.state.time - helpMessage.frame/GAME_UPDATE_RATE - 3, 0, 1) ** 2;
			hud.helpElement.textContent = Hud.processHelpMessage(message);
			hud.helpElement.style.opacity = (1 - completion).toString();
			hud.helpElement.style.filter = `brightness(${Util.lerp(1, 0.25, completion)})`;

			break;
		}

		for (let i = hud.alerts.length-1; i >= 0; i--) {
			let alert = hud.alerts[i];
			let message = alert.getMessage();
			if (message === null) continue;

			let completion = Util.clamp(game.state.time - alert.frame/GAME_UPDATE_RATE - 3, 0, 1) ** 2;
			hud.alertElement.textContent = message;
			hud.alertElement.style.opacity = (1 - completion).toString();
			hud.alertElement.style.filter = `brightness(${Util.lerp(1, 0.25, completion)})`;

			break;
		}

		let heldPowerUp = this.game.localPlayer.controlledMarble.heldPowerUp;
		if (this.lastHeldPowerUp !== heldPowerUp) {
			this.lastHeldPowerUp = heldPowerUp;

			for (let overlayShape of this.overlayShapes) {
				if (overlayShape.dtsPath.includes("gem")) continue;

				// Show the corresponding icon in the HUD
				overlayShape.setOpacity(Number(overlayShape.dtsPath === heldPowerUp?.dtsPath));
			}
		}

		// Update the overlay
		for (let overlayShape of this.overlayShapes) {
			overlayShape.group.position.x = 500; // Make sure the shape is between the near and far planes of the camera
			overlayShape.render();

			if (overlayShape.dtsPath.includes("gem")) {
				overlayShape.group.scale.setScalar(45 / SCALING_RATIO);
				overlayShape.group.position.y = 25 / SCALING_RATIO;
				overlayShape.group.position.z = -35 / SCALING_RATIO;
			} else {
				overlayShape.group.scale.setScalar((SHAPE_OVERLAY_SCALES[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_SCALES] ?? 40) / SCALING_RATIO);
				overlayShape.group.position.y = window.innerWidth - 55 / SCALING_RATIO;
				overlayShape.group.position.z = SHAPE_OVERLAY_OFFSETS[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_OFFSETS] / SCALING_RATIO;
			}

			overlayShape.group.recomputeTransform();
		}

		// Render the overlay
		this.overlayCamera.updateMatrixWorld();
		this.overlayScene.prepareForRender(this.overlayCamera);
		mainRenderer.render(this.overlayScene, this.overlayCamera, null, false);
	}

	onResize() {
		if (!this.camera || !this.overlayCamera) return;

		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.overlayCamera.left = 0;
		this.overlayCamera.right = window.innerWidth;
		this.overlayCamera.top = 0;
		this.overlayCamera.bottom = window.innerHeight;
		this.overlayCamera.updateProjectionMatrix();
	}

	dispose() {
		this.scene.dispose();
		mainRenderer.cleanUp();
	}
}