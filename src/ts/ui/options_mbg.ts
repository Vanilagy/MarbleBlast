import { AudioSource, mainAudioManager } from "../audio";
import { currentMousePosition } from "../input";
import { ResourceManager } from "../resources";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";
import { SCALING_RATIO } from "./misc";
import { OptionsScreen } from "./options";

export class MbgOptionsScreen extends OptionsScreen {
	tabGraphics: HTMLImageElement;
	tabAudio: HTMLImageElement;
	tabControls: HTMLImageElement;

	graphicsDiv: HTMLDivElement;
	audioDiv: HTMLDivElement;
	controlsDiv: HTMLDivElement;

	resolution640: HTMLImageElement;
	resolution800: HTMLImageElement;
	resolution1024: HTMLImageElement;

	openGl: HTMLImageElement;
	direct3D: HTMLImageElement;

	windowedButton: HTMLImageElement;
	fullButton: HTMLImageElement;

	depth16: HTMLImageElement;
	depth32: HTMLImageElement;

	shadowsCheckbox: HTMLImageElement;
	graphicsApply: HTMLImageElement;

	musicVolumeTrack: HTMLImageElement;
	musicVolumeKnob: HTMLImageElement;
	soundVolumeTrack: HTMLImageElement;
	soundVolumeKnob: HTMLImageElement;
	trackLength = 235; // The total draggable length of the slider
	musicVolumeKnobLeft = 155; // The left-most position of the knob
	soundVolumeKnobLeft = 157;
	mouseSensitivityKnobLeft = 148;
	draggingMusicVolume = false;
	draggingSoundVolume = false;
	draggingMouseSensitivity = false;
	soundTestingSound: AudioSource = null;

	controlsBackground: HTMLImageElement;
	marbleTab: HTMLImageElement; // it's not
	cameraTab: HTMLImageElement;
	mouseTab: HTMLImageElement;
	marbleControlsDiv: HTMLDivElement;
	cameraControlsDiv: HTMLDivElement;
	mouseControlsDiv: HTMLDivElement;

	buttonMarbleLeft: HTMLImageElement;
	buttonMarbleRight:  HTMLImageElement;
	buttonMarbleUp: HTMLImageElement;
	buttonMarbleDown: HTMLImageElement;
	buttonMarbleUse: HTMLImageElement;
	buttonMarbleJump: HTMLImageElement;

	buttonMarbleLeftContent: HTMLParagraphElement;
	buttonMarbleRightContent: HTMLParagraphElement;
	buttonMarbleUpContent: HTMLParagraphElement;
	buttonMarbleDownContent: HTMLParagraphElement;
	buttonMarbleUseContent: HTMLParagraphElement;
	buttonMarbleJumpContent: HTMLParagraphElement;

	buttonCameraLeft: HTMLImageElement;
	buttonCameraRight: HTMLImageElement;
	buttonCameraUp: HTMLImageElement;
	buttonCameraDown: HTMLImageElement;

	buttonCameraLeftContent: HTMLParagraphElement;
	buttonCameraRightContent: HTMLParagraphElement;
	buttonCameraUpContent: HTMLParagraphElement;
	buttonCameraDownContent: HTMLParagraphElement;

	mouseSensitivityKnob: HTMLImageElement;

	invertY: HTMLImageElement;
	alwaysFreeLook: HTMLImageElement;
	freeLookKey: HTMLImageElement;
	freeLookKeyContent: HTMLParagraphElement;

	chooseMarbleTexture: HTMLImageElement;
	resetMarbleTexture: HTMLImageElement;

	buttonRestartLevel: HTMLImageElement;
	buttonRestartLevelContent: HTMLParagraphElement;
	reflectiveMarbleCheckbox: HTMLImageElement;

