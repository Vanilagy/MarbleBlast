import './input';
import OIMO from "./declarations/oimo";
import { ResourceManager } from "./resources";
import * as THREE from "three";
import { AudioManager } from "./audio";
import './ui/home';
import { initLevelSelect } from "./ui/level_select";
import { startUi } from "./ui/ui";
import { StorageManager } from './storage';

OIMO.Setting.defaultGJKMargin = 0.005;
OIMO.Setting.defaultContactPositionCorrectionAlgorithm = OIMO.PositionCorrectionAlgorithm.NGS;
THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

async function init() {
	await ResourceManager.init();
	await StorageManager.init();
	await AudioManager.init();
	await initLevelSelect();

	let started = false;
	window.addEventListener('mousedown', async () => {
		if (started) return;
		started = true;

		AudioManager.context.resume();
		startUi();
	});
}
window.onload = init;