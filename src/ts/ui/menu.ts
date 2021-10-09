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
	backgroundImage: HTMLImageElement;
	music: AudioSource;
	gameUiDiv = document.querySelector('#game-ui') as HTMLDivElement;

	activeButtonVariant = new Map<HTMLImageElement, number>();
	variantChangeListeners = new Map<HTMLImageElement, Function>();

	abstract get uiAssetPath(): string;
	abstract audioAssetPath: string;
	abstract menuMusicSrc: string;

	constructor() {
		this.menuDiv = this.getMenuDiv();
		this.backgroundImage = this.getBackgroundImage();
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
	abstract getBackgroundImage(): HTMLImageElement;

	setupVaryingButton(element: HTMLImageElement, paths: string[], onclick: (ev?: MouseEvent) => any, loadDisabledImage = false, triggerOnMouseDown = false, playHoverSound = true) {
		let ogPaths = paths.slice();
		paths = paths.map(x => this.uiAssetPath + x);
		let held = false;
		let hovered = false;

		const normal = () => paths[this.activeButtonVariant.get(element)] + '_n.png';
		const hover = () => paths[this.activeButtonVariant.get(element)] + '_h.png';
		const down = () => paths[this.activeButtonVariant.get(element)] + '_d.png';
		const disabled = () => paths[this.activeButtonVariant.get(element)] + '_i.png';
	
		element.src = normal();
		element.addEventListener('mouseenter', () => {
			hovered = true;
			element.setAttribute('data-hovered', '');
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = held? down() : hover();
			if (!held && playHoverSound) AudioManager.play('buttonover.wav');
		});
		element.addEventListener('mouseleave', () => {
			hovered = false;
			element.removeAttribute('data-hovered');
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = normal();		
		});
		element.addEventListener('mousedown', (e) => {
			if (element.style.pointerEvents === 'none') return;
			if (e.button !== 0) return;
			held = true;
			if (!element.hasAttribute('data-locked')) element.src = down();
			AudioManager.play('buttonpress.wav');
			if (triggerOnMouseDown) onclick(e);
		});
		window.addEventListener('mouseup', () => {
			held = false;
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = hovered? hover() : normal();
		});
		if (!triggerOnMouseDown) element.addEventListener('click', (e) => e.button === 0 && onclick(e));
	
		for (let ogPath of ogPaths) {
			if (!ogPath) continue;

			// Preload the images
			this.activeButtonVariant.set(element, ogPaths.indexOf(ogPath));
			ResourceManager.loadImage(normal());
			ResourceManager.loadImage(hover());
			ResourceManager.loadImage(down());
			if (loadDisabledImage) ResourceManager.loadImage(disabled());
		}

		const onVariantChange = () => {
			if (held) element.src = down();
			else if (hovered) element.src = hover();
			else element.src = normal();
		};
		this.variantChangeListeners.set(element, onVariantChange);

		this.setButtonVariant(element, 0); // This will also set the button's default image
	}

	setupButton(element: HTMLImageElement, path: string, onclick: (ev?: MouseEvent) => any, loadDisabledImage?: boolean, triggerOnMouseDown?: boolean, playHoverSound?: boolean) {
		this.setupVaryingButton(element, [path], onclick, loadDisabledImage, triggerOnMouseDown, playHoverSound);
	}

	setButtonVariant(element: HTMLImageElement, index: number) {
		this.activeButtonVariant.set(element, index);
		this.variantChangeListeners.get(element)();
	}

	show() {
		AudioManager.setAssetPath(this.audioAssetPath);
		this.menuDiv.classList.remove('hidden');
		this.music = AudioManager.createAudioSource(this.menuMusicSrc, AudioManager.musicGain);
		this.music.setLoop(true);
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
		await Promise.all([this.home.init(), this.levelSelect.init(), this.finishScreen.init(), this.optionsScreen.init(), this.helpScreen.init()]);
		this.home.show();
	}
}