	initProperties() {
		this.div = document.querySelector('#options');
		this.homeButton = document.querySelector('#options-home') as HTMLImageElement;
		this.rebindDialog = document.querySelector('#rebind-dialog') as HTMLDivElement;
		this.rebindConfirm = document.querySelector('#rebind-confirm') as HTMLDivElement;
		this.rebindConfirmYes = document.querySelector('#rebind-confirm-yes') as HTMLImageElement;
		this.rebindConfirmNo = document.querySelector('#rebind-confirm-no') as HTMLImageElement;

		this.homeButtonSrc = 'options/mainm';
		this.rebindConfirmYesSrc = 'common/yes';
		this.rebindConfirmNoSrc = 'common/no';

		this.tabGraphics = document.querySelector('#tab-graphics') as HTMLImageElement;
		this.tabAudio = document.querySelector('#tab-audio') as HTMLImageElement;
		this.tabControls = document.querySelector('#tab-controls') as HTMLImageElement;

		this.graphicsDiv = document.querySelector('#options-graphics') as HTMLDivElement;
		this.audioDiv = document.querySelector('#options-audio') as HTMLDivElement;
		this.controlsDiv = document.querySelector('#options-controls') as HTMLDivElement;

		this.resolution640 = document.querySelector('#graphics-640') as HTMLImageElement;
		this.resolution800 = document.querySelector('#graphics-800') as HTMLImageElement;
		this.resolution1024 = document.querySelector('#graphics-1024') as HTMLImageElement;

		this.openGl = document.querySelector('#graphics-opengl') as HTMLImageElement;
		this.direct3D = document.querySelector('#graphics-direct3d') as HTMLImageElement;

		this.windowedButton = document.querySelector('#graphics-windowed') as HTMLImageElement;
		this.fullButton = document.querySelector('#graphics-full') as HTMLImageElement;

		this.depth16 = document.querySelector('#graphics-depth16') as HTMLImageElement;
		this.depth32 = document.querySelector('#graphics-depth32') as HTMLImageElement;

		this.shadowsCheckbox = document.querySelector('#graphics-shadows') as HTMLImageElement;
		this.graphicsApply = document.querySelector('#graphics-apply') as HTMLImageElement;

		this.musicVolumeTrack = document.querySelector('#audio-music-track') as HTMLImageElement;
		this.musicVolumeKnob = document.querySelector('#audio-music-knob') as HTMLImageElement;
		this.soundVolumeTrack = document.querySelector('#audio-sound-track') as HTMLImageElement;
		this.soundVolumeKnob = document.querySelector('#audio-sound-knob') as HTMLImageElement;

		this.controlsBackground = document.querySelector('#controls-background') as HTMLImageElement;
		this.marbleTab = document.querySelector('#tab-marble') as HTMLImageElement; // it's not
		this.cameraTab = document.querySelector('#tab-camera') as HTMLImageElement;
		this.mouseTab = document.querySelector('#tab-mouse') as HTMLImageElement;
		this.marbleControlsDiv = document.querySelector('#controls-marble') as HTMLDivElement;
		this.cameraControlsDiv = document.querySelector('#controls-camera') as HTMLDivElement;
		this.mouseControlsDiv = document.querySelector('#controls-mouse') as HTMLDivElement;

		this.buttonMarbleLeft = document.querySelector('#button-marble-left') as HTMLImageElement;
		this.buttonMarbleRight = document.querySelector('#button-marble-right') as HTMLImageElement;
		this.buttonMarbleUp = document.querySelector('#button-marble-up') as HTMLImageElement;
		this.buttonMarbleDown = document.querySelector('#button-marble-down') as HTMLImageElement;
		this.buttonMarbleUse = document.querySelector('#button-marble-use') as HTMLImageElement;
		this.buttonMarbleJump = document.querySelector('#button-marble-jump') as HTMLImageElement;

		this.buttonMarbleLeftContent = document.querySelector('#button-marble-left-content') as HTMLParagraphElement;
		this.buttonMarbleRightContent = document.querySelector('#button-marble-right-content') as HTMLParagraphElement;
		this.buttonMarbleUpContent = document.querySelector('#button-marble-up-content') as HTMLParagraphElement;
		this.buttonMarbleDownContent = document.querySelector('#button-marble-down-content') as HTMLParagraphElement;
		this.buttonMarbleUseContent = document.querySelector('#button-marble-use-content') as HTMLParagraphElement;
		this.buttonMarbleJumpContent = document.querySelector('#button-marble-jump-content') as HTMLParagraphElement;

		this.buttonCameraLeft = document.querySelector('#button-camera-left') as HTMLImageElement;
		this.buttonCameraRight = document.querySelector('#button-camera-right') as HTMLImageElement;
		this.buttonCameraUp = document.querySelector('#button-camera-up') as HTMLImageElement;
		this.buttonCameraDown = document.querySelector('#button-camera-down') as HTMLImageElement;

		this.buttonCameraLeftContent = document.querySelector('#button-camera-left-content') as HTMLParagraphElement;
		this.buttonCameraRightContent = document.querySelector('#button-camera-right-content') as HTMLParagraphElement;
		this.buttonCameraUpContent = document.querySelector('#button-camera-up-content') as HTMLParagraphElement;
		this.buttonCameraDownContent = document.querySelector('#button-camera-down-content') as HTMLParagraphElement;

		this.mouseSensitivityKnob = document.querySelector('#sensitivity-knob') as HTMLImageElement;

		this.invertY = document.querySelector('#invert-y') as HTMLImageElement;
		this.alwaysFreeLook = document.querySelector('#always-free-look') as HTMLImageElement;

		this.freeLookKey = document.querySelector('#free-look-key') as HTMLImageElement;
		this.freeLookKeyContent = document.querySelector('#free-look-key-content') as HTMLParagraphElement;

		this.chooseMarbleTexture = document.querySelector('#graphics-marble-texture-choose') as HTMLImageElement;
		this.resetMarbleTexture = document.querySelector('#graphics-marble-texture-reset') as HTMLImageElement;

		this.buttonRestartLevel = document.querySelector('#button-restart-level') as HTMLImageElement;
		this.buttonRestartLevelContent = document.querySelector('#button-restart-level-content') as HTMLParagraphElement;
		this.reflectiveMarbleCheckbox = document.querySelector('#graphics-reflective-marble') as HTMLImageElement;
	}

