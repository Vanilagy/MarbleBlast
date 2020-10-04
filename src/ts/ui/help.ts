import { setupButton } from "./ui";
import { homeScreenDiv } from "./home";
import { Util } from "../util";
import * as THREE from "three";
import { Shape } from "../shape";
import { StorageManager } from "../storage";

export const helpDiv = document.querySelector('#help') as HTMLDivElement;
const prevButton = document.querySelector('#help-prev') as HTMLImageElement;
const backButton = document.querySelector('#help-back') as HTMLImageElement;
const nextButton = document.querySelector('#help-next') as HTMLImageElement;

setupButton(prevButton, 'play/prev', () => cyclePage(-1));
setupButton(backButton, 'play/back', () => {
	helpDiv.classList.add('hidden');
	homeScreenDiv.classList.remove('hidden');
});
setupButton(nextButton, 'play/next', () => cyclePage(1));

const pages = [...document.querySelectorAll('.help-page')] as HTMLDivElement[];
let currentPage: HTMLDivElement;

const cyclePage = (direction: number) => {
	let index = pages.indexOf(currentPage);
	index = Util.adjustedMod(index + direction, pages.length);
	showHelpPage(index);
};

export const showHelpPage = (index: number) => {
	for (let page of pages) {
		page.classList.add('hidden');
	}
	pages[index].classList.remove('hidden');
	currentPage = pages[index];

	let paragraph = currentPage.querySelector('.help-paragraph');
	if (paragraph) {
		for (let element of paragraph.children) {
			let buttonAttribute = element.getAttribute('data-button');
			if (buttonAttribute) {
				let str = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[buttonAttribute as keyof typeof StorageManager.data.settings.gameButtonMapping]);
				element.textContent = str;
			}
		}
	}
};
showHelpPage(0);

const update = () => {
	requestAnimationFrame(update);
	if (helpDiv.classList.contains('hidden')) return;

	let now = performance.now();
	let canvasRows = currentPage.querySelectorAll('.help-canvas-row');

	for (let row of canvasRows) {
		let canvas = row.children[0] as HTMLCanvasElement;
		let sceneName = canvas.getAttribute('data-scene');
		let scene = scenes.get(sceneName);
		if (!scene) continue;

		let shapeArr = shapes.get(sceneName);
		for (let shape of shapeArr) {
			shape.group.rotation.z = now / 3000 * Math.PI;
		}

		helpRenderer.render(scene, helpCamera);

		let ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, 80, 80);
		ctx.drawImage(helpRenderer.domElement, 0, 0);
	}
};
requestAnimationFrame(update);

const helpRenderer = new THREE.WebGLRenderer({ alpha: true });
helpRenderer.setSize(80, 80);
const helpCamera = new THREE.PerspectiveCamera(40, 1);
helpCamera.rotateX(1.1);
const scenes = new Map<string, THREE.Scene>();

