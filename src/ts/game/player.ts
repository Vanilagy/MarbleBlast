import { EntityState } from "../../../shared/game_server_format";
import { isPressed, getPressedFlag, gamepadAxes, normalizedJoystickHandlePosition } from "../input";
import { DEFAULT_PITCH, DEFAULT_YAW, Marble, MarbleControlState } from "../marble";
import { Vector2 } from "../math/vector2";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Entity } from "./entity";
import { Game } from "./game";
import { MultiplayerGame } from "./multiplayer_game";

type PlayerState = EntityState & { entityType: 'player' };

interface PlayerInternalState {
	lastRemoteState: PlayerState,
	lastRemoteStateFrame: number,
	movementLerpStart: Vector2
}

export class Player extends Entity<PlayerState, PlayerInternalState> {
	id: number;

	controlledMarble: Marble;

	pitch = DEFAULT_PITCH;
	yaw = DEFAULT_YAW;
	jumping = false;
	using = false;
	blasting = false;

	lastControlState: MarbleControlState = null;
	previousMouseMovementDistance = 0;
	inputHistory = new Map<number, MarbleControlState>();

	lastRemoteState: PlayerState = null;
	lastRemoteStateFrame: number = null;
	movementLerpStart = new Vector2();

	constructor(game: Game, id: number) {
		super(game);

		this.id = id;
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
		//return {...Marble.getPassiveControlState(), jumping: true, movement: new Vector2(0.01)};
		if (this !== this.game.localPlayer) return this.getRemoteControlState();

		if (this.inputHistory.has(this.game.state.frame)) {
			return this.inputHistory.get(this.game.state.frame);
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

		this.lastControlState = res;
		this.inputHistory.set(this.game.state.frame, res);

		this.jumping = false;
		this.using = false;
		this.blasting = false;

		return res;
	}

	getRemoteControlState(): MarbleControlState {
		if (!this.lastRemoteState) return Marble.getPassiveControlState();

		let completion = (this.game.state.frame - this.lastRemoteStateFrame) / (this.game as MultiplayerGame).simulator.lastReconciliationFrameCount;

		if (completion > 2) return Marble.getPassiveControlState();

		completion = Util.clamp(completion, 0, 1);
		let movement = this.movementLerpStart.clone().lerp(this.lastRemoteState.movement as Vector2, completion);

		return {
			...this.lastRemoteState,
			movement
		};
	}

	applyControlState() {
		let state = this.getControlState();

		this.controlledMarble.currentControlState = state;

		if (state.movement.length() > 0 || state.jumping || state.using || state.blasting) {
			this.interactWith(this.controlledMarble);
		}
	}

	update() {
		if (this === this.game.localPlayer) {
			this.owned = true;
			this.stateNeedsStore = true;
		}
	}

	reset() {
		let { euler } = this.controlledMarble.game.state.getStartPositionAndOrientation();

		// Determine starting camera orientation based on the start pad
		this.pitch = DEFAULT_PITCH;
		this.yaw = DEFAULT_YAW + euler.z;
	}

	getInitialState(): PlayerState {
		return {
			entityType: 'player',
			...Marble.getPassiveControlState()
		};
	}

	getCurrentState(): PlayerState {
		return {
			entityType: 'player',
			...(this.lastControlState ?? this.getInitialState())
		};
	}

	loadState(state: PlayerState, { frame }: { frame: number }) {
		if (this === this.game.localPlayer) return; // Don't care

		this.movementLerpStart = this.getRemoteControlState().movement;
		this.lastRemoteState = state;
		this.lastRemoteStateFrame = frame;

		this.internalStateNeedsStore = true;
	}

	getInternalState() {
		return {
			lastRemoteState: this.lastRemoteState,
			lastRemoteStateFrame: this.lastRemoteStateFrame,
			movementLerpStart: this.movementLerpStart.clone()
		};
	}

	loadInternalState(state: PlayerInternalState) {
		this.lastRemoteState = state.lastRemoteState;
		this.lastRemoteStateFrame = state.lastRemoteStateFrame;
		this.movementLerpStart.copy(state.movementLerpStart);
	}

	render() {}
	stop() {}
}