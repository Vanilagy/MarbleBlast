import { AudioManager, AudioSource } from "../audio";
import { currentMousePosition } from "../input";
import { state } from "../state";
import { StorageData, StorageManager } from "../storage";
import { Util } from "../util";
import { buttonToDisplayNameMbg, buttonToDisplayNameMbp, OptionsScreen } from "./options";

const SLIDER_KNOB_LEFT = 217;
const SLIDER_KNOB_RIGHT = 344;

export class MbpOptionsScreen extends OptionsScreen {
	applyButton = document.querySelector('#mbp-options-apply') as HTMLImageElement;
	generalButton = document.querySelector('#mbp-options-general') as HTMLImageElement;
	hotkeysButton = document.querySelector('#mbp-options-hotkeys') as HTMLImageElement;
	generalContainer = document.querySelector('#mbp-options-general-container') as HTMLDivElement;
	hotkeysContainer = document.querySelector('#mbp-options-hotkeys-container') as HTMLDivElement;

	/** Array of functions that cause each option element to be refreshed. */
	updateFuncs: (() => void)[] = [];
	currentSliderElement: HTMLDivElement;
	currentSliderCallback: (completion: number) => any;
	soundTestingSound: AudioSource;

	rebindConfirmWarningEnding = `Do you want to undo this mapping?`; // Removed <br>

	initProperties() {
		this.div = document.querySelector('#mbp-options') as HTMLDivElement;

		this.homeButton = document.querySelector('#mbp-options-home');
		this.rebindDialog = document.querySelector('#mbp-rebind-dialog') as HTMLDivElement;
		this.rebindConfirm = document.querySelector('#mbp-rebind-confirm') as HTMLDivElement;
		this.rebindConfirmYes = document.querySelector('#mbp-rebind-confirm-yes') as HTMLImageElement;
		this.rebindConfirmNo = document.querySelector('#mbp-rebind-confirm-no') as HTMLImageElement;

		this.homeButtonSrc = 'options/home';
		this.rebindConfirmYesSrc = 'exit/yes';
		this.rebindConfirmNoSrc = 'exit/no';
	}

	async init() {
		this.menu.setupButton(this.applyButton, 'options/apply', () => {}, undefined, undefined, false); // no-op
		this.menu.setupButton(this.generalButton, 'options/general', () => {
			this.generalContainer.classList.remove('hidden')
			this.hotkeysContainer.classList.add('hidden');

			// Lock the one button in place
			this.generalButton.src = this.generalButton.src.slice(0, -5) + 'd.png';
			this.generalButton.setAttribute('data-locked', '');
			this.hotkeysButton.src = this.hotkeysButton.src.slice(0, -5) + 'n.png';
			this.hotkeysButton.removeAttribute('data-locked');
		}, undefined, undefined, false);
		this.menu.setupButton(this.hotkeysButton, 'options/hotkeys', () => {
			this.generalContainer.classList.add('hidden')
			this.hotkeysContainer.classList.remove('hidden');

			// Lock the one button in place
			this.hotkeysButton.src = this.hotkeysButton.src.slice(0, -5) + 'd.png';
			this.hotkeysButton.setAttribute('data-locked', '');
			this.generalButton.src = this.generalButton.src.slice(0, -5) + 'n.png';
			this.generalButton.removeAttribute('data-locked');
		}, undefined, undefined, false);
		this.generalButton.click();

		this.updateSliders();
		window.addEventListener('mouseup', () => {
			if (this.currentSliderElement) StorageManager.store();
			else return;

			this.currentSliderElement = null;
			this.soundTestingSound?.stop();
			this.soundTestingSound = null;
		});

		// Add all the option elements

		// These here are commented out because, really, they're all no-ops.
		//this.addDropdown(this.generalContainer, 'resolution', 'Screen Resolution', ['640x480', '800x600', '1024x768']);
		//this.addDropdown(this.generalContainer, 'videoDriver', 'Video Driver', ['OpenGL', 'Direct3D']);
		//this.addDropdown(this.generalContainer, 'screenStyle', 'Screen Style', ['Windowed', 'Full']);
		//this.addDropdown(this.generalContainer, 'shadows', 'Shadows', ['Disabled', 'Enabled'], true);
		//this.addDropdown(this.generalContainer, 'colorDepth', 'Color Depth', ['16 Bit', '32 Bit']);
		this.addDropdown(this.generalContainer, 'showFrameRate', 'Frame Rate', ['Hidden', 'Visible'], true);
		this.addDropdown(this.generalContainer, 'alwaysFreeLook', 'Free-Look', ['Disabled', 'Enabled'], true);
		this.addDropdown(this.generalContainer, 'invertMouse', 'Invert Mouse', ['None', 'X Only', 'Y only', 'X and Y']);
		this.addDropdown(this.generalContainer, 'showThousandths', 'Thousandths', ['Disabled', 'Enabled'], true);
		this.addMarbleTexturePicker(this.generalContainer);
		this.addDropdown(this.generalContainer, 'marbleReflectivity', 'Reflective Marble', ['Contextual', 'Disabled', 'Enabled']);
		this.addSlider(this.generalContainer, 'musicVolume', 'Music Volume', 0, 1, () => AudioManager.updateVolumes(), undefined, undefined, x => Math.ceil(x * 100).toString());
		this.addSlider(this.generalContainer, 'mouseSensitivity', 'Mouse Speed', 0, 1);
		this.addSlider(this.generalContainer, 'soundVolume', 'Sound Volume', 0, 1, () => AudioManager.updateVolumes(), () => {
			if (!this.soundTestingSound) {
				// Play this STUPID honk sound or whatever
				this.soundTestingSound = AudioManager.createAudioSource('testing.wav');
				this.soundTestingSound.setLoop(true);
				this.soundTestingSound.play();
			}
		}, undefined, x => Math.ceil(x * 100).toString());
		this.addSlider(this.generalContainer, 'keyboardSensitivity', 'Keyboard Speed', 0, 1);
		this.addSlider(this.generalContainer, 'fov', 'Field of View', 30, 120, undefined, undefined, 1, x => x.toString());

		this.addHotkey(this.hotkeysContainer, 'up');
		this.addHotkey(this.hotkeysContainer, 'left');
		this.addHotkey(this.hotkeysContainer, 'down');
		this.addHotkey(this.hotkeysContainer, 'right');
		this.addHotkey(this.hotkeysContainer, 'cameraUp');
		this.addHotkey(this.hotkeysContainer, 'cameraLeft');
		this.addHotkey(this.hotkeysContainer, 'cameraDown');
		this.addHotkey(this.hotkeysContainer, 'cameraRight');
		this.addHotkey(this.hotkeysContainer, 'jump');
		this.addHotkey(this.hotkeysContainer, 'use');
		this.addHotkey(this.hotkeysContainer, 'freeLook');
		this.addHotkey(this.hotkeysContainer, 'restart');
		this.addHotkey(this.hotkeysContainer, 'blast');
	}

