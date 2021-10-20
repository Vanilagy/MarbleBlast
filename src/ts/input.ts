import { state } from "./state";
import { StorageManager } from "./storage";

export const currentMousePosition = {
	x: 0,
	y: 0
};

window.addEventListener('mousemove', (e) => {
	currentMousePosition.x = e.clientX;
	currentMousePosition.y = e.clientY;
	state.level?.onMouseMove(e);
});

window.addEventListener('mousedown', (e) => {
	if (!StorageManager.data) return;
	// Request pointer lock if we're currently in-game
	if (state.level && !state.level.paused && !state.level.finishTime) document.documentElement.requestPointerLock();

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName && document.pointerLockElement) {
		// Check if the mouse button is mapped to something
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			setPressed(key, buttonName, true);
			
			if (state.level) {
				if (key === 'jump' && isPressedOnce(key)) state.level.jumpQueued = true;
				if (key === 'use' && isPressedOnce(key)) state.level.useQueued = true;
				if (key === 'blast' && isPressedOnce(key)) state.level.blastQueued = true;
			}
		}
	}
});

window.addEventListener('mouseup', (e) => {
	if (!StorageManager.data) return;

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			setPressed(key, buttonName, false);
		}
	}
});

window.addEventListener('keydown', (e) => {
	if (!StorageManager.data) return;

	// Check if the key button is mapped to something
	for (let button in StorageManager.data.settings.gameButtonMapping) {
		let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
		if (e.code !== StorageManager.data.settings.gameButtonMapping[key]) continue;

		setPressed(key, e.code, true);

		if (state.level) {
			if (key === 'jump' && isPressedOnce(key)) state.level.jumpQueued = true;
			if (key === 'use' && isPressedOnce(key)) state.level.useQueued = true;
		}
	}
});

window.addEventListener('keyup', (e) => {
	if (!StorageManager.data) return;

	for (let button in StorageManager.data.settings.gameButtonMapping) {
		let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
		if (e.code !== StorageManager.data.settings.gameButtonMapping[key]) continue;

		setPressed(key, e.code, false);
	}
});

window.addEventListener('contextmenu', (e) => e.preventDefault()); // Disable right click context menu for good

window.addEventListener('beforeunload', (e) => {
	// Ask the user if they're sure about closing the tab if they're currently in game
	if (state.level) {
		e.preventDefault();
		e.returnValue = '';
	}
});

document.addEventListener('pointerlockchange', () => {
	// When pointer lock is left, we pause.
	if (!document.pointerLockElement) state.menu.pauseScreen.tryPause();
});

/** For each game button, a list of the keys/buttons corresponding to it that are currently pressed. */
const gameButtons = {
	up: [] as string[],
	down: [] as string[],
	left: [] as string[],
	right: [] as string[],
	jump: [] as string[],
	use: [] as string[],
	cameraUp: [] as string[],
	cameraDown: [] as string[],
	cameraLeft: [] as string[],
	cameraRight: [] as string[],
	freeLook: [] as string[],
	restart: [] as string[],
	pause: [] as string[],
	blast: [] as string[]
};

/** For each game button, a flag indicating whether it has been pressed since the flag was reset. Used to prevent things like entering and immediately leaving the pause menu. */
const pressedSinceFlag = {
	up: false,
	down: false,
	left: false,
	right: false,
	jump: false,
	use: false,
	cameraUp: false,
	cameraDown: false,
	cameraLeft: false,
	cameraRight: false,
	freeLook: false,
	restart: false,
	pause: false,
	blast: false
};

/** Set a button's state based on a presser. */
const setPressed = (buttonName: keyof typeof gameButtons, presser: string, state: boolean) => {
	let incl = gameButtons[buttonName].includes(presser);
	if (!state && incl) {
		gameButtons[buttonName] = gameButtons[buttonName].filter(x => x !== presser);
	} else if (state && !incl) {
		gameButtons[buttonName].push(presser);
		pressedSinceFlag[buttonName] = true;
	}
};

/** Determine if a button is pressed. */
export const isPressed = (buttonName: keyof typeof gameButtons) => {
	return (gameButtons[buttonName].length > 0);
};