const sceneDescriptions: Record<string, {
	dtsPath: string,
	distance: number,
	translation?: THREE.Vector3,
	matNamesOverride?: Record<string, string>
}[]> = {
	"startPad": [{
		dtsPath: 'shapes/pads/startarea.dts',
		distance: 6
	}],
	"endPad": [{
		dtsPath: 'shapes/pads/endarea.dts',
		distance: 6
	}],
	"gems": [{
		dtsPath: 'shapes/items/gem.dts',
		distance: 1.6,
		translation: new THREE.Vector3(0.15, 0.1, 0.05),
		matNamesOverride: { "base.gem": "purple.gem" }
	},
	{
		dtsPath: 'shapes/items/gem.dts',
		distance: 1.6,
		translation: new THREE.Vector3(-0.2, 0, -0.2)
	},
	{
		dtsPath: 'shapes/items/gem.dts',
		distance: 1.6,
		translation: new THREE.Vector3(0.15, 0, -0.55),
		matNamesOverride: { "base.gem": "green.gem" }
	}],
	"superSpeed": [{
		dtsPath: 'shapes/items/superspeed.dts',
		distance: 2.5
	}],
	"superJump": [{
		dtsPath: 'shapes/items/superjump.dts',
		distance: 2.5,
		translation: new THREE.Vector3(0, 0, -0.5)
	}],
	"shockAbsorber": [{
		dtsPath: 'shapes/items/shockabsorber.dts',
		distance: 2.5
	}],
	"superBounce": [{
		dtsPath: 'shapes/items/superbounce.dts',
		distance: 2.5
	}],
	"gyrocopter": [{
		dtsPath: 'shapes/images/helicopter.dts',
		distance: 2.5,
		translation: new THREE.Vector3(0, 0, -0.4)
	}],
	"timeTravel": [{
		dtsPath: 'shapes/items/timetravel.dts',
		distance: 2.5
	}],
	"gravityModifier": [{
		dtsPath: 'shapes/items/antigravity.dts',
		distance: 2.5
	}],
	"ductFan": [{
		dtsPath: 'shapes/hazards/ductfan.dts',
		distance: 3.2
	}],
	"tornado": [{
		dtsPath: 'shapes/hazards/tornado.dts',
		distance: 10,
		translation: new THREE.Vector3(0, 0, -6)
	}],
	"trapDoor": [{
		dtsPath: 'shapes/hazards/trapdoor.dts',
		distance: 5,
		translation: new THREE.Vector3(0, 0, 0.8)
	}],
	"bumper": [{
		dtsPath: 'shapes/bumpers/pball_round.dts',
		distance: 1.3,
		translation: new THREE.Vector3(0, 0, -0.15)
	}],
	"mine": [{
		dtsPath: 'shapes/hazards/landmine.dts',
		distance: 1.3,
		translation: new THREE.Vector3(0, 0, -0.1)
	}],
	"oilslick": [{
		dtsPath: 'shapes/hazards/oilslick.dts',
		distance: 7
	}]
};
const shapes = new Map<string, Shape[]>();

export const initHelpScenes = async () => {
	let timeState = { timeSinceLoad: 0, currentAttemptTime: 0, gameplayClock: 0, physicsTickCompletion: 0 };

	for (let key in sceneDescriptions) {
		let scene = new THREE.Scene();
		let description = sceneDescriptions[key as keyof typeof sceneDescriptions];
		let arr: Shape[] = [];

		for (let shapeDescription of description) {
			let shape = new Shape();
			shape.dtsPath = shapeDescription.dtsPath;
			if (shapeDescription.matNamesOverride) shape.matNamesOverride = shapeDescription.matNamesOverride;
			arr.push(shape);
		}

		scenes.set(key, scene);
		shapes.set(key, arr);
	}

	let promises: Promise<any>[] = [];
	for (let [, shapeArr] of shapes) {
		for (let shape of shapeArr) promises.push(shape.init());
	}
	await Promise.all(promises);

	let lookVector = new THREE.Vector3(0, 0, -1);
	lookVector.applyQuaternion(helpCamera.quaternion);

	for (let [key, scene] of scenes) {
		let shapeArr = shapes.get(key);
		for (let i = 0; i < shapeArr.length; i++) {
			let shape = shapeArr[i];
			let description = sceneDescriptions[key as keyof typeof sceneDescriptions][i];

			let position = lookVector.clone().multiplyScalar(description.distance);
			if (description.translation) position.add(description.translation);

			shape.setTransform(position, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
			shape.render(timeState);
			scene.add(shape.group);
		}

		let light = new THREE.AmbientLight(0xffffff, 1);
		scene.add(light);
	}
};

window.addEventListener('keydown', (e) => {
	if (helpDiv.classList.contains('hidden')) return;

	if (e.code === 'Escape') {
		backButton.src = './assets/ui/play/back_d.png';
	}
});

window.addEventListener('keyup', (e) => {
	if (helpDiv.classList.contains('hidden')) return;

	if (e.code === 'Escape') {
		backButton.click();
	}
});