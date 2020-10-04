import { state } from "./state";
import { StorageManager } from "./storage";

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
	if (state.currentLevel && !state.currentLevel.paused && !state.currentLevel.finishTime) document.documentElement.requestPointerLock();

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			gameButtons[key] = true;
		}
	}
});

window.addEventListener('mouseup', (e) => {
	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			gameButtons[key] = false;
		}
	}
});

window.addEventListener('keydown', (e) => {
	for (let button in StorageManager.data.settings.gameButtonMapping) {
		let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
		if (e.code !== StorageManager.data.settings.gameButtonMapping[key]) continue;

		gameButtons[key] = true;
	}
});

window.addEventListener('keyup', (e) => {
	for (let button in StorageManager.data.settings.gameButtonMapping) {
		let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
		if (e.code !== StorageManager.data.settings.gameButtonMapping[key]) continue;

		gameButtons[key] = false;
	}
});

window.addEventListener('contextmenu', (e) => e.preventDefault()); // Disable right click context menu for good

export const gameButtons = {
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
	freeLook: false
};