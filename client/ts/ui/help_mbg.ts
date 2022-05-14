import { TimeState } from "../level";
import { Euler } from "../math/euler";
import { Matrix4 } from "../math/matrix4";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { AmbientLight } from "../rendering/ambient_light";
import { PerspectiveCamera } from "../rendering/camera";
import { Renderer } from "../rendering/renderer";
import { Scene } from "../rendering/scene";
import { Shape } from "../shape";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { HelpScreen } from "./help";
import { Menu } from "./menu";

/** A list describing all possible scenes that can be displayed in the help menu. */
const sceneDescriptions: Record<string, {
	dtsPath: string,
	distance: number,
	translation?: Vector3,
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
		translation: new Vector3(0.15, 0.1, 0.05),
		matNamesOverride: { "base.gem": "purple.gem" }
	},
	{
		dtsPath: 'shapes/items/gem.dts',
		distance: 1.6,
		translation: new Vector3(-0.2, 0, -0.2)
	},
	{
		dtsPath: 'shapes/items/gem.dts',
		distance: 1.6,
		translation: new Vector3(0.15, 0, -0.55),
		matNamesOverride: { "base.gem": "green.gem" }
	}],
	"superSpeed": [{
		dtsPath: 'shapes/items/superspeed.dts',
		distance: 2.5
	}],
	"superJump": [{
		dtsPath: 'shapes/items/superjump.dts',
		distance: 2.5,
		translation: new Vector3(0, 0, -0.5)
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
		translation: new Vector3(0, 0, -0.4)
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
		translation: new Vector3(0, 0, -6)
	}],
	"trapDoor": [{
		dtsPath: 'shapes/hazards/trapdoor.dts',
		distance: 5,
		translation: new Vector3(0, 0, 0.8)
	}],
	"bumper": [{
		dtsPath: 'shapes/bumpers/pball_round.dts',
		distance: 1.3,
		translation: new Vector3(0, 0, -0.15)
	}],
	"mine": [{
		dtsPath: 'shapes/hazards/landmine.dts',
		distance: 1.3,
		translation: new Vector3(0, 0, -0.1)
	}],
	"oilslick": [{
		dtsPath: 'shapes/hazards/oilslick.dts',
		distance: 7
	}]
};

export class MbgHelpScreen extends HelpScreen {
	prevButton: HTMLImageElement;
	nextButton: HTMLImageElement;

	// Retrieve a list all of pages from the HTML
	pages = [...document.querySelectorAll('.help-page')] as HTMLDivElement[];
	currentPage: HTMLDivElement;

	helpCanvas = document.createElement('canvas');
	/** A renderer used to render small icons of shapes in the help screen. */
	helpRenderer = new Renderer({ canvas: this.helpCanvas, alpha: true, desynchronized: false });
	helpCamera = new PerspectiveCamera(40, 1);
	scenes = new Map<string, Scene>();
	shapes = new Map<string, Shape[]>();

	initProperties() {
		this.div = document.querySelector('#help') as HTMLDivElement;
		this.homeButton = document.querySelector('#help-back') as HTMLImageElement;
		this.homeButtonSrc = 'play/back';

		this.prevButton = document.querySelector('#help-prev') as HTMLImageElement;
		this.nextButton = document.querySelector('#help-next') as HTMLImageElement;
	}

	constructor(menu: Menu) {
		super(menu);

		menu.setupButton(this.prevButton, 'play/prev', () => this.cyclePage(-1));
		menu.setupButton(this.nextButton, 'play/next', () => this.cyclePage(1));

		this.showHelpPage(0);
		requestAnimationFrame(() => this.update());

		this.helpRenderer.setSize(80, 80);
		let rot = new Quaternion().setFromRotationMatrix(new Matrix4().makeRotationX(1.1));
		this.helpCamera.orientation.premultiply(rot);

		window.addEventListener('keydown', (e) => {
			if (this.div.classList.contains('hidden')) return;

			if (e.code === 'Escape') {
				this.homeButton.src = './assets/ui/play/back_d.png';
			}
		});

		window.addEventListener('keyup', (e) => {
			if (this.div.classList.contains('hidden')) return;

			if (e.code === 'Escape') {
				this.homeButton.click();
			}
		});
	}

