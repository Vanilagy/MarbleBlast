import { AudioManager, AudioSource } from "../audio";
import { Game } from "../game/game";
import { DEFAULT_PITCH, Level, TimeState } from "../level";
import { Vector3 } from "../math/vector3";
import { MisParser, MissionElementTrigger } from "../parsing/mis_parser";
import { G } from "../global";
import { Util } from "../util";
import { DestinationTrigger } from "./destination_trigger";
import { Trigger } from "./trigger";

/** A teleport trigger teleports the marble to a specified destination after some time of being inside it. */
export class TeleportTrigger extends Trigger {
	/** How long after entry until the teleport happens */
	delay = 2000;
	entryTime: number = null;
	exitTime: number = null;
	sounds = ["teleport.wav"];
	teleportingSound: AudioSource = null;

	constructor(element: MissionElementTrigger, game: Game) {
		super(element, game);

		if (element.delay) this.delay = MisParser.parseNumber(element.delay);
	}

	onMarbleEnter() {
		let time = this.level.timeState;

		this.exitTime = null;
		this.level.marble.enableTeleportingLook(time);
		this.level.replay.recordMarbleEnter(this);
		if (this.entryTime !== null) return;

		this.entryTime = time.currentAttemptTime;
		G.menu.hud.displayAlert("Teleporter has been activated, please wait.");
		this.teleportingSound = AudioManager.createAudioSource('teleport.wav');
		this.teleportingSound.play();
	}

	onMarbleLeave() {
		let time = this.level.timeState;

		this.exitTime = time.currentAttemptTime;
		this.level.marble.disableTeleportingLook(time);
		this.level.replay.recordMarbleLeave(this);
	}

	tick(time: TimeState) {
		if (this.entryTime === null) return;

		if (time.currentAttemptTime - this.entryTime >= this.delay) {
			this.executeTeleport();
			return;
		}

		// There's a little delay after exiting before the teleporter gets cancelled
		if (this.exitTime !== null && time.currentAttemptTime - this.exitTime > 50) {
			this.entryTime = null;
			this.exitTime = null;
			return;
		}
	}

	executeTeleport() {
		this.entryTime = null;

		// Find the destination trigger
		let destination = this.level.triggers.find(x => x instanceof DestinationTrigger && x.element._name.toLowerCase() === this.element.destination?.toLowerCase());
		if (!destination) return; // Who knows

		let body = this.level.marble.body;

		// Determine where to place the marble
		let position: Vector3;
		if (this.element.centerdestpoint || destination.element.centerdestpoint) {
			position = destination.body.position;
		} else {
			position = destination.vertices[0].clone().add(new Vector3(0, 0, 3));
		}
		body.position.copy(position);
		body.prevPosition.copy(position); // Avoid funky CCD business

		if (!MisParser.parseBoolean(this.element.keepvelocity || destination.element.keepvelocity)) body.linearVelocity.setScalar(0);
		if (MisParser.parseBoolean(this.element.inversevelocity || destination.element.inversevelocity)) body.linearVelocity.negate();
		if (!MisParser.parseBoolean(this.element.keepangular || destination.element.keepangular)) body.angularVelocity.setScalar(0);

		// Determine camera orientation
		if (!MisParser.parseBoolean(this.element.keepcamera || destination.element.keepcamera)) {
			let yaw: number;
			if (this.element.camerayaw) yaw = Util.degToRad(MisParser.parseNumber(this.element.camerayaw));
			else if (destination.element.camerayaw) yaw = Util.degToRad(MisParser.parseNumber(destination.element.camerayaw));
			else yaw = 0;

			this.level.yaw = yaw + Math.PI/2;
			this.level.pitch = DEFAULT_PITCH;
		}

		AudioManager.play('spawn.wav');
		this.teleportingSound?.stop();
		this.teleportingSound = null;
	}

	reset() {
		super.reset();

		this.entryTime = null;
		this.exitTime = null;
	}
}