	constructor(menu: Menu) {
		super(menu);

		menu.setupButton(this.resolution640, 'options/graf640', () => this.selectResolutionButton(this.resolution640, 0));
		menu.setupButton(this.resolution800, 'options/graf800', () => this.selectResolutionButton(this.resolution800, 1));
		menu.setupButton(this.resolution1024, 'options/graf1024', () => this.selectResolutionButton(this.resolution1024, 2));

		menu.setupButton(this.openGl, 'options/grafopgl', () => this.selectVideoDriverButton(this.openGl, 0));
		menu.setupButton(this.direct3D, 'options/grafdir3d', () => this.selectVideoDriverButton(this.direct3D, 1));

		menu.setupButton(this.windowedButton, 'options/grafwindo', () => this.selectScreenStyleButton(this.windowedButton, 0));
		menu.setupButton(this.fullButton, 'options/grafful', () => this.selectScreenStyleButton(this.fullButton, 1));

		menu.setupButton(this.depth16, 'options/graf16bt', () => this.selectColorDepthButton(this.depth16, 0));
		menu.setupButton(this.depth32, 'options/graf32bt', () => this.selectColorDepthButton(this.depth32, 1));

		menu.setupButton(this.shadowsCheckbox, 'options/graf_chkbx', () => {
			StorageManager.data.settings.shadows = !this.shadowsCheckbox.hasAttribute('data-locked');
			StorageManager.store();

			// Toggle the checkbox
			if (!this.shadowsCheckbox.hasAttribute('data-locked')) {
				this.shadowsCheckbox.setAttribute('data-locked', '');
				this.shadowsCheckbox.src = './assets/ui/options/graf_chkbx_d.png';
			} else {
				this.shadowsCheckbox.removeAttribute('data-locked');
				this.shadowsCheckbox.src = './assets/ui/options/graf_chkbx_h.png';
			}
		});
		menu.setupButton(this.graphicsApply, 'options/grafapply', () => {});

		const handler = () => {
			if (!this.draggingMusicVolume && !this.draggingSoundVolume && !this.draggingMouseSensitivity) return;

			// Release all dragging things
			this.draggingMusicVolume = this.draggingSoundVolume = this.draggingMouseSensitivity = false;
			StorageManager.store();

			if (this.soundTestingSound) {
				// Stop the sound
				this.soundTestingSound.stop();
				this.soundTestingSound = null;
			}
		};
		window.addEventListener('mouseup', handler);
		window.addEventListener('touchend', handler);
		this.musicVolumeTrack.addEventListener('mousedown', () => this.draggingMusicVolume = true);
		this.musicVolumeTrack.addEventListener('touchstart', () => this.draggingMusicVolume = true);
		this.musicVolumeKnob.addEventListener('mousedown', () => this.draggingMusicVolume = true);
		this.musicVolumeKnob.addEventListener('touchstart', () => this.draggingMusicVolume = true);
		this.soundVolumeTrack.addEventListener('mousedown', () => this.draggingSoundVolume = true);
		this.soundVolumeTrack.addEventListener('touchstart', () => this.draggingSoundVolume = true);
		this.soundVolumeKnob.addEventListener('mousedown', () => this.draggingSoundVolume = true);
		this.soundVolumeKnob.addEventListener('touchstart', () => this.draggingSoundVolume = true);

		requestAnimationFrame(() => this.updateSliders());

		menu.setupButton(this.marbleTab, '', () => this.selectControlsTab('marble'));
		menu.setupButton(this.cameraTab, '', () => this.selectControlsTab('camera'));
		menu.setupButton(this.mouseTab, '', () => this.selectControlsTab('mouse'));

		menu.setupButton(this.buttonMarbleLeft, 'options/cntr_mrb_lft', () => this.changeKeybinding('left'));
		menu.setupButton(this.buttonMarbleRight, 'options/cntr_mrb_rt', () => this.changeKeybinding('right'));
		menu.setupButton(this.buttonMarbleUp, 'options/cntr_mrb_fw', () => this.changeKeybinding('up'));
		menu.setupButton(this.buttonMarbleDown, 'options/cntr_mrb_bak', () => this.changeKeybinding('down'));
		menu.setupButton(this.buttonMarbleUse, 'options/cntr_mrb_pwr', () => this.changeKeybinding('use'));
		menu.setupButton(this.buttonMarbleJump, 'options/cntr_mrb_jmp', () => this.changeKeybinding('jump'));

		menu.setupButton(this.buttonCameraLeft, 'options/cntr_cam_lft', () => this.changeKeybinding('cameraLeft'));
		menu.setupButton(this.buttonCameraRight, 'options/cntr_cam_rt', () => this.changeKeybinding('cameraRight'));
		menu.setupButton(this.buttonCameraUp, 'options/cntr_cam_up', () => this.changeKeybinding('cameraUp'));
		menu.setupButton(this.buttonCameraDown, 'options/cntr_cam_dwn', () => this.changeKeybinding('cameraDown'));

		this.mouseSensitivityKnob.addEventListener('mousedown', () => this.draggingMouseSensitivity = true);
		this.mouseSensitivityKnob.addEventListener('touchstart', () => this.draggingMouseSensitivity = true);

		menu.setupButton(this.invertY, 'options/cntrl_mous_invrt', () => {
			StorageManager.data.settings.invertMouse &= ~0b10;
			StorageManager.data.settings.invertMouse |= Number(!this.invertY.hasAttribute('data-locked')) << 1;
			StorageManager.store();

			// Toggle the checkbox
			if (!this.invertY.hasAttribute('data-locked')) {
				this.invertY.setAttribute('data-locked', '');
				this.invertY.src = './assets/ui/options/cntrl_mous_invrt_d.png';
			} else {
				this.invertY.removeAttribute('data-locked');
				this.invertY.src = './assets/ui/options/cntrl_mous_invrt_h.png';
			}
		});
		menu.setupButton(this.alwaysFreeLook, 'options/cntrl_mous_freel', () => {
			StorageManager.data.settings.alwaysFreeLook = !this.alwaysFreeLook.hasAttribute('data-locked');
			StorageManager.store();

			// Toggle the checkbox
			if (!this.alwaysFreeLook.hasAttribute('data-locked')) {
				this.alwaysFreeLook.setAttribute('data-locked', '');
				this.alwaysFreeLook.src = './assets/ui/options/cntrl_mous_freel_d.png';
			} else {
				this.alwaysFreeLook.removeAttribute('data-locked');
				this.alwaysFreeLook.src = './assets/ui/options/cntrl_mous_freel_h.png';
			}
		});

		menu.setupButton(this.freeLookKey, 'options/cntrl_mous_bttn', () => this.changeKeybinding('freeLook'));

		menu.setupButton(this.chooseMarbleTexture, 'options/cntr_cam_up', async () => {
			await this.showMarbleTexturePicker();
			this.setResetMarbleTextureState(true);
		});
		menu.setupButton(this.resetMarbleTexture, 'options/cntr_cam_dwn', () => {
			StorageManager.databaseDelete('keyvalue', 'marbleTexture');
			this.setResetMarbleTextureState(false);
		});

		menu.setupButton(this.buttonRestartLevel, 'options/cntr_cam_dwn', () => this.changeKeybinding('restart'));

		menu.setupButton(this.reflectiveMarbleCheckbox, 'options/cntrl_mous_freel', () => {
			StorageManager.data.settings.marbleReflectivity = (!this.reflectiveMarbleCheckbox.hasAttribute('data-locked'))? 2 : 0;
			StorageManager.store();

			// Toggle the checkbox
			if (!this.reflectiveMarbleCheckbox.hasAttribute('data-locked')) {
				this.reflectiveMarbleCheckbox.setAttribute('data-locked', '');
				this.reflectiveMarbleCheckbox.src = './assets/ui/options/cntrl_mous_freel_d.png';
			} else {
				this.reflectiveMarbleCheckbox.removeAttribute('data-locked');
				this.reflectiveMarbleCheckbox.src = './assets/ui/options/cntrl_mous_freel_h.png';
			}
		});
	}

