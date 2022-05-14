import { AudioManager } from "../audio";
import { Game } from "../game/game";
import { DEFAULT_PITCH } from "../level";
import { Vector3 } from "../math/vector3";
import { MisParser, MissionElementTrigger } from "../../../shared/mis_parser";
import { G } from "../global";
import { Util } from "../util";
import { DestinationTrigger } from "./destination_trigger";
import { Trigger } from "./trigger";
import { Marble } from "../marble";

/** A teleport trigger teleports the marble to a specified destination after some time of being inside it. */
export class TeleportTrigger extends Trigger {
	/** How long after entry until the teleport happens */
	delay = 2000;
	sounds = ["teleport.wav"];

	constructor(element: MissionElementTrigger, game: Game) {
		super(element, game);

		if (element.delay) this.delay = MisParser.parseNumber(element.delay);
	}

	onMarbleEnter(marble: Marble) {
		let teleportState = marble.getTeleportState(this);
		teleportState.exitFrame = null;
		marble.enableTeleportingLook();

		if (teleportState.entryFrame !== null) return;

		teleportState.entryFrame = this.game.state.frame;
		G.menu.hud.displayAlert(() => {
			return this.game.localPlayer.controlledMarble === marble ? "Teleporter has been activated, please wait." : null;
		}, this.game.state.frame);

		this.game.simulator.executeNonDuplicatableEvent(() => {
			let sound = AudioManager.createAudioSource('teleport.wav', undefined, marble.body.position);
			sound.play();
			marble.teleportSounds.get(this).push(sound);
		}, `${this.id} ${marble.id}sound`, true);
	}

	onMarbleLeave(marble: Marble) {
		let teleportState = marble.getTeleportState(this);

		teleportState.exitFrame = this.game.state.frame;
		marble.disableTeleportingLook();
	}

	executeTeleport(marble: Marble) {
		let teleportState = marble.getTeleportState(this);
		teleportState.entryFrame = null;

		// Find the destination trigger
		let destination = this.game.triggers.find(x => x instanceof DestinationTrigger && x.element._name.toLowerCase() === this.element.destination?.toLowerCase());
		if (!destination) return; // Who knows

		let body = marble.body;

		// Determine where to place the marble
		let position: Vector3;
		if (this.element.centerdestpoint || destination.element.centerdestpoint) {
			position = destination.body.position;
		} else {
			position = destination.vertices[0].clone().add(new Vector3(0, 0, 3));
		}
		body.position.copy(position);
		body.prevPosition.copy(position); // Avoid funky CCD business

		marble.cancelInterpolation();

		if (!MisParser.parseBoolean(this.element.keepvelocity || destination.element.keepvelocity)) body.linearVelocity.setScalar(0);
		if (MisParser.parseBoolean(this.element.inversevelocity || destination.element.inversevelocity)) body.linearVelocity.negate();
		if (!MisParser.parseBoolean(this.element.keepangular || destination.element.keepangular)) body.angularVelocity.setScalar(0);

		// Determine camera orientation
		if (!MisParser.parseBoolean(this.element.keepcamera || destination.element.keepcamera) && marble.controllingPlayer) {
			let yaw: number;
			if (this.element.camerayaw) yaw = Util.degToRad(MisParser.parseNumber(this.element.camerayaw));
			else if (destination.element.camerayaw) yaw = Util.degToRad(MisParser.parseNumber(destination.element.camerayaw));
			else yaw = 0;

			marble.controllingPlayer.yaw = yaw + Math.PI/2;
			marble.controllingPlayer.pitch = DEFAULT_PITCH;
		}

		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play('spawn.wav', undefined, undefined, marble.body.position);
		}, `${this.id} ${marble.id}spawn`, true);

		for (let sound of marble.teleportSounds.get(this)) sound.stop();
		marble.teleportSounds.get(this).length = 0;
	}
}