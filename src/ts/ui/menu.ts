import { AudioManager, AudioSource } from "../audio";
import { currentMousePosition } from "../input";
import { SCALING_RATIO } from "../rendering";
import { ResourceManager } from "../resources";
import { state } from "../state";
import { Util } from "../util";
import { FinishScreen } from "./finish_screen";
import { HelpScreen } from "./help";
import { HomeScreen } from "./home";
import { Hud } from "./hud";
import { LevelSelect } from "./level_select";
import { LoadingScreen } from "./loading";
import { setEnterFullscreenButtonVisibility } from "./misc";
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
	popupContainer = document.querySelector('#popup-container') as HTMLDivElement;

	activeButtonVariant = new Map<HTMLImageElement, number>();
	variantChangeListeners = new Map<HTMLImageElement, Function>();

	abstract get uiAssetPath(): string;
	abstract audioAssetPath: string;
	abstract menuMusicSrc: string;
	abstract popupBackgroundSrc: string;
	abstract popupOkaySrc: string;
	abstract popupNoSrc: string;
	abstract popupYesSrc: string;

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

	/** Sets up a Torque GUI button element which can take on different variants and switch between them quickly. */
	setupVaryingButton(element: HTMLImageElement, paths: string[], onclick: (ev?: MouseEvent) => any, loadDisabledImage = false, triggerOnMouseDown = false, playHoverSound = true) {
		let ogPaths = paths.slice();
		paths = paths.map(x => this.uiAssetPath + x);
		let held = false;
		let hovered = false;

		const normal = () => paths[this.activeButtonVariant.get(element)] + '_n.png';
		const hover = () => paths[this.activeButtonVariant.get(element)] + '_h.png';
		const down = () => paths[this.activeButtonVariant.get(element)] + '_d.png';
		const disabled = () => paths[this.activeButtonVariant.get(element)] + '_i.png';

		/** Returns true iff the mouse is currently in the bounding box of this button. */
		const touchInAabb = () => {
			let radius = 10; // Reasonable guesstimate
			let x = currentMousePosition.x / SCALING_RATIO;
			let y = currentMousePosition.y / SCALING_RATIO;
			let rect = element.getBoundingClientRect();

			return x >= rect.x - radius && x < rect.x + rect.width + radius && y >= rect.y - radius && y < rect.y + rect.height + radius;
		};
		
		element.addEventListener('mouseenter', () => {
			if (Util.isTouchDevice) return;
			hovered = true;
			element.setAttribute('data-hovered', '');
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = held? down() : hover();
			if (!held && playHoverSound) AudioManager.play('buttonover.wav');
		});
		element.addEventListener('mouseleave', () => {
			if (Util.isTouchDevice) return;
			hovered = false;
			element.removeAttribute('data-hovered');
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = normal();		
		});
		element.addEventListener('touchmove', () => {
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = touchInAabb()? down() : normal();
		});

		const onMouseDown = (e: MouseEvent) => {
			if (element.style.pointerEvents === 'none') return;
			if (e.button !== 0) return;
			held = true;
			if (!element.hasAttribute('data-locked')) element.src = down();
			AudioManager.play('buttonpress.wav');
			if (triggerOnMouseDown) onclick(e);

			window.addEventListener('mouseup', onMouseUp);
			window.addEventListener('touchend', onTouchEnd);
		};
		element.addEventListener('mousedown', (e) => {
			if (!Util.isTouchDevice) onMouseDown(e);
		});
		element.addEventListener('touchstart', () => {
			onMouseDown({button: 0} as MouseEvent);
		});

		const onMouseUp = () => {
			held = false;
			if (element.style.pointerEvents === 'none') return;
			if (!element.hasAttribute('data-locked')) element.src = hovered? hover() : normal();

			// Remove the listeners to increase performance
			window.removeEventListener('mouseup', onMouseUp);
			window.removeEventListener('touchend', onTouchEnd);
		};
		const onTouchEnd = (e: TouchEvent) => {
			if (held && !triggerOnMouseDown && touchInAabb()) {
				onclick(e as any);
			}

			onMouseUp();
		};

		if (!triggerOnMouseDown) element.addEventListener('click', (e) => {
			if (e.isTrusted && (Util.isTouchDevice && 'ontouchstart' in window)) return; // Do the extra check here to make sure people don't nuke themselves with options
			if (e.button === 0) onclick(e);
		});
	
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

	/** Sets up a Torque GUI button element. Adds listeners to show the correct _n, _d and _h variants and plays sounds. */
	setupButton(element: HTMLImageElement, path: string, onclick: (ev?: MouseEvent) => any, loadDisabledImage?: boolean, triggerOnMouseDown?: boolean, playHoverSound?: boolean) {
		this.setupVaryingButton(element, [path], onclick, loadDisabledImage, triggerOnMouseDown, playHoverSound);
	}

	/** Sets the active button variant for a given button. */
	setButtonVariant(element: HTMLImageElement, index: number) {
		this.activeButtonVariant.set(element, index);
		this.variantChangeListeners.get(element)();
	}

	show() {
		AudioManager.setAssetPath(this.audioAssetPath);
		this.menuDiv.classList.remove('hidden');
		setEnterFullscreenButtonVisibility(true);

		if (Util.isWeeb) {
			let before = AudioManager.assetPath;
			AudioManager.assetPath = ''; // Quick hack
			this.music = AudioManager.createAudioSource('./assets/music/renai.ogg', AudioManager.musicGain);
			AudioManager.assetPath = before;
		} else {
			this.music = AudioManager.createAudioSource(this.menuMusicSrc, AudioManager.musicGain);
		}
		this.music.setLoop(true);
		this.music.play();

		// These lines will just make the container visible forever after the page loading screen is passed
		this.popupContainer.style.visibility = 'visible';
		this.popupContainer.style.pointerEvents = 'auto';
	}

	hide() {
		this.menuDiv.classList.add('hidden');
		this.music?.stop();
		setEnterFullscreenButtonVisibility(false);
	}

	showGameUi() {
		this.gameUiDiv.classList.remove('hidden');
	}

	hideGameUi() {
		this.gameUiDiv.classList.add('hidden');
	}

	createAlertBase(heading: string, body: string, custom?: HTMLDivElement) {
		let div = document.createElement('div');
		div.classList.add('hidden');
		div.classList.add('popup');
		div.classList.add((state.modification === 'gold')? 'mbg' : 'mbp');

		let clickPreventer = document.createElement('div');

		let img = document.createElement('img');
		img.onload = () => {
			div.style.width = ((state.modification === 'gold')? 400 : img.width) + 'px';
			div.style.height = ((state.modification === 'gold')? 250 : img.height) + 'px';
			img.style.width = div.style.width;
			img.style.height = div.style.height;
			div.classList.remove('hidden');
		};
		img.src = this.popupBackgroundSrc;

		let headingElem = document.createElement('p');
		headingElem.classList.add('_heading');
		headingElem.innerHTML = heading;

		let bodyElem = document.createElement('p');
		bodyElem.classList.add('_body');
		bodyElem.innerHTML = body;

		div.append(clickPreventer, img, headingElem, bodyElem);
		if (custom) {
			custom.classList.add('_custom');
			// Timeout to let text get layouted (couldn't get it to work otherwise)
			setTimeout(() => {
				custom.style.top = 44 + bodyElem.clientHeight + 'px';
				div.append(custom);
			});
		}

		return div;
	}

	/** Shows a customizable alert pop-up on screen that the user can dismiss. */
	showAlertPopup(heading: string, body: string, custom?: HTMLDivElement) {
		return new Promise<void>(resolve => {
			let div = this.createAlertBase(heading, body, custom);

			let okayButton = document.createElement('img');
			okayButton.classList.add('_okay');
			this.setupButton(okayButton, this.popupOkaySrc, () => {
				this.popupContainer.removeChild(div);
				if (this.popupContainer.children.length === 0) this.popupContainer.style.display = 'none';
				window.removeEventListener('keydown', handler1);
				window.removeEventListener('keyup', handler2);

				resolve();
			});

			let handler1 = (e: KeyboardEvent) => {
				if (e.key === 'Escape') okayButton.src = this.uiAssetPath + this.popupOkaySrc + '_d.png';
			};
			let handler2 = (e: KeyboardEvent) => {
				if (e.key === 'Escape') okayButton.click();
			};
			window.addEventListener('keydown', handler1);
			window.addEventListener('keyup', handler2);
	
			div.append(okayButton);
	
			this.popupContainer.append(div);
			this.popupContainer.style.display = '';
		});	
	}

	/** Shows a customizable confirm (yes/no) pop-up on screen. */
	showConfirmPopup(heading: string, body: string, custom?: HTMLDivElement) {
		return new Promise<boolean>(resolve => {
			let div = this.createAlertBase(heading, body, custom);

			let noButton = document.createElement('img');
			noButton.classList.add('_no');
			this.setupButton(noButton, this.popupNoSrc, () => {
				this.popupContainer.removeChild(div);
				if (this.popupContainer.children.length === 0) this.popupContainer.style.display = 'none';
				window.removeEventListener('keydown', handler1);
				window.removeEventListener('keyup', handler2);

				resolve(false);
			});
	
			let yesButton = document.createElement('img');
			yesButton.classList.add('_yes');
			this.setupButton(yesButton, this.popupYesSrc, () => {
				this.popupContainer.removeChild(div);
				if (this.popupContainer.children.length === 0) this.popupContainer.style.display = 'none';
				window.removeEventListener('keydown', handler1);
				window.removeEventListener('keyup', handler2);

				resolve(true);
			});

			let handler1 = (e: KeyboardEvent) => {
				if (e.key === 'Escape') noButton.src = this.uiAssetPath + this.popupNoSrc + '_d.png';
			};
			let handler2 = (e: KeyboardEvent) => {
				if (e.key === 'Escape') noButton.click();
			};
			window.addEventListener('keydown', handler1);
			window.addEventListener('keyup', handler2);
	
			div.append(noButton, yesButton);
	
			this.popupContainer.append(div);
			this.popupContainer.style.display = '';
		});
	}

	async init() {
		AudioManager.setAssetPath(this.audioAssetPath);
		await AudioManager.loadBuffers([this.menuMusicSrc, 'buttonover.wav', 'buttonpress.wav']);
		await Promise.all([this.home.init(), this.levelSelect.init(), this.finishScreen.init(), this.optionsScreen.init(), this.helpScreen.init()]);

		// Load pop-up stuff:
		await ResourceManager.loadImages([this.popupBackgroundSrc]);
		let dummy = document.createElement('img');
		this.setupButton(dummy, this.popupOkaySrc, null);
		this.setupButton(dummy, this.popupNoSrc, null);
		this.setupButton(dummy, this.popupYesSrc, null);

		this.home.show();
	}
}