	show() {
		super.show();
		this.updateAllElements();
	}

	async init() {
		super.init();

		this.setupTab(this.tabGraphics, 'graphics');
		this.setupTab(this.tabAudio, 'audio');
		this.setupTab(this.tabControls, 'controls');
		// Default selection
		this.selectControlsTab('marble');
		this.selectTab('graphics');

		await ResourceManager.loadImages(['cntrl_marb_bse.png', 'cntrl_cam_bse.png', 'cntrl_mous_base.png'].map(x => './assets/ui/options/' + x));

		await this.updateAllElements();
	}

	async updateAllElements() {
		this.selectResolutionButton([this.resolution640, this.resolution800, this.resolution1024][StorageManager.data.settings.resolution], StorageManager.data.settings.resolution);
		this.selectVideoDriverButton([this.openGl, this.direct3D][StorageManager.data.settings.videoDriver], StorageManager.data.settings.videoDriver);
		this.selectScreenStyleButton([this.windowedButton, this.fullButton][StorageManager.data.settings.screenStyle], StorageManager.data.settings.videoDriver);
		this.selectColorDepthButton([this.depth16, this.depth32][StorageManager.data.settings.colorDepth], StorageManager.data.settings.colorDepth);

		this.musicVolumeKnob.style.left = Math.floor(this.musicVolumeKnobLeft + StorageManager.data.settings.musicVolume * this.trackLength) + 'px';
		this.soundVolumeKnob.style.left = Math.floor(this.soundVolumeKnobLeft + StorageManager.data.settings.soundVolume * this.trackLength) + 'px';
		this.mouseSensitivityKnob.style.left = Math.floor(this.mouseSensitivityKnobLeft + StorageManager.data.settings.mouseSensitivity * this.trackLength) + 'px';

		this.refreshKeybindings();

		if (!!(StorageManager.data.settings.invertMouse & 0b10) !== this.invertY.hasAttribute('data-locked')) this.invertY.click();
		if (StorageManager.data.settings.alwaysFreeLook !== this.alwaysFreeLook.hasAttribute('data-locked')) this.alwaysFreeLook.click();
		if ((StorageManager.data.settings.marbleReflectivity === 2) !== this.reflectiveMarbleCheckbox.hasAttribute('data-locked')) this.reflectiveMarbleCheckbox.click();

		this.setResetMarbleTextureState(!((await StorageManager.databaseCount('keyvalue', 'marbleTexture')) === 0));
	}