	/** Handles dragging of the currently active slider. */
	updateSliders() {
		requestAnimationFrame(() => this.updateSliders());
		if (!this.currentSliderElement) return;

		let box = this.currentSliderElement.getBoundingClientRect();
		let leftOffset = currentMousePosition.x - box.left - SLIDER_KNOB_LEFT;
		let completion = Util.clamp(leftOffset / (SLIDER_KNOB_RIGHT - SLIDER_KNOB_LEFT), 0, 1);
		this.currentSliderCallback(completion);
	}

	/** Adds a dropdown element for a given option. */
	addDropdown(container: HTMLDivElement, setting: keyof StorageData['settings'], label: string, choices: string[], boolean = false) {
		const close = () => {
			// Hide the dropdown
			clickPreventer.classList.add('hidden');
			dropdownBackground.classList.add('hidden');
			optionsContainer.classList.add('hidden');
			button.style.zIndex = '';
			selectionLabel.style.zIndex = '';
		};

		let element = document.createElement('div');
		element.classList.add('mbp-options-element', '_dropdown');

		let p = document.createElement('p');
		p.textContent = label + ':';

		let button = document.createElement('img');
		this.menu.setupButton(button, 'options/dropdown', () => {
			if (clickPreventer.classList.contains('hidden')) {
				// Show the dropdown
				clickPreventer.classList.remove('hidden');
				dropdownBackground.classList.remove('hidden');
				optionsContainer.classList.remove('hidden');
				button.style.zIndex = '2';
				selectionLabel.style.zIndex = '2';
			} else {
				close();
			}
		});

		let selectionLabel = document.createElement('p');

		// Element that prevents anything else from being pressed while the dropdown is shown
		let clickPreventer = document.createElement('div');
		clickPreventer.classList.add('hidden');
		clickPreventer.addEventListener('click', () => close());

		let dropdownBackground = document.createElement('img');
		dropdownBackground.classList.add('hidden');
		dropdownBackground.src = './assets/ui_mbp/options/dropdown-' + ['small', 'medium', 'large', 'xlarge'][Math.min(3, choices.length-2)] + '.png'; // Choose the size dynamically based on the amount of choices

		let optionsContainer = document.createElement('div');
		optionsContainer.classList.add('hidden');

		for (let option of choices) {
			let elem = document.createElement('div');
			elem.textContent = option;
			optionsContainer.appendChild(elem);

			elem.addEventListener('mousedown', () => {
				close();
				selectionLabel.textContent = option;
				StorageManager.data.settings[setting] = (boolean? Boolean(choices.indexOf(option)) : choices.indexOf(option)) as never; // TypeScript stupid and I'm lazy
				StorageManager.store();
			});
		}

		element.append(p, button, selectionLabel, clickPreventer, dropdownBackground, optionsContainer);
		container.appendChild(element);

		this.updateFuncs.push(() => selectionLabel.textContent = choices[Number(StorageManager.data.settings[setting])]);
	}