	show() {
		super.show();
		this.initHelpScenes();
		this.showHelpPage(0);
	}

	cyclePage(direction: number) {
		let index = this.pages.indexOf(this.currentPage);
		index = Util.adjustedMod(index + direction, this.pages.length);
		this.showHelpPage(index);
	}

	showHelpPage(index: number) {
		for (let page of this.pages) {
			page.classList.add('hidden');
		}
		this.pages[index].classList.remove('hidden');
		this.currentPage = this.pages[index];

		// Scan the paragraph
		let paragraph = this.currentPage.querySelector('.help-paragraph');
		if (paragraph) {
			for (let element of paragraph.children) {
				let buttonAttribute = element.getAttribute('data-button'); // This element represents a keybinding, we need to replace its content based on what key the user has bound
				// Automatically replace the content with the correct value for the button
				if (buttonAttribute) {
					let str = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[buttonAttribute as keyof typeof StorageManager.data.settings.gameButtonMapping]);
					element.textContent = str;
				}
			}
		}
	}

	async update() {
		requestAnimationFrame(this.update.bind(this));
		if (this.div.classList.contains('hidden')) return;

		let now = performance.now();
		let canvasRows = this.currentPage.querySelectorAll('.help-canvas-row');

		// Update all shapes in the current page
		for (let row of canvasRows) {
			let canvas = row.children[0] as HTMLCanvasElement;
			let sceneName = canvas.getAttribute('data-scene'); // The name of the scene to show is stored in this attribute
			let scene = this.scenes.get(sceneName);
			if (!scene?.compiled) continue;

			// Select the correct scene
			let shapeArr = this.shapes.get(sceneName);
			for (let shape of shapeArr) {
				let euler = new Euler(0, 0, now / 3000 * Math.PI);
				shape.group.orientation.setFromEuler(euler);
				shape.group.recomputeTransform();
			}

			// Render the scene
			this.helpCamera.updateMatrixWorld();
			scene.prepareForRender(this.helpCamera);
			this.helpRenderer.render(scene, this.helpCamera);

			// Copy it to the other canvas
			let ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, 80, 80);
			ctx.drawImage(this.helpCanvas, 0, 0);
		}
	}

	async initHelpScenes() {
		if (this.scenes.size > 0) return;

		let timeState: TimeState = { timeSinceLoad: 0, currentAttemptTime: 0, gameplayClock: 0, physicsTickCompletion: 0, tickIndex: 0 };

		// Create all scenes and shapes
		for (let key in sceneDescriptions) {
			let scene = new Scene(this.helpRenderer);
			let description = sceneDescriptions[key as keyof typeof sceneDescriptions];
			let arr: Shape[] = [];

			for (let shapeDescription of description) {
				let shape = new Shape();
				shape.dtsPath = shapeDescription.dtsPath;
				if (shapeDescription.matNamesOverride) shape.matNamesOverride = shapeDescription.matNamesOverride;
				arr.push(shape);
			}

			this.scenes.set(key, scene);
			this.shapes.set(key, arr);
		}

		// Init the shapes
		let promises: Promise<any>[] = [];
		for (let [, shapeArr] of this.shapes) {
			for (let shape of shapeArr) promises.push(shape.init());
		}
		await Promise.all(promises);

		let lookVector = new Vector3(0, 0, -1);
		lookVector.applyQuaternion(this.helpCamera.orientation);

		// Construct the scenes and set transforms
		for (let [key, scene] of this.scenes) {
			let shapeArr = this.shapes.get(key);
			for (let i = 0; i < shapeArr.length; i++) {
				let shape = shapeArr[i];
				let description = sceneDescriptions[key as keyof typeof sceneDescriptions][i];

				let position = lookVector.clone().multiplyScalar(description.distance);
				if (description.translation) position.add(description.translation);

				shape.setTransform(position, new Quaternion(), new Vector3(1, 1, 1));
				shape.render(timeState);
				scene.add(shape.group);
			}

			// A simple ambient light will do
			let light = new AmbientLight(new Vector3().setScalar(1));
			scene.addAmbientLight(light);

			scene.compile();
		}
	}
}