	selectTab(which: 'graphics' | 'audio' | 'controls') {
		for (let elem of [this.tabGraphics, this.tabAudio, this.tabControls]) {
			elem.style.zIndex = "-1";
		}
		for (let elem of [this.graphicsDiv, this.audioDiv, this.controlsDiv]) {
			elem.classList.add('hidden');
		}

		let index = ['graphics', 'audio', 'controls'].indexOf(which);

		let elem = [this.tabGraphics, this.tabAudio, this.tabControls][index];
		elem.style.zIndex = "0";
		[this.graphicsDiv, this.audioDiv, this.controlsDiv][index].classList.remove('hidden');
	}

	setupTab(element: HTMLImageElement, which: 'graphics' | 'audio' | 'controls') {
		element.addEventListener('mousedown', (e) => {
			if (e.button !== 0) return;
			mainAudioManager.play('buttonpress.wav');
		});
		element.addEventListener('click', (e) => e.button === 0 && this.selectTab(which));
	}

	selectResolutionButton(button: HTMLImageElement, index: number) {
		this.unlockResolutionButtons();
		button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
		button.setAttribute('data-locked', '');
		StorageManager.data.settings.resolution = index;
		StorageManager.store();
	}

	unlockResolutionButtons() {
		// Deselect all resolution buttons
		this.resolution640.src = './assets/ui/options/graf640_n.png';
		this.resolution640.removeAttribute('data-locked');
		this.resolution800.src = './assets/ui/options/graf800_n.png';
		this.resolution800.removeAttribute('data-locked');
		this.resolution1024.src = './assets/ui/options/graf1024_n.png';
		this.resolution1024.removeAttribute('data-locked');
	}

