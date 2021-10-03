import { AudioManager, AudioSource } from "../audio";
import { ResourceManager } from "../resources";
import { FinishScreen } from "./finish_screen";
import { HelpScreen } from "./help";
import { HomeScreen } from "./home";
import { Hud } from "./hud";
import { LevelSelect } from "./level_select";
import { LoadingScreen } from "./loading";
import { OptionsScreen } from "./options";
import { PauseScreen } from "./pause_screen";

export abstract class Menu {
	home: HomeScreen;
	levelSelect: LevelSelect;
	loadingScreen: LoadingScreen;
	optionsScreen: OptionsScreen;
	helpScreen: HelpScreen;
	hud: Hud;
	pauseScreen: PauseScreen;
	finishScreen: FinishScreen;

	menuDiv: HTMLDivElement;
	music: AudioSource;
	gameUiDiv = document.querySelector('#game-ui') as HTMLDivElement;

	abstract get uiAssetPath(): string;
	abstract audioAssetPath: string;
	abstract menuMusicSrc: string;

	constructor() {
		this.menuDiv = this.getMenuDiv();

		this.home = this.createHome();
		this.levelSelect = this.createLevelSelect();
		this.loadingScreen = this.createLoadingScreen();
		this.optionsScreen = this.createOptionsScreen();
		this.helpScreen = this.createHelpScreen();
		this.hud = this.createHud();
		this.pauseScreen = this.createPauseScreen();
		this.finishScreen = this.createFinishScreen();
	}

	abstract createHome(): HomeScreen;
	abstract createLevelSelect(): LevelSelect;
	abstract createLoadingScreen(): LoadingScreen;
	abstract createOptionsScreen(): OptionsScreen;
	abstract createHelpScreen(): HelpScreen;
	abstract createHud(): Hud;
	abstract createPauseScreen(): PauseScreen;
	abstract createFinishScreen(): FinishScreen;
	abstract getMenuDiv(): HTMLDivElement;

	setupButton(element: HTMLImageElement, path: string, onclick: () => any, loadDisabledImage = false, triggerOnMouseDown = false) {
		let ogPath = path;
		path = this.uiAssetPath + path;
		let normal = path + '_n.png';
		let hover = path + '_h.png';
		let down = path + '_d.png';
		let disabled = path + '_i.png';
		let held = false;
		let hovered = false;
	
		element.src = normal;
		element.addEventListener('mouseenter', () => {
			hovered = true;
			element.setAttribute('data-hovered', '');
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = held? down : hover;
			if (!held) AudioManager.play('buttonover.wav');
		});
		element.addEventListener('mouseleave', () => {
			hovered = false;
			element.removeAttribute('data-hovered');
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = normal;		
		});
		element.addEventListener('mousedown', (e) => {
			if (element.style.pointerEvents === 'none') return;
			if (e.button !== 0) return;
			held = true;
			if (!element.hasAttribute('data-locked')) element.src = down;
			AudioManager.play('buttonpress.wav');
			if (triggerOnMouseDown) onclick();
		});
		window.addEventListener('mouseup', () => {
			held = false;
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = hovered? hover : normal;
		});
		if (!triggerOnMouseDown) element.addEventListener('click', (e) => e.button === 0 && onclick());
	
		if (ogPath) {
			// Preload the images
			ResourceManager.loadImage(normal);
			ResourceManager.loadImage(hover);
			ResourceManager.loadImage(down);
			if (loadDisabledImage) ResourceManager.loadImage(disabled);
		}
	}

	show() {
		this.menuDiv.classList.remove('hidden');
		this.music = AudioManager.createAudioSource(this.menuMusicSrc, AudioManager.musicGain);
		this.music.node.loop = true;
		this.music.play();
	}

	hide() {
		this.menuDiv.classList.add('hidden');
		this.music?.stop();
	}

	showGameUi() {
		this.gameUiDiv.classList.remove('hidden');
	}

	hideGameUi() {
		this.gameUiDiv.classList.add('hidden');
	}

	async init() {
		AudioManager.setAssetPath(this.audioAssetPath);
		await AudioManager.loadBuffers([this.menuMusicSrc, 'buttonover.wav', 'buttonpress.wav']);
		await Promise.all([this.home.init(), this.levelSelect.init(), this.optionsScreen.init()]);
	}
}