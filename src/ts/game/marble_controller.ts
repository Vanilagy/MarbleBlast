import { isPressed, gamepadAxes, normalizedJoystickHandlePosition, getPressedFlag } from "../input";
import { Marble, MarbleControlState } from "../marble";
import { Vector2 } from "../math/vector2";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";

export const DEFAULT_PITCH = 0.45;

export class MarbleController {
	marble: Marble;

	yaw = 0;
	pitch = DEFAULT_PITCH;
	jumping = false;
	using = false;
	blasting = false;

	previousMouseMovementDistance = 0;

	history: {
		tick: number,
		controlState: MarbleControlState
	}[] = [];

	constructor(marble: Marble) {
		this.marble = marble;
	}

	onButtonsChange() {
		this.checkButtons();
	}

	onMouseMove(e: MouseEvent) {
		let totalDistance = Math.hypot(e.movementX, e.movementY);

		// Strangely enough, Chrome really bugs out sometimes and flings the mouse into a random direction quickly. We try to catch that here and ignore the mouse movement if we detect it.
		if (totalDistance > 350 && this.previousMouseMovementDistance * 4 < totalDistance) {
			this.previousMouseMovementDistance *= 1.5; // Make the condition harder to hit the next time
			return;
		}
		this.previousMouseMovementDistance = totalDistance;

		let factor = Util.lerp(1 / 2500, 1 / 100, StorageManager.data.settings.mouseSensitivity);
		let xFactor = (StorageManager.data.settings.invertMouse & 0b01)? -1 : 1;
		let yFactor = (StorageManager.data.settings.invertMouse & 0b10)? -1 : 1;
		let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');

		if (freeLook) this.pitch += e.movementY * factor * yFactor;
		this.yaw -= e.movementX * factor * xFactor;
	}

	checkButtons() {
		if (isPressed('jump') && getPressedFlag('jump')) this.jumping = true;
		if (isPressed('use') && getPressedFlag('use')) this.using = true;
		if (isPressed('blast') && getPressedFlag('blast')) this.blasting = true;
	}

	getControlState(): MarbleControlState {
		let gameTick = this.marble.game.state.tick;
		for (let i = this.history.length-1; i >= 0 && this.history[i].tick >= gameTick; i--) {
			if (this.history[i].tick === gameTick) return this.history[i].controlState;
		}

		let allowUserInput = !state.menu.finishScreen.showing;

		let movement = new Vector2();

		if (isPressed('up')) movement.add(new Vector2(1, 0));
		if (isPressed('down')) movement.add(new Vector2(-1, 0));
		if (isPressed('left')) movement.add(new Vector2(0, 1));
		if (isPressed('right')) movement.add(new Vector2(0, -1));

		// Add gamepad input
		movement.add(new Vector2(-gamepadAxes.marbleY, -gamepadAxes.marbleX));

		// Add touch joystick input
		if (normalizedJoystickHandlePosition) movement.add(new Vector2(
			-Util.signedSquare(normalizedJoystickHandlePosition.y),
			-Util.signedSquare(normalizedJoystickHandlePosition.x)
		));

		// Restrict to [-1, 1]^2
		movement.clampScalar(-1, 1);

		if (!allowUserInput) movement.multiplyScalar(0);

		this.checkButtons();

		let res: MarbleControlState = {
			movement,
			yaw: this.yaw,
			pitch: this.pitch,
			jumping: allowUserInput && this.jumping,
			using: allowUserInput && this.using,
			blasting: allowUserInput && this.blasting
		};

		this.jumping = false;
		this.using = false;
		this.blasting = false;

		this.history.push({
			tick: this.marble.game.state.tick,
			controlState: res
		});

		return res;
	}

	reset() {
		let { euler } = this.marble.game.state.getStartPositionAndOrientation();

		// Determine starting camera orientation based on the start pad
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;
	}

	static getPassiveControlState(): MarbleControlState {
		return {
			movement: new Vector2(),
			yaw: 0,
			pitch: DEFAULT_PITCH,
			jumping: false,
			using: false,
			blasting: false
		};
	}
}