	selectVideoDriverButton(button: HTMLImageElement, index: number) {
		this.unlockVideoDriverButtons();
		button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
		button.setAttribute('data-locked', '');
		StorageManager.data.settings.videoDriver = index;
		StorageManager.store();
	}

	unlockVideoDriverButtons() {
		// Deselect all video driver buttons
		this.openGl.src = './assets/ui/options/grafopgl_n.png';
		this.openGl.removeAttribute('data-locked');
		this.direct3D.src = './assets/ui/options/grafdir3d_n.png';
		this.direct3D.removeAttribute('data-locked');
	}

	selectScreenStyleButton(button: HTMLImageElement, index: number) {
		this.unlockScreenStyleButtons();
		button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
		button.setAttribute('data-locked', '');
		StorageManager.data.settings.screenStyle = index;
		StorageManager.store();
	}

	unlockScreenStyleButtons() {
		// Deselect all screen style buttons
		this.windowedButton.src = './assets/ui/options/grafwindo_n.png';
		this.windowedButton.removeAttribute('data-locked');
		this.fullButton.src = './assets/ui/options/grafful_n.png';
		this.fullButton.removeAttribute('data-locked');
	}

	selectColorDepthButton(button: HTMLImageElement, index: number) {
		this.unlockColorDepthButtons();
		button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
		button.setAttribute('data-locked', '');
		StorageManager.data.settings.colorDepth = index;
		StorageManager.store();
	}

	unlockColorDepthButtons() {
		// Deselect all color depth buttons
		this.depth16.src = './assets/ui/options/graf16bt_n.png';
		this.depth16.removeAttribute('data-locked');
		this.depth32.src = './assets/ui/options/graf32bt_n.png';
		this.depth32.removeAttribute('data-locked');
	}

