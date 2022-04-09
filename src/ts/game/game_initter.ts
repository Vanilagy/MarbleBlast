import { AudioManager } from "../audio";
import { Interior } from "../interior";
import { PHYSICS_TICK_RATE } from "../level";
import { bounceParticleOptions, Marble } from "../marble";
import { Vector3 } from "../math/vector3";
import { MissionElementType, MisParser, MissionElementInteriorInstance, MissionElementItem, MissionElementParticleEmitterNode, MissionElementSimGroup, MissionElementStaticShape, MissionElementTrigger, MissionElementTSStatic } from "../parsing/mis_parser";
import { ParticleEmitter, ParticleEmitterOptions, ParticleManager, particleNodeEmittersEmitterOptions } from "../particles";
import { PathedInterior } from "../pathed_interior";
import { World } from "../physics/world";
import { Replay } from "../replay";
import { Shape, SharedShapeData } from "../shape";
import { AntiGravity } from "../shapes/anti_gravity";
import { Blast } from "../shapes/blast";
import { Checkpoint } from "../shapes/checkpoint";
import { DuctFan } from "../shapes/duct_fan";
import { EasterEgg } from "../shapes/easter_egg";
import { blueSpark, blueTrail, EndPad, fireworkSmoke, redSpark, redTrail } from "../shapes/end_pad";
import { Gem } from "../shapes/gem";
import { Glass } from "../shapes/glass";
import { Helicopter } from "../shapes/helicopter";
import { LandMine, landMineSmokeParticle, landMineSparksParticle } from "../shapes/land_mine";
import { Magnet } from "../shapes/magnet";
import { MegaMarble } from "../shapes/mega_marble";
import { Nuke, nukeSmokeParticle, nukeSparksParticle } from "../shapes/nuke";
import { Oilslick } from "../shapes/oilslick";
import { PushButton } from "../shapes/push_button";
import { RandomPowerUp } from "../shapes/random_power_up";
import { RoundBumper } from "../shapes/round_bumper";
import { ShockAbsorber } from "../shapes/shock_absorber";
import { Sign } from "../shapes/sign";
import { SignCaution } from "../shapes/sign_caution";
import { SignFinish } from "../shapes/sign_finish";
import { SignPlain } from "../shapes/sign_plain";
import { Sky } from "../shapes/sky";
import { SmallDuctFan } from "../shapes/small_duct_fan";
import { StartPad } from "../shapes/start_pad";
import { SuperBounce } from "../shapes/super_bounce";
import { SuperJump, superJumpParticleOptions } from "../shapes/super_jump";
import { SuperSpeed, superSpeedParticleOptions } from "../shapes/super_speed";
import { TimeTravel } from "../shapes/time_travel";
import { Tornado } from "../shapes/tornado";
import { TrapDoor } from "../shapes/trap_door";
import { TriangleBumper } from "../shapes/triangle_bumper";
import { state } from "../state";
import { CheckpointTrigger } from "../triggers/checkpoint_trigger";
import { DestinationTrigger } from "../triggers/destination_trigger";
import { HelpTrigger } from "../triggers/help_trigger";
import { InBoundsTrigger } from "../triggers/in_bounds_trigger";
import { OutOfBoundsTrigger } from "../triggers/out_of_bounds_trigger";
import { TeleportTrigger } from "../triggers/teleport_trigger";
import { Trigger } from "../triggers/trigger";
import { Util } from "../util";
import { Clock } from "./clock";
import { Game } from "./game";

const MBP_SONGS = ['astrolabe.ogg', 'endurance.ogg', 'flanked.ogg', 'grudge.ogg', 'mbp old shell.ogg', 'quiet lab.ogg', 'rising temper.ogg', 'seaside revisited.ogg', 'the race.ogg'];

