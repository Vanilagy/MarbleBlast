import { state } from "./state";
import { StorageManager } from "./storage";
import { gameUiDiv } from "./ui/game";
import { levelSelectDiv, playCurrentLevel, selectTab, getCurrentLevelArray, beginnerLevels, intermediateLevels, advancedLevels, customLevels, cycleMission } from "./ui/level_select";

export const currentMousePosition = {
	x: 0,
	y: 0
};

window.addEventListener('mousemove', (e) => {
	currentMousePosition.x = e.clientX;
	currentMousePosition.y = e.clientY;
	state.currentLevel?.onMouseMove(e);
});

window.addEventListener('mousedown', (e) => {
	if (!StorageManager.data) return;
	// Request pointer lock if we're currently in-game
	if (state.currentLevel && !state.currentLevel.paused && !state.currentLevel.finishTime) document.documentElement.requestPointerLock();

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName && document.pointerLockElement) {
		// Check if the mouse button is mapped to something
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			setPressed(key, buttonName, true);
			
			if (state.currentLevel) {
				if (key === 'jump' && isPressedOnce(key)) state.currentLevel.jumpQueued = true;
				if (key === 'use' && isPressedOnce(key)) state.currentLevel.useQueued = true;
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

		if (state.currentLevel) {
			if (key === 'jump' && isPressedOnce(key)) state.currentLevel.jumpQueued = true;
			if (key === 'use' && isPressedOnce(key)) state.currentLevel.useQueued = true;
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
	if (state.currentLevel) {
		e.preventDefault();
		e.returnValue = '';
	}
});

/** For each game button, a list of the keys/buttons corresponding to it that are currently pressed. */
const gameButtons = {
	up: [],
	down: [],
	left: [],
	right: [],
	jump: [],
	use: [],
	cameraUp: [],
	cameraDown: [],
	cameraLeft: [],
	cameraRight: [],
	freeLook: [],
	restart: [],
	pause: []
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
	pause: false
};

/** Set a button's state based on a presser. */
const setPressed = (buttonName, presser, state) => {
	let incl = gameButtons[buttonName].includes(presser);
	if (!state && incl) {
		gameButtons[buttonName] = gameButtons[buttonName].filter(x => x !== presser);
	}
	else if (state && !incl) {
		gameButtons[buttonName].push(presser);
		pressedSinceFlag[buttonName] = true;
	}
};

/** Determine if a button is pressed. */
export const isPressed = (buttonName) => {
	return (gameButtons[buttonName].length > 0);
};

/** Determine if a button is pressed by something other than LMB. */
export const isPressedByNonLMB = (buttonName) => {
	return (gameButtons[buttonName].filter(x => x !== 'LMB').length > 0);
};

/** Determine if a button is only pressed by one presser. */
const isPressedOnce = (buttonName) => {
	return (gameButtons[buttonName].length === 1);
};

/** Return whether a presser has pressed the button since the flag was reset. */
export const getPressedFlag = (buttonName) => {
	return pressedSinceFlag[buttonName];
};

/** Reset the pressed flag for a button. */
export const resetPressedFlag = (buttonName) => {
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

const previousButtonState = [false, false, false, false, false, false, false, false, false, false, false, false, false, false];

/** Update the input from the gamepad, if it is connected. */
const updateGamepadInput = () => {
	let gamepads = navigator.getGamepads();
	if (gamepads.length == 0) {
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
		let presser = 'button' + i;
		let buttonName = gamepadButtonMappings[i];
		if (buttonName != '')
			setPressed(buttonName, presser, state);
	}
	
	for (let i = 0; i < gamepads[mostRecentGamepad].axes.length && i < 4; i++) {
		let axisName = gamepadAxisMappings[i];
		if (axisName != '') {
			gamepadAxes[axisName] = gamepads[mostRecentGamepad].axes[i];
			// Dead zone
			if (Math.abs(gamepadAxes[axisName]) < 0.1)
				gamepadAxes[axisName] = 0;
		}
	}
	
	// Check for input on the level select screen (TODO: this could probably go in a better place tbh)
	if (!levelSelectDiv.classList.contains('hidden')) {
		// A button to play
		if (gamepads[mostRecentGamepad].buttons[0].value > 0.5 && !previousButtonState[0])
			playCurrentLevel();
		// LT, RT to change category
		if (gamepads[mostRecentGamepad].buttons[6].value > 0.5 && !previousButtonState[6]) {
			// Should probably have a function for this tbh
			if (getCurrentLevelArray() === intermediateLevels)
				selectTab('beginner');
			else if (getCurrentLevelArray() === advancedLevels)
				selectTab('intermediate');
			else if (getCurrentLevelArray() === customLevels)
				selectTab('advanced');
		}
		if (gamepads[mostRecentGamepad].buttons[7].value > 0.5 && !previousButtonState[7]) {
			// Should probably have a function for this tbh
			if (getCurrentLevelArray() === beginnerLevels)
				selectTab('intermediate');
			else if (getCurrentLevelArray() === intermediateLevels)
				selectTab('advanced');
			else if (getCurrentLevelArray() === advancedLevels)
				selectTab('custom');
		}
		// D-pad left+right to change levels
		if (gamepads[mostRecentGamepad].buttons[14].value > 0.5 && !previousButtonState[14])
			cycleMission(-1);
		if (gamepads[mostRecentGamepad].buttons[15].value > 0.5 && !previousButtonState[15])
			cycleMission(1);
	}
	
	for (let i = 0; i < gamepads[mostRecentGamepad].buttons.length && i < 18; i++) {
		previousButtonState[i] = (gamepads[mostRecentGamepad].buttons[i].value > 0.5);
	}
};

window.setInterval(updateGamepadInput, 4);