	/** Adds a slider element for a given option. */
	addSlider(container: HTMLDivElement, setting: keyof StorageData['settings'], label: string, min: number, max: number, onChange?: () => any, onDragStart?: () => any, step = 0, showValue?: (val: number) => string) {
		const updateThumb = () => {
			let completion = ((StorageManager.data.settings[setting] as number) - min) / (max - min);
			thumb.style.left = Math.floor(Util.lerp(SLIDER_KNOB_LEFT, SLIDER_KNOB_RIGHT, completion)) + 'px';
			if (showValue) valueElem.textContent = showValue(StorageManager.data.settings[setting] as number);
		};

		let element = document.createElement('div');
		element.classList.add('mbp-options-element', '_slider');

		let p = document.createElement('p');
		p.textContent = label + ':';

		let bar = document.createElement('img');
		bar.src = './assets/ui_mbp/options/bar.png';
		bar.addEventListener('mousedown', () => {
			this.currentSliderElement = element;
			this.currentSliderCallback = (completion: number) => {
				StorageManager.data.settings[setting] = Util.roundToMultiple(Util.lerp(min, max, completion), step) as never;
				updateThumb();
				onChange?.();
			};
			onDragStart?.();
		});

		let thumb = document.createElement('img');
		thumb.src = './assets/ui_mbp/options/slider.png';

		let valueElem = document.createElement('p');

		element.append(p, bar, thumb);
		if (showValue) element.append(valueElem);
		container.appendChild(element);

		this.updateFuncs.push(updateThumb);
	}

	/** Adds a hotkey rebind element for a given key. */
	addHotkey(container: HTMLDivElement, key: keyof StorageData['settings']['gameButtonMapping']) {
		let element = document.createElement('div');
		element.classList.add('mbp-options-element', '_hotkey');

		let p = document.createElement('p');
		let map = (state.modification === 'gold')? buttonToDisplayNameMbg : buttonToDisplayNameMbp;
		p.textContent = map[key] + ':';

		let button = document.createElement('img');
		this.menu.setupButton(button, 'options/bind', () => {
			this.changeKeybinding(key);
		});

		let bindingLabel = document.createElement('p');

		element.append(p, button, bindingLabel);
		container.appendChild(element);

		this.updateFuncs.push(() => bindingLabel.textContent = this.formatKeybinding(key));
	}

	/** Adds a configurable button element. */
	addButton(container: HTMLDivElement, label: string, buttonLabel: string, onClick: () => any) {
		let element = document.createElement('div');
		element.classList.add('mbp-options-element', '_button');

		let p = document.createElement('p');
		p.textContent = label + ':';

		let button = document.createElement('img');
		this.menu.setupButton(button, 'options/bind', () => onClick());

		let buttonLabelP = document.createElement('p');
		buttonLabelP.textContent = buttonLabel;

		element.append(p, button, buttonLabelP);
		container.appendChild(element);

		return element;
	}

	addMarbleTexturePicker(container: HTMLDivElement) {
		let element = this.addButton(container, 'Marble Texture', 'Select File', async () => {
			await this.showMarbleTexturePicker();
			resetButton.classList.remove('hidden');
		});

		// Add an additional button that removes the texture again
		let resetButton = document.createElement('img');
		resetButton.src = './assets/ui_mbp/mp/team/nomarble.png';
		resetButton.id = 'mbp-reset-marble-texture-button';
		resetButton.title = "Clear texture";
		resetButton.classList.add('hidden');
		resetButton.addEventListener('click', () => {
			StorageManager.databaseDelete('keyvalue', 'marbleTexture');
			resetButton.classList.add('hidden');
		});

		element.appendChild(resetButton);

		this.updateFuncs.push(async () => {
			if ((await StorageManager.databaseCount('keyvalue', 'marbleTexture')) === 0) {
				resetButton.classList.add('hidden');
			} else {
				resetButton.classList.remove('hidden');
			}
		});
	}

	refreshKeybindings() {
		this.updateAllElements(); // Can't hurt lol
	}

	updateAllElements() {
		for (let func of this.updateFuncs) func();
	}

	show() {
		super.show();
		this.updateAllElements();
	}
}