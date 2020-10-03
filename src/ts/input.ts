import { state } from "./state";

window.addEventListener('mousemove', (e) => {
	state.currentLevel?.onMouseMove(e);
});

window.addEventListener('mousedown', (e) => {
	if (state.currentLevel && !state.currentLevel.paused && !state.currentLevel.finishTime) document.documentElement.requestPointerLock();

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		for (let button in gameButtonMapping) {
			let key = button as keyof typeof gameButtonMapping;
			if (buttonName !== gameButtonMapping[key]) continue;
	
			gameButtons[key] = true;
		}
	}
});

window.addEventListener('mouseup', (e) => {
	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		for (let button in gameButtonMapping) {
			let key = button as keyof typeof gameButtonMapping;
			if (buttonName !== gameButtonMapping[key]) continue;
	
			gameButtons[key] = false;
		}
	}
});

window.addEventListener('keydown', (e) => {
	for (let button in gameButtonMapping) {
		let key = button as keyof typeof gameButtonMapping;
		if (e.code !== gameButtonMapping[key]) continue;

		gameButtons[key] = true;
	}
});

window.addEventListener('keyup', (e) => {
	for (let button in gameButtonMapping) {
		let key = button as keyof typeof gameButtonMapping;
		if (e.code !== gameButtonMapping[key]) continue;

		gameButtons[key] = false;
	}
});

export const gameButtonMapping = {
	"up": "KeyW", // kekw
	"down": "KeyS",
	"left": "KeyA",
	"right": "KeyD",
	"jump": "Space",
	"use": "LMB",
	"cameraUp": "ArrowUp",
	"cameraDown": "ArrowDown",
	"cameraLeft": "ArrowLeft",
	"cameraRight": "ArrowRight",
	"freeLook": "RMB"
};

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