import { Level } from "./level";
import { state } from "./state";
import './input';
import OIMO from "./declarations/oimo";
import { ResourceManager } from "./resources";
import { MisParser } from "./parsing/mis_parser";
import * as THREE from "three";
import { AudioManager } from "./audio";

OIMO.Setting.defaultGJKMargin = 0.005;
THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

async function init() {
	await ResourceManager.init();
	await AudioManager.init();

	let started = false;
	window.addEventListener('mousedown', async () => {
		if (started) return;
		started = true;

		AudioManager.context.resume();

		let mission = await MisParser.loadFile("./assets/data/missions/beginner/finale.mis");
		state.currentLevel = new Level(mission);
	});
}
window.onload = init;