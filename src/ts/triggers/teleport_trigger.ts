import { AudioManager } from "../audio";
import OIMO from "../declarations/oimo";
import { DEFAULT_PITCH, Level, TimeState } from "../level";
import { MisParser, MissionElementTrigger } from "../parsing/mis_parser";
import { state } from "../state";
import { Util } from "../util";
import { DestinationTrigger } from "./destination_trigger";
import { Trigger } from "./trigger";

/** A teleport trigger teleports the marble to a specified destination after some time of being inside it. */
export class TeleportTrigger extends Trigger {
	/** How long after entry until the teleport happens */
	delay = 2000;
	entryTime: number = null;

	constructor(element: MissionElementTrigger, level: Level) {
		super(element, level);

		if (element.delay) this.delay = MisParser.parseNumber(element.delay);
	}

	onMarbleEnter(time: TimeState) {
		this.entryTime = time.currentAttemptTime;
		state.menu.hud.displayAlert("Teleporter has been activated, please wait.");
		this.level.replay.recordMarbleEnter(this);
		this.level.marble.enableTeleportingLook(time);
	}

	onMarbleLeave(time: TimeState) {
		this.entryTime = null;
		this.level.replay.recordMarbleLeave(this);
		this.level.marble.disableTeleportingLook(time);
	}

	tick(time: TimeState) {
		if (this.entryTime === null) return;
		if (time.currentAttemptTime - this.entryTime >= this.delay) this.executeTeleport();
	}

	executeTeleport() {
		this.entryTime = null;

		// Find the destination trigger
		let destination = this.level.triggers.find(x => x instanceof DestinationTrigger && x.element._name.toLowerCase() === this.element.destination?.toLowerCase());
		if (!destination) return; // Who knows

		let body = this.level.marble.body;

		// Determine where to place the marble
		let position: OIMO.Vec3;
		if (this.element.centerdestpoint || destination.element.centerdestpoint) {
			position = destination.body.getPosition();
		} else {
			position = Util.vecThreeToOimo(destination.vertices[0]).add(new OIMO.Vec3(0, 0, 3));
		}
		body.setPosition(position);

		if (!MisParser.parseBoolean(this.element.keepvelocity || destination.element.keepvelocity)) body.setLinearVelocity(new OIMO.Vec3());
		if (MisParser.parseBoolean(this.element.inversevelocity || destination.element.inversevelocity)) body.setLinearVelocity(body.getLinearVelocity().scaleEq(-1));
		if (!MisParser.parseBoolean(this.element.keepangular || destination.element.keepangular)) body.setAngularVelocity(new OIMO.Vec3());

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
	}

	reset() {
		this.entryTime = null;
	}
}