/** Determine if a button is pressed by something other than LMB. */
export const isPressedByNonLMB = (buttonName: keyof typeof gameButtons) => {
	return (gameButtons[buttonName].filter(x => x !== 'LMB').length > 0);
};

/** Determine if a button is pressed by a gamepad. */
export const isPressedByGamepad = (buttonName: keyof typeof gameButtons) => {
	return gameButtons[buttonName].find(x => x.startsWith('gamepadButton')) !== undefined;
};

/** Determine if a button is only pressed by one presser. */
const isPressedOnce = (buttonName: keyof typeof gameButtons) => {
	return (gameButtons[buttonName].length === 1);
};

/** Return whether a presser has pressed the button since the flag was reset. */
export const getPressedFlag = (buttonName: keyof typeof gameButtons) => {
	return pressedSinceFlag[buttonName];
};

/** Reset the pressed flag for a button. */
export const resetPressedFlag = (buttonName: keyof typeof gameButtons) => {
	pressedSinceFlag[buttonName] = false;
};

export const releaseAllButtons = () => {
	for (let key in gameButtons) {
		if (key !== 'pause')
			gameButtons[key as keyof typeof gameButtons] = [];
	}
};

/** The current position (-1 to 1) of the marble and camera axes. */
export const gamepadAxes = {
	marbleX: 0.0,
	marbleY: 0.0,
	cameraX: 0.0,
	cameraY: 0.0
};

/** TODO: Make this configurable */
const gamepadAxisMappings = ['marbleX', 'marbleY', 'cameraX', 'cameraY'];
const gamepadButtonMappings = ['jump', 'use', '', '', '', '', 'jump', 'use', 'restart', 'pause', '', '', 'up', 'down', 'left', 'right', '', ''];

/** The most recent controller a button was pressed on, used to select the controller to poll */
let mostRecentGamepad = 0;

/** Referring to the button state of the controller. */
export const previousButtonState = [false, false, false, false, false, false, false, false, false, false, false, false, false, false];

/** Update the input from the gamepad, if it is connected. */
const updateGamepadInput = () => {
	let gamepads = [...navigator.getGamepads()].filter(x => x);
	if (gamepads.length === 0) {
		// No gamepad active
		for (let key in gamepadAxes) gamepadAxes[key as keyof typeof gamepadAxes] = 0.0;
		return;
	}
	
	// Update the most recent gamepad
	for (let i = 0; i < gamepads.length; i++) {
		for (let j = 0; j < gamepads[i].buttons.length; j++) {
			if (gamepads[i].buttons[j].value > 0.5) {
				mostRecentGamepad = i;
				break;
			}
		}
	}

	for (let i = 0; i < gamepads[mostRecentGamepad].buttons.length && i < 18; i++) {
		let state = (gamepads[mostRecentGamepad].buttons[i].value > 0.5);
		let presser = 'gamepadButton' + i;
		let buttonName = gamepadButtonMappings[i];
		if (buttonName !== '')
			setPressed(buttonName as keyof typeof StorageManager.data.settings.gameButtonMapping, presser, state);
	}
	
	for (let i = 0; i < gamepads[mostRecentGamepad].axes.length && i < 4; i++) {
		let axisName = gamepadAxisMappings[i];
		if (axisName !== '') {
			gamepadAxes[axisName as keyof typeof gamepadAxes] = gamepads[mostRecentGamepad].axes[i];
			// Dead zone
			if (Math.abs(gamepadAxes[axisName as keyof typeof gamepadAxes]) < 0.1)
				gamepadAxes[axisName as keyof typeof gamepadAxes] = 0;
		}
	}

	// Check for input on the level select screen
	if (!state.menu.levelSelect.div.classList.contains('hidden')) 
		state.menu.levelSelect.handleControllerInput(gamepads[mostRecentGamepad]);
		
	if (state.level?.paused)
		state.menu.pauseScreen.handleGamepadInput(gamepads[mostRecentGamepad]);
	
	for (let i = 0; i < gamepads[mostRecentGamepad].buttons.length && i < 18; i++) {
		previousButtonState[i] = (gamepads[mostRecentGamepad].buttons[i].value > 0.5);
	}
};

window.setInterval(updateGamepadInput, 4);