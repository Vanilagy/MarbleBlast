import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { isPressed, getPressedFlag, gamepadAxes, normalizedJoystickHandlePosition } from "../input";
import { DEFAULT_PITCH, DEFAULT_YAW, Marble, MarbleControlState } from "../marble";
import { Vector2 } from "../math/vector2";
import { G } from "../global";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Entity } from "./entity";
import { Game } from "./game";
import { MultiplayerGame } from "./multiplayer_game";

type PlayerState = EntityState & { entityType: 'player' };

export class Player extends Entity {
	restartable = true;
	controlledMarble: Marble;
	sessionId: string = null;

	updateOrder = -1;
	applyUpdatesBeforeAdvance = true;
	sendAllUpdates = true;

	pitch = DEFAULT_PITCH;
	yaw = DEFAULT_YAW;
	jumping = false;
	using = false;
	blasting = false;

	controlState = Marble.getPassiveControlState();

	previousMouseMovementDistance = 0;
	inputHistory = new Map<number, MarbleControlState>();
	lastRemoteState: PlayerState;
	lastRemoteStateFrame = -Infinity;

	hasRestartIntent = false;

	constructor(game: Game, id: number) {
		super(game);

		this.id = id;
	}

	onButtonsChange() {
		this.checkButtons();
	}

	onMouseMove(e: MouseEvent) {
		Util.assert(this === this.game.localPlayer);

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
		Util.assert(this === this.game.localPlayer);

		if (isPressed('jump') && getPressedFlag('jump')) this.jumping = true;
		if (isPressed('use') && getPressedFlag('use')) this.using = true;
		if (isPressed('blast') && getPressedFlag('blast')) this.blasting = true;
	}

	update() {
		if (this === this.game.localPlayer) {
			this.affectedBy.add(this);
			this.affect(this.controlledMarble);
			this.stateNeedsStore = true;

			if (this.inputHistory.has(this.game.state.frame)) {
				this.controlState = this.inputHistory.get(this.game.state.frame);
			} else {
				this.checkButtons();

				let allowUserInput = !G.menu.finishScreen.showing && document.activeElement !== G.menu.hud.chatInput;
				let movement = new Vector2();

				movement.setScalar(0);
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

				// Restrict movement to [-1, 1]^2
				movement.clampScalar(-1, 1);

				if (!allowUserInput) movement.multiplyScalar(0);

				this.checkButtons();

				let yawChange = 0.0;
				let pitchChange = 0.0;
				let freeLook = StorageManager.data.settings.alwaysFreeLook || isPressed('freeLook');
				let amount = Util.lerp(1, 6, StorageManager.data.settings.keyboardSensitivity);
				if (isPressed('cameraLeft')) yawChange += amount;
				if (isPressed('cameraRight')) yawChange -= amount;
				if (isPressed('cameraUp')) pitchChange -= amount;
				if (isPressed('cameraDown')) pitchChange += amount;

				yawChange -= gamepadAxes.cameraX * Util.lerp(0.5, 10, StorageManager.data.settings.mouseSensitivity);
				if (freeLook) pitchChange += gamepadAxes.cameraY * Util.lerp(0.5, 10, StorageManager.data.settings.mouseSensitivity);

				this.yaw += yawChange / GAME_UPDATE_RATE;
				this.pitch += pitchChange / GAME_UPDATE_RATE;

				this.pitch = Util.clamp(this.pitch, -Math.PI/2 + Math.PI/4, Math.PI/2 - 0.0001); // The player can't look straight up

				let res: MarbleControlState = {
					movement,
					yaw: this.yaw,
					pitch: this.pitch,
					jumping: allowUserInput && this.jumping,
					using: allowUserInput && this.using,
					blasting: allowUserInput && this.blasting
				};

				this.controlState = res;
				this.inputHistory.set(this.game.state.frame, res);
			}

			this.jumping = false;
			this.using = false;
			this.blasting = false;
		} else {
			if (this.game.state.frame === this.lastRemoteStateFrame) {
				this.affectedBy.add(this);
				this.affect(this.controlledMarble); // Is this clean?
			}

			if (this.inputHistory.has(this.game.state.frame)) {
				this.controlState = this.inputHistory.get(this.game.state.frame);
			} else if (!this.lastRemoteState) {
				this.controlState = Marble.getPassiveControlState();
			} else if (this.game.state.frame - this.lastRemoteStateFrame >= (this.game as MultiplayerGame).state.frameGap * 2) {
				this.controlState = Marble.getPassiveControlState();
			} else {
				this.controlState = { ...this.lastRemoteState.controlState, movement: new Vector2() };
			}
		}
	}

	restart() {
		// We override the normal restarting behavior aqui

		let { euler } = this.controlledMarble.getStartPositionAndOrientation();

		this.yaw = DEFAULT_YAW + euler.z;
		this.pitch = DEFAULT_PITCH;
	}

	getInitialState(): PlayerState {
		return {
			entityType: 'player',
			controlState: Marble.getPassiveControlState()
		};
	}

	getState(): PlayerState {
		return {
			entityType: 'player',
			controlState: this.inputHistory.get(this.game.state.frame) ?? Marble.getPassiveControlState()
		};
	}

	loadState(state: PlayerState, { frame, remote }: { frame: number, remote: boolean }) {
		if (this === this.game.localPlayer) return; // Don't care

		this.inputHistory.set(frame, {
			...state.controlState,
			movement: new Vector2().fromObject(state.controlState.movement)
		});

		if (remote) {
			if (frame > this.lastRemoteStateFrame) {
				this.lastRemoteStateFrame = frame;
				this.lastRemoteState = state;
			}
		}
	}

	render() {}
	stop() {}
}