	async updateSliders() {
		requestAnimationFrame(() => this.updateSliders());
		if (this.div.classList.contains('hidden')) return;

		// Updates all sliders based on mouse position.

		if (this.draggingMusicVolume) {
			let leftStart = this.div.getBoundingClientRect().left * SCALING_RATIO + this.musicVolumeKnobLeft;
			let completion = Util.clamp(((currentMousePosition.x - 12) - leftStart) / this.trackLength, 0, 1);

			this.musicVolumeKnob.style.left = Math.floor(this.musicVolumeKnobLeft + completion * this.trackLength) + 'px';
			StorageManager.data.settings.musicVolume = completion;
			mainAudioManager.updateVolumes();
		}

		if (this.draggingSoundVolume) {
			let leftStart = this.div.getBoundingClientRect().left * SCALING_RATIO + this.soundVolumeKnobLeft;
			let completion = Util.clamp(((currentMousePosition.x - 12) - leftStart) / this.trackLength, 0, 1);

			this.soundVolumeKnob.style.left = Math.floor(this.soundVolumeKnobLeft + completion * this.trackLength) + 'px';
			StorageManager.data.settings.soundVolume = completion;
			mainAudioManager.updateVolumes();

			if (!this.soundTestingSound) {
				this.soundTestingSound = mainAudioManager.createAudioSource('testing.wav');
				this.soundTestingSound.setLoop(true);
				this.soundTestingSound.play();
			}
		}

		if (this.draggingMouseSensitivity) {
			let leftStart = this.div.getBoundingClientRect().left * SCALING_RATIO + this.mouseSensitivityKnobLeft;
			let completion = Util.clamp(((currentMousePosition.x - 12) - leftStart) / this.trackLength, 0, 1);

			this.mouseSensitivityKnob.style.left = Math.floor(this.mouseSensitivityKnobLeft + completion * this.trackLength) + 'px';
			StorageManager.data.settings.mouseSensitivity = completion;
		}
	}

	selectControlsTab(which: 'marble' | 'camera' | 'mouse') {
		for (let elem of [this.marbleControlsDiv, this.cameraControlsDiv, this.mouseControlsDiv]) {
			elem.classList.add('hidden');
		}

		let index = ['marble', 'camera', 'mouse'].indexOf(which);
		let elem = [this.marbleControlsDiv, this.cameraControlsDiv, this.mouseControlsDiv][index];
		elem.classList.remove('hidden');

		this.controlsBackground.src = './assets/ui/options/' + ['cntrl_marb_bse.png', 'cntrl_cam_bse.png', 'cntrl_mous_base.png'][index];

		if (which === 'mouse') {
			// The mouse background is sized differently and requires its own transform
			this.controlsBackground.style.left = '2px';
			this.controlsBackground.style.top = '-1px';
		} else {
			this.controlsBackground.style.left = '';
			this.controlsBackground.style.top = '';
		}
	}

	refreshKeybindings() {
		this.buttonMarbleLeftContent.textContent = this.formatKeybinding('left');
		this.buttonMarbleRightContent.textContent = this.formatKeybinding('right');
		this.buttonMarbleUpContent.textContent = this.formatKeybinding('up');
		this.buttonMarbleDownContent.textContent = this.formatKeybinding('down');
		this.buttonMarbleUseContent.textContent = this.formatKeybinding('use');
		this.buttonMarbleJumpContent.textContent = this.formatKeybinding('jump');
		this.buttonCameraLeftContent.textContent = this.formatKeybinding('cameraLeft');
		this.buttonCameraRightContent.textContent = this.formatKeybinding('cameraRight');
		this.buttonCameraUpContent.textContent = this.formatKeybinding('cameraUp');
		this.buttonCameraDownContent.textContent = this.formatKeybinding('cameraDown');
		this.freeLookKeyContent.textContent = this.formatKeybinding('freeLook');
		this.buttonRestartLevelContent.textContent = this.formatKeybinding('restart');
	}

	setResetMarbleTextureState(enabled: boolean) {
		if (enabled) {
			this.resetMarbleTexture.style.pointerEvents = '';
			this.resetMarbleTexture.style.filter = '';
			(document.querySelector('#graphics-marble-texture-reset-text') as HTMLDivElement).style.opacity = '';
		} else {
			// Make it all grayed out and things
			this.resetMarbleTexture.style.pointerEvents = 'none';
			this.resetMarbleTexture.style.filter = 'saturate(0)';
			this.resetMarbleTexture.src = './assets/ui/options/cntr_cam_dwn_n.png';
			(document.querySelector('#graphics-marble-texture-reset-text') as HTMLDivElement).style.opacity = '0.7';
		}
	}
}