/** The map used to get particle emitter options for a ParticleEmitterNode. */
const particleEmitterMap: Record<string, ParticleEmitterOptions> = {
	MarbleBounceEmitter: bounceParticleOptions,
	MarbleTrailEmitter: particleNodeEmittersEmitterOptions.MarbleTrailEmitter,
	MarbleSuperJumpEmitter: Object.assign(ParticleEmitter.cloneOptions(superJumpParticleOptions), {
		emitterLifetime: 5000,
		ambientVelocity: new Vector3(-0.3, 0, -0.5)
	}),
	MarbleSuperSpeedEmitter: Object.assign(ParticleEmitter.cloneOptions(superSpeedParticleOptions), {
		emitterLifetime: 5000,
		ambientVelocity: new Vector3(-0.5, 0, -0.5)
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

interface LoadingState {
	/** How many things have loaded */
	loaded: number,
	/** How many things are going to be loaded */
	total: number
}

export class GameInitter {
	game: Game;

	loadingState: LoadingState;
	endPadElement: MissionElementStaticShape;

	/** Holds data shared between multiple shapes with the same constructor and .dts path. */
	sharedShapeData = new Map<string, Promise<SharedShapeData>>();

	auxEntityIdStart: number;

	constructor(game: Game) {
		this.game = game;
		this.loadingState = { loaded: 0, total: 0 };
	}

	/** Returns how much percent the game has finished loading. */
	getLoadingCompletion() {
		return this.loadingState.total? this.loadingState.loaded / this.loadingState.total : 0;
	}

	async init() {
		let { game } = this;
		let { renderer } = game;

		// Scan the mission for elements to determine required loading effort
		for (let element of game.mission.allElements) {
			if ([MissionElementType.InteriorInstance, MissionElementType.Item, MissionElementType.PathedInterior, MissionElementType.StaticShape, MissionElementType.TSStatic].includes(element._type)) {
				this.loadingState.total++;

				// Override the end pad element. We do this because only the last finish pad element will actually do anything.
				if (element._type === MissionElementType.StaticShape && element.datablock?.toLowerCase() === 'endpad')
					this.endPadElement = element;
			}
		}
		this.loadingState.total += 6 /*+ 1*/ + 3 + 6 + 1; // For the scene, marble, UI, sounds (includes music!), and scene compile

		await renderer.init();

		/*
		await this.initMarbles();
		this.loadingState.loaded += 1;
		*/

		let soundPromise = this.initSounds();

		await this.addSimGroup(game.mission.root);
		for (let interior of game.interiors) game.addEntity(interior);
		for (let shape of game.shapes) game.addEntity(shape);
		for (let trigger of game.triggers) game.addEntity(trigger);

		let maxEntityId = Math.max(...game.entities.map(x => x.id));
		this.auxEntityIdStart = maxEntityId + 1;

		game.clock = new Clock(game, this.auxEntityIdStart);
		game.addEntity(game.clock);

		await renderer.initHud();
		this.loadingState.loaded += 3;

		await soundPromise;
		this.loadingState.loaded += 6;

		renderer.scene.compile();
		this.loadingState.loaded += 1;
	}

	async initSounds() {
		let { game } = this;

		let musicFileName: string;
		if (game.mission.modification === 'ultra') {
			musicFileName = 'tim trance.ogg'; // ALWAYS play this banger
			game.originalMusicName = musicFileName;
		} else if (state.modification !== 'gold' && game.mission.missionInfo.music && game.mission.missionInfo.music.toLowerCase() !== 'pianoforte.ogg') {
			musicFileName = game.mission.missionInfo.music.toLowerCase();
			game.originalMusicName = musicFileName;
		} else {
			if (game.mission.modification === 'gold') {
				// Play the song based on the level index
				let levelIndex = state.menu.levelSelect.currentMissionArray.indexOf(game.mission);
				musicFileName = ['groovepolice.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3]; // The default music choice is based off of level index
				// Yes, the extra space is intentional
				game.originalMusicName = ['groove police.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3];
			} else {
				// Play a random *MBP* song
				musicFileName = Util.randomFromArray(MBP_SONGS);
				game.originalMusicName = musicFileName;
			}
		}
		if (state.modification === 'platinum') musicFileName = 'music/' + musicFileName;

		let toLoad = ["spawn.wav", "ready.wav", "set.wav", "go.wav", "whoosh.wav", musicFileName];
		if (isFinite(game.mission.qualifyTime) && state.modification === 'platinum') toLoad.push("alarm.wav", "alarm_timeout.wav", "infotutorial.wav");

		try {
			await AudioManager.loadBuffers(toLoad);
		} catch (e) {
			// Something died, maybe it was the music, try replacing it with a song we know exists
			let newMusic = Util.randomFromArray(MBP_SONGS);
			game.originalMusicName = newMusic;
			toLoad[toLoad.indexOf(musicFileName)] = 'music/' + newMusic;
			musicFileName = 'music/' + newMusic;
			await AudioManager.loadBuffers(toLoad);
		}

		game.music = AudioManager.createAudioSource(musicFileName, AudioManager.musicGain);
		game.music.setLoop(true);
		await game.music.promise;
	}

	/** Adds all elements within a sim group. */
	async addSimGroup(simGroup: MissionElementSimGroup) {
		let { game } = this;
		let { simulator, renderer } = game;

		// Check if it's a pathed interior group
		if (simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior)) {
			// Create the pathed interior
			let pathedInterior = await PathedInterior.createFromSimGroup(simGroup, game);
			if (!pathedInterior) return;

			renderer.scene.add(pathedInterior.mesh);
			if (pathedInterior.hasCollision) simulator.world.add(pathedInterior.body);

			for (let trigger of pathedInterior.triggers) {
				simulator.world.add(trigger.body);
				game.triggers.push(trigger);
			}

			return;
		}

		let promises: Promise<any>[] = [];

		for (let element of simGroup.elements) {
			switch (element._type) {
				case MissionElementType.SimGroup:
					promises.push(this.addSimGroup(element));
					break;
				case MissionElementType.InteriorInstance:
					promises.push(this.addInterior(element));
					break;
				case MissionElementType.StaticShape: case MissionElementType.Item:
					promises.push(this.addShape(element));
					break;
				case MissionElementType.Trigger:
					promises.push(this.addTrigger(element));
					break;
				case MissionElementType.TSStatic:
					promises.push(this.addTSStatic(element));
					break;
				case MissionElementType.ParticleEmitterNode:
					this.addParticleEmitterNode(element);
					break;
			}
		}

		await Promise.all(promises);
	}

	async addInterior(element: MissionElementInteriorInstance) {
		let { game } = this;
		let { simulator, renderer } = game;

		let { dif: difFile, path } = await game.mission.getDif(element.interiorfile);
		if (!difFile) return;

		let interior = new Interior(difFile, path, game);
		game.interiors.push(interior);

		await Util.wait(10); // fixme See shapes for the meaning of this hack
		await interior.init(element._id);

		renderer.scene.add(interior.mesh);

		let interiorPosition = MisParser.parseVector3(element.position);
		let interiorRotation = MisParser.parseRotation(element.rotation);
		let interiorScale = MisParser.parseVector3(element.scale);
		let hasCollision = interiorScale.x !== 0 && interiorScale.y !== 0 && interiorScale.z !== 0; // Don't want to add buggy geometry

		// Fix zero-volume interiors so they receive correct lighting
		if (interiorScale.x === 0) interiorScale.x = 0.0001;
		if (interiorScale.y === 0) interiorScale.y = 0.0001;
		if (interiorScale.z === 0) interiorScale.z = 0.0001;

		interior.setTransform(interiorPosition, interiorRotation, interiorScale);

		if (hasCollision) simulator.world.add(interior.body);
	}

	async addShape(element: MissionElementStaticShape | MissionElementItem) {
		let { game } = this;
		let { simulator, renderer } = game;

		let shape: Shape;

		// Add the correct shape based on type
		let dataBlockLowerCase = element.datablock?.toLowerCase();
		if (!dataBlockLowerCase) { /* Make sure we don't do anything if there's no data block */ }
		else if (dataBlockLowerCase === "startpad") shape = new StartPad();
		else if (dataBlockLowerCase === "endpad") shape = new EndPad(element === this.endPadElement);
		else if (dataBlockLowerCase === "signfinish") shape = new SignFinish();
		else if (dataBlockLowerCase.startsWith("signplain")) shape = new SignPlain(element as MissionElementStaticShape);
		else if (dataBlockLowerCase.startsWith("gemitem")) shape = new Gem(element as MissionElementItem), game.totalGems++;
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

		game.shapes.push(shape);
		// This is a bit hacky, but wait a short amount so that all shapes will have been created by the time this codepath continues. This is necessary for correct sharing of data between shapes.
		await Util.wait(10);
		await shape.init(game, element);

		// Set the shape's transform
		let shapePosition = MisParser.parseVector3(element.position);
		let shapeRotation = MisParser.parseRotation(element.rotation);
		let shapeScale = MisParser.parseVector3(element.scale);

		// Apparently we still do collide with zero-volume shapes
		if (shapeScale.x === 0) shapeScale.x = 0.0001;
		if (shapeScale.y === 0) shapeScale.y = 0.0001;
		if (shapeScale.z === 0) shapeScale.z = 0.0001;

		shape.setTransform(shapePosition, shapeRotation, shapeScale);

		renderer.scene.add(shape.group);

		for (let body of shape.bodies) simulator.world.add(body);
		for (let collider of shape.colliders) simulator.world.add(collider.body);
	}

	async addTrigger(element: MissionElementTrigger) {
		let { game } = this;
		let { simulator } = game;

		let trigger: Trigger;

		// Create a trigger based on type
		let dataBlockLowerCase = element.datablock?.toLowerCase();
		if (dataBlockLowerCase === "outofboundstrigger") {
			trigger = new OutOfBoundsTrigger(element, game);
		} else if (dataBlockLowerCase === "inboundstrigger") {
			trigger = new InBoundsTrigger(element, game);
		} else if (dataBlockLowerCase === "helptrigger") {
			trigger = new HelpTrigger(element, game);
		} else if (dataBlockLowerCase === "teleporttrigger") {
			trigger = new TeleportTrigger(element, game);
		} else if (dataBlockLowerCase === "destinationtrigger") {
			trigger = new DestinationTrigger(element, game);
		} else if (dataBlockLowerCase === "checkpointtrigger") {
			trigger = new CheckpointTrigger(element, game);
		}

		if (!trigger) return;

		game.triggers.push(trigger);
		simulator.world.add(trigger.body);

		await trigger.init();
	}

	/** Adds a TSStatic (totally static shape) to the world. */
	async addTSStatic(element: MissionElementTSStatic) {
		let { game } = this;
		let { simulator, renderer } = game;

		let shape = new Shape();
		let shapeName = element.shapename.toLowerCase();
		let index = shapeName.indexOf('data/');
		if (index === -1) return;

		shape.dtsPath = shapeName.slice(index + 'data/'.length);
		shape.isTSStatic = true;
		shape.shareId = 1;
		if (shapeName.includes('colmesh')) shape.receiveShadows = false; // Special case for colmesh

		game.shapes.push(shape);
		await Util.wait(10); // Same hack as for regular shapes
		try {
			await shape.init(game, element);
		} catch (e) {
			console.error("Error in creating TSStatic, skipping it for now.", e);
			Util.removeFromArray(game.shapes, shape);
			return;
		}

		shape.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		renderer.scene.add(shape.group);
		if (shape.worldScale.x !== 0 && shape.worldScale.y !== 0 && shape.worldScale.z !== 0) {
			// Only add the shape if it actually has any volume
			for (let body of shape.bodies) simulator.world.add(body);
			for (let collider of shape.colliders) simulator.world.add(collider.body);
		}
	}

	/** Adds a ParticleEmitterNode to the world. */
	addParticleEmitterNode(element: MissionElementParticleEmitterNode) {
		let emitterOptions = particleEmitterMap[element.emitter];
		if (!emitterOptions) return;

		this.game.renderer.particles.createEmitter(emitterOptions, MisParser.parseVector3(element.position));
	}
}