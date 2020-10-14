import { AudioManager, AudioSource } from "../audio";
import { setupButton } from "./ui";
import { homeScreenDiv } from "./home";
import { StorageManager } from "../storage";
import { currentMousePosition } from "../input";
import { Util } from "../util";
import { ResourceManager } from "../resources";

export const optionsDiv = document.querySelector('#options') as HTMLDivElement;
const tabGraphics = document.querySelector('#tab-graphics') as HTMLImageElement;
const tabAudio = document.querySelector('#tab-audio') as HTMLImageElement;
const tabControls = document.querySelector('#tab-controls') as HTMLImageElement;

const selectTab = (which: 'graphics' | 'audio' | 'controls') => {
	for (let elem of [tabGraphics, tabAudio, tabControls]) {
		elem.style.zIndex = "-1";
	}
	for (let elem of [graphicsDiv, audioDiv, controlsDiv]) {
		elem.classList.add('hidden');
	}

	let index = ['graphics', 'audio', 'controls'].indexOf(which);

	let elem = [tabGraphics, tabAudio, tabControls][index];
	elem.style.zIndex = "0";
	[graphicsDiv, audioDiv, controlsDiv][index].classList.remove('hidden');
};

const setupTab = (element: HTMLImageElement, which: 'graphics' | 'audio' | 'controls') => {
	element.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		AudioManager.play('buttonpress.wav');
	});
	element.addEventListener('click', (e) => e.button === 0 && selectTab(which));
};
setupTab(tabGraphics, 'graphics');
setupTab(tabAudio, 'audio');
setupTab(tabControls, 'controls');

const homeButton = document.querySelector('#options-home') as HTMLImageElement;
setupButton(homeButton, 'options/mainm', () => {
	optionsDiv.classList.add('hidden');
	homeScreenDiv.classList.remove('hidden');
});

const graphicsDiv = document.querySelector('#options-graphics') as HTMLDivElement;
const audioDiv = document.querySelector('#options-audio') as HTMLDivElement;
const controlsDiv = document.querySelector('#options-controls') as HTMLDivElement;

export const initOptions = async () => {
	// Init all buttons, sliders and keybinds
	[resolution640, resolution800, resolution1024][StorageManager.data.settings.resolution].click();
	[openGl, direct3D][StorageManager.data.settings.videoDriver].click();
	[windowedButton, fullButton][StorageManager.data.settings.screenStyle].click();
	[depth16, depth32][StorageManager.data.settings.colorDepth].click();
	if (StorageManager.data.settings.shadows) shadowsCheckbox.click();

	musicVolumeKnob.style.left = Math.floor(musicVolumeKnobLeft + StorageManager.data.settings.musicVolume * trackLength) + 'px';
	soundVolumeKnob.style.left = Math.floor(soundVolumeKnobLeft + StorageManager.data.settings.soundVolume * trackLength) + 'px';
	mouseSensitivityKnob.style.left = Math.floor(mouseSensitivityKnobLeft + StorageManager.data.settings.mouseSensitivity * trackLength) + 'px';

	refreshKeybindings();

	if (StorageManager.data.settings.invertYAxis) invertY.click();
	if (StorageManager.data.settings.alwaysFreeLook) alwaysFreeLook.click();

	// Default selection
	selectControlsTab('marble');
	selectTab('graphics');
	
	await ResourceManager.loadImages(['cntrl_marb_bse.png', 'cntrl_cam_bse.png', 'cntrl_mous_base.png'].map(x => './assets/ui/options/' + x));

	if ((await StorageManager.databaseCount('keyvalue', 'marbleTexture')) === 0) {
		setResetMarbleTextureState(false);
	}
};

const resolution640 = document.querySelector('#graphics-640') as HTMLImageElement;
const resolution800 = document.querySelector('#graphics-800') as HTMLImageElement;
const resolution1024 = document.querySelector('#graphics-1024') as HTMLImageElement;

setupButton(resolution640, 'options/graf640', () => selectResolutionButton(resolution640, 0));
setupButton(resolution800, 'options/graf800', () => selectResolutionButton(resolution800, 1));
setupButton(resolution1024, 'options/graf1024', () => selectResolutionButton(resolution1024, 2));

const selectResolutionButton = (button: HTMLImageElement, index: number) => {
	unlockResolutionButtons();
	button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
	button.setAttribute('data-locked', '');
	StorageManager.data.settings.resolution = index;
	StorageManager.store();
};

const unlockResolutionButtons = () => {
	// Deselect all resolution buttons
	resolution640.src = './assets/ui/options/graf640_n.png';
	resolution640.removeAttribute('data-locked');
	resolution800.src = './assets/ui/options/graf800_n.png';
	resolution800.removeAttribute('data-locked');
	resolution1024.src = './assets/ui/options/graf1024_n.png';
	resolution1024.removeAttribute('data-locked');
};

const openGl = document.querySelector('#graphics-opengl') as HTMLImageElement;
const direct3D = document.querySelector('#graphics-direct3d') as HTMLImageElement;

setupButton(openGl, 'options/grafopgl', () => selectVideoDriverButton(openGl, 0));
setupButton(direct3D, 'options/grafdir3d', () => selectVideoDriverButton(direct3D, 1));

const selectVideoDriverButton = (button: HTMLImageElement, index: number) => {
	unlockVideoDriverButtons();
	button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
	button.setAttribute('data-locked', '');
	StorageManager.data.settings.videoDriver = index;
	StorageManager.store();
};

const unlockVideoDriverButtons = () => {
	// Deselect all video driver buttons
	openGl.src = './assets/ui/options/grafopgl_n.png';
	openGl.removeAttribute('data-locked');
	direct3D.src = './assets/ui/options/grafdir3d_n.png';
	direct3D.removeAttribute('data-locked');
};

const windowedButton = document.querySelector('#graphics-windowed') as HTMLImageElement;
const fullButton = document.querySelector('#graphics-full') as HTMLImageElement;

setupButton(windowedButton, 'options/grafwindo', () => selectScreenStyleButton(windowedButton, 0));
setupButton(fullButton, 'options/grafful', () => selectScreenStyleButton(fullButton, 1));

const selectScreenStyleButton = (button: HTMLImageElement, index: number) => {
	unlockScreenStyleButtons();
	button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
	button.setAttribute('data-locked', '');
	StorageManager.data.settings.screenStyle = index;
	StorageManager.store();
};

const unlockScreenStyleButtons = () => {
	// Deselect all screen style buttons
	windowedButton.src = './assets/ui/options/grafwindo_n.png';
	windowedButton.removeAttribute('data-locked');
	fullButton.src = './assets/ui/options/grafful_n.png';
	fullButton.removeAttribute('data-locked');
};

const depth16 = document.querySelector('#graphics-depth16') as HTMLImageElement;
const depth32 = document.querySelector('#graphics-depth32') as HTMLImageElement;

setupButton(depth16, 'options/graf16bt', () => selectColorDepthButton(depth16, 0));
setupButton(depth32, 'options/graf32bt', () => selectColorDepthButton(depth32, 1));

const selectColorDepthButton = (button: HTMLImageElement, index: number) => {
	unlockColorDepthButtons();
	button.src = button.src.slice(0, button.src.lastIndexOf('_')) + '_d.png';
	button.setAttribute('data-locked', '');
	StorageManager.data.settings.colorDepth = index;
	StorageManager.store();
};

const unlockColorDepthButtons = () => {
	// Deselect all color depth buttons
	depth16.src = './assets/ui/options/graf16bt_n.png';
	depth16.removeAttribute('data-locked');
	depth32.src = './assets/ui/options/graf32bt_n.png';
	depth32.removeAttribute('data-locked');
};

const shadowsCheckbox = document.querySelector('#graphics-shadows') as HTMLImageElement;
const graphicsApply = document.querySelector('#graphics-apply') as HTMLImageElement;

setupButton(shadowsCheckbox, 'options/graf_chkbx', () => {
	StorageManager.data.settings.shadows = !shadowsCheckbox.hasAttribute('data-locked');
	StorageManager.store();

	// Toggle the checkbox
	if (!shadowsCheckbox.hasAttribute('data-locked')) {
		shadowsCheckbox.setAttribute('data-locked', '');
		shadowsCheckbox.src = './assets/ui/options/graf_chkbx_d.png';
	} else {
		shadowsCheckbox.removeAttribute('data-locked');
		shadowsCheckbox.src = './assets/ui/options/graf_chkbx_h.png';
	}
});
setupButton(graphicsApply, 'options/grafapply', () => {});

const musicVolumeTrack = document.querySelector('#audio-music-track') as HTMLImageElement;
const musicVolumeKnob = document.querySelector('#audio-music-knob') as HTMLImageElement;
const soundVolumeTrack = document.querySelector('#audio-sound-track') as HTMLImageElement;
const soundVolumeKnob = document.querySelector('#audio-sound-knob') as HTMLImageElement;
const trackLength = 235; // The total draggable length of the slider
const musicVolumeKnobLeft = 155; // The left-most position of the knob
const soundVolumeKnobLeft = 157;
const mouseSensitivityKnobLeft = 148;
let draggingMusicVolume = false;
let draggingSoundVolume = false;
let draggingMouseSensitivity = false;
let soundTestingSound: AudioSource = null;

window.addEventListener('mouseup', () => {
	if (!draggingMusicVolume && !draggingSoundVolume && !draggingMouseSensitivity) return;

	// Release all dragging things
	draggingMusicVolume = draggingSoundVolume = draggingMouseSensitivity = false;
	StorageManager.store();

	if (soundTestingSound) {
		// Stop the sound
		soundTestingSound.node.loop = false;
		soundTestingSound = null;
	}
});
musicVolumeTrack.addEventListener('mousedown', () => draggingMusicVolume = true);
musicVolumeKnob.addEventListener('mousedown', () => draggingMusicVolume = true);
soundVolumeTrack.addEventListener('mousedown', () => draggingSoundVolume = true);
soundVolumeKnob.addEventListener('mousedown', () => draggingSoundVolume = true);

const updateSliders = async () => {
	requestAnimationFrame(updateSliders);
	if (optionsDiv.classList.contains('hidden')) return;

	// Updates all sliders based on mouse position.

	if (draggingMusicVolume) {
		let leftStart = optionsDiv.getBoundingClientRect().left + musicVolumeKnobLeft;
		let completion = Util.clamp(((currentMousePosition.x - 12) - leftStart) / trackLength, 0, 1);

		musicVolumeKnob.style.left = Math.floor(musicVolumeKnobLeft + completion * trackLength) + 'px';
		StorageManager.data.settings.musicVolume = completion;
		AudioManager.updateVolumes();
	}

	if (draggingSoundVolume) {
		let leftStart = optionsDiv.getBoundingClientRect().left + soundVolumeKnobLeft;
		let completion = Util.clamp(((currentMousePosition.x - 12) - leftStart) / trackLength, 0, 1);

		soundVolumeKnob.style.left = Math.floor(soundVolumeKnobLeft + completion * trackLength) + 'px';
		StorageManager.data.settings.soundVolume = completion;
		AudioManager.updateVolumes();

		if (!soundTestingSound) {
			soundTestingSound = AudioManager.createAudioSource('testing.wav');
			soundTestingSound.node.loop = true;
			soundTestingSound.play();
		}
	}

	if (draggingMouseSensitivity) {
		let leftStart = optionsDiv.getBoundingClientRect().left + mouseSensitivityKnobLeft;
		let completion = Util.clamp(((currentMousePosition.x - 12) - leftStart) / trackLength, 0, 1);

		mouseSensitivityKnob.style.left = Math.floor(mouseSensitivityKnobLeft + completion * trackLength) + 'px';
		StorageManager.data.settings.mouseSensitivity = completion;
	}
};
requestAnimationFrame(updateSliders);

const controlsBackground = document.querySelector('#controls-background') as HTMLImageElement;
const marbleTab = document.querySelector('#tab-marble') as HTMLImageElement; // it's not
const cameraTab = document.querySelector('#tab-camera') as HTMLImageElement;
const mouseTab = document.querySelector('#tab-mouse') as HTMLImageElement;
const marbleControlsDiv = document.querySelector('#controls-marble') as HTMLDivElement;
const cameraControlsDiv = document.querySelector('#controls-camera') as HTMLDivElement;
const mouseControlsDiv = document.querySelector('#controls-mouse') as HTMLDivElement;

setupButton(marbleTab, '', () => selectControlsTab('marble'));
setupButton(cameraTab, '', () => selectControlsTab('camera'));
setupButton(mouseTab, '', () => selectControlsTab('mouse'));

const selectControlsTab = (which: 'marble' | 'camera' | 'mouse') => {
	for (let elem of [marbleControlsDiv, cameraControlsDiv, mouseControlsDiv]) {
		elem.classList.add('hidden');
	}

	let index = ['marble', 'camera', 'mouse'].indexOf(which);
	let elem = [marbleControlsDiv, cameraControlsDiv, mouseControlsDiv][index];
	elem.classList.remove('hidden');
	
	controlsBackground.src = './assets/ui/options/' + ['cntrl_marb_bse.png', 'cntrl_cam_bse.png', 'cntrl_mous_base.png'][index];

	if (which === 'mouse') {
		// The mouse background is sized differently and requires its own transform
		controlsBackground.style.left = '2px';
		controlsBackground.style.top = '-1px';
	} else {
		controlsBackground.style.left = '';
		controlsBackground.style.top = '';
	}
};

/** Stores the button that's currently being rebound. */
let currentlyRebinding: keyof typeof StorageManager.data.settings.gameButtonMapping = null;
/** Stores the value that we currently want to rebind to. */
let rebindValue: string = null;
const rebindDialog = document.querySelector('#rebind-dialog') as HTMLDivElement;
const rebindConfirm = document.querySelector('#rebind-confirm') as HTMLDivElement;
const rebindConfirmYes = document.querySelector('#rebind-confirm-yes') as HTMLImageElement;
const rebindConfirmNo = document.querySelector('#rebind-confirm-no') as HTMLImageElement;

const buttonToDisplayName: Record<keyof typeof StorageManager.data.settings.gameButtonMapping, string> = {
	up: 'Move Forward',
	down: 'Move Backward',
	left: 'Move Left',
	right: 'Move Right',
	use: 'Use PowerUp',
	jump: 'Jump',
	cameraUp: 'Rotate Camera Up',
	cameraDown: 'Rotate Camera Down',
	cameraLeft: 'Rotate Camera Left',
	cameraRight: 'Rotate Camera Right',
	freeLook: 'Free Look'
};

const formatKeybinding = (button: keyof typeof StorageManager.data.settings.gameButtonMapping) => {
	let str = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[button as keyof typeof StorageManager.data.settings.gameButtonMapping]);
	if (str.startsWith('the')) return str.slice(str.indexOf(' ') + 1, str.lastIndexOf(' ')); // If the string starts with 'the', then it's a mouse button, and we clean it up by only keeping the middle part (dropping 'the' and 'button')
	else return str;
};

const refreshKeybindings = () => {
	buttonMarbleLeftContent.textContent = formatKeybinding('left');
	buttonMarbleRightContent.textContent = formatKeybinding('right');
	buttonMarbleUpContent.textContent = formatKeybinding('up');
	buttonMarbleDownContent.textContent = formatKeybinding('down');
	buttonMarbleUseContent.textContent = formatKeybinding('use');
	buttonMarbleJumpContent.textContent = formatKeybinding('jump');
	buttonCameraLeftContent.textContent = formatKeybinding('cameraLeft');
	buttonCameraRightContent.textContent = formatKeybinding('cameraRight');
	buttonCameraUpContent.textContent = formatKeybinding('cameraUp');
	buttonCameraDownContent.textContent = formatKeybinding('cameraDown');
	freeLookKeyContent.textContent = formatKeybinding('freeLook');
};

const changeKeybinding = (button: keyof typeof StorageManager.data.settings.gameButtonMapping) => {
	rebindDialog.classList.remove('hidden');
	rebindDialog.children[1].innerHTML = `Press a new key or button for<br>"${buttonToDisplayName[button]}"`;
	currentlyRebinding = button;
};

const setKeybinding = (button: keyof typeof StorageManager.data.settings.gameButtonMapping, value: string) => {
	// Check for collisions with other bindings
	for (let key in StorageManager.data.settings.gameButtonMapping) {
		let typedKey = key as keyof typeof StorageManager.data.settings.gameButtonMapping;
		let otherValue = StorageManager.data.settings.gameButtonMapping[typedKey];

		if (otherValue === value && typedKey !== button) {
			// We found another binding that binds to the same key, bring up the conflict dialog.
			rebindDialog.classList.add('hidden');
			rebindConfirm.classList.remove('hidden');
			rebindConfirm.children[1].innerHTML = `"${formatKeybinding(typedKey)}" is already bound to "${buttonToDisplayName[typedKey]}"!<br>Do you want to undo this<br>mapping?`;
			rebindValue = value;

			return;
		}
	}

	// Simply store the keybind.
	StorageManager.data.settings.gameButtonMapping[button] = value;
	StorageManager.store();
	currentlyRebinding = null;
	rebindDialog.classList.add('hidden');
	refreshKeybindings();
};

window.addEventListener('keydown', (e) => {
	if (!currentlyRebinding || rebindValue) return;

	if (e.code === 'Escape') {
		// Exits keybinding without changing anything
		currentlyRebinding = null;
		rebindDialog.classList.add('hidden');
	} else {
		setKeybinding(currentlyRebinding, e.code);
	}
});

window.addEventListener('mousedown', (e) => {
	if (!currentlyRebinding || rebindValue) return;

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (!buttonName) return;

	setKeybinding(currentlyRebinding, buttonName);
});

setupButton(rebindConfirmYes, 'common/yes', () => {
	// Find the other value and nullify its binding value (empty string)
	for (let key in StorageManager.data.settings.gameButtonMapping) {
		let typedKey = key as keyof typeof StorageManager.data.settings.gameButtonMapping;
		let otherValue = StorageManager.data.settings.gameButtonMapping[typedKey];

		if (otherValue === rebindValue) StorageManager.data.settings.gameButtonMapping[typedKey] = '';
	}
	
	// Bind the new value
	StorageManager.data.settings.gameButtonMapping[currentlyRebinding] = rebindValue;
	StorageManager.store();
	currentlyRebinding = null;
	rebindValue = null;
	rebindConfirm.classList.add('hidden');
	refreshKeybindings();
});
setupButton(rebindConfirmNo, 'common/no', () => {
	// Cancel the rebinding process.
	currentlyRebinding = null;
	rebindValue = null;
	rebindConfirm.classList.add('hidden');
});

// Setup all buttons related to keybinding:

const buttonMarbleLeft = document.querySelector('#button-marble-left') as HTMLImageElement;
const buttonMarbleRight = document.querySelector('#button-marble-right') as HTMLImageElement;
const buttonMarbleUp = document.querySelector('#button-marble-up') as HTMLImageElement;
const buttonMarbleDown = document.querySelector('#button-marble-down') as HTMLImageElement;
const buttonMarbleUse = document.querySelector('#button-marble-use') as HTMLImageElement;
const buttonMarbleJump = document.querySelector('#button-marble-jump') as HTMLImageElement;

setupButton(buttonMarbleLeft, 'options/cntr_mrb_lft', () => changeKeybinding('left'));
setupButton(buttonMarbleRight, 'options/cntr_mrb_rt', () => changeKeybinding('right'));
setupButton(buttonMarbleUp, 'options/cntr_mrb_fw', () => changeKeybinding('up'));
setupButton(buttonMarbleDown, 'options/cntr_mrb_bak', () => changeKeybinding('down'));
setupButton(buttonMarbleUse, 'options/cntr_mrb_pwr', () => changeKeybinding('use'));
setupButton(buttonMarbleJump, 'options/cntr_mrb_jmp', () => changeKeybinding('jump'));

const buttonMarbleLeftContent = document.querySelector('#button-marble-left-content') as HTMLParagraphElement;
const buttonMarbleRightContent = document.querySelector('#button-marble-right-content') as HTMLParagraphElement;
const buttonMarbleUpContent = document.querySelector('#button-marble-up-content') as HTMLParagraphElement;
const buttonMarbleDownContent = document.querySelector('#button-marble-down-content') as HTMLParagraphElement;
const buttonMarbleUseContent = document.querySelector('#button-marble-use-content') as HTMLParagraphElement;
const buttonMarbleJumpContent = document.querySelector('#button-marble-jump-content') as HTMLParagraphElement;

const buttonCameraLeft = document.querySelector('#button-camera-left') as HTMLImageElement;
const buttonCameraRight = document.querySelector('#button-camera-right') as HTMLImageElement;
const buttonCameraUp = document.querySelector('#button-camera-up') as HTMLImageElement;
const buttonCameraDown = document.querySelector('#button-camera-down') as HTMLImageElement;

setupButton(buttonCameraLeft, 'options/cntr_cam_lft', () => changeKeybinding('cameraLeft'));
setupButton(buttonCameraRight, 'options/cntr_cam_rt', () => changeKeybinding('cameraRight'));
setupButton(buttonCameraUp, 'options/cntr_cam_up', () => changeKeybinding('cameraUp'));
setupButton(buttonCameraDown, 'options/cntr_cam_dwn', () => changeKeybinding('cameraDown'));

const buttonCameraLeftContent = document.querySelector('#button-camera-left-content') as HTMLParagraphElement;
const buttonCameraRightContent = document.querySelector('#button-camera-right-content') as HTMLParagraphElement;
const buttonCameraUpContent = document.querySelector('#button-camera-up-content') as HTMLParagraphElement;
const buttonCameraDownContent = document.querySelector('#button-camera-down-content') as HTMLParagraphElement;

const mouseSensitivityKnob = document.querySelector('#sensitivity-knob') as HTMLImageElement;
mouseSensitivityKnob.addEventListener('mousedown', () => draggingMouseSensitivity = true);

const invertY = document.querySelector('#invert-y') as HTMLImageElement;
setupButton(invertY, 'options/cntrl_mous_invrt', () => {
	StorageManager.data.settings.invertYAxis = !invertY.hasAttribute('data-locked');
	StorageManager.store();

	// Toggle the checkbox
	if (!invertY.hasAttribute('data-locked')) {
		invertY.setAttribute('data-locked', '');
		invertY.src = './assets/ui/options/cntrl_mous_invrt_d.png';
	} else {
		invertY.removeAttribute('data-locked');
		invertY.src = './assets/ui/options/cntrl_mous_invrt_h.png';
	}
});

const alwaysFreeLook = document.querySelector('#always-free-look') as HTMLImageElement;
setupButton(alwaysFreeLook, 'options/cntrl_mous_freel', () => {
	StorageManager.data.settings.alwaysFreeLook = !alwaysFreeLook.hasAttribute('data-locked');
	StorageManager.store();

	// Toggle the checkbox
	if (!alwaysFreeLook.hasAttribute('data-locked')) {
		alwaysFreeLook.setAttribute('data-locked', '');
		alwaysFreeLook.src = './assets/ui/options/cntrl_mous_freel_d.png';
	} else {
		alwaysFreeLook.removeAttribute('data-locked');
		alwaysFreeLook.src = './assets/ui/options/cntrl_mous_freel_h.png';
	}
});

const freeLookKey = document.querySelector('#free-look-key') as HTMLImageElement;
setupButton(freeLookKey, 'options/cntrl_mous_bttn', () => changeKeybinding('freeLook'));
const freeLookKeyContent = document.querySelector('#free-look-key-content') as HTMLParagraphElement;

const chooseMarbleTexture = document.querySelector('#graphics-marble-texture-choose') as HTMLImageElement;
const resetMarbleTexture = document.querySelector('#graphics-marble-texture-reset') as HTMLImageElement;

setupButton(chooseMarbleTexture, 'options/cntr_cam_up', () => {
	// Show an image picker
	let fileInput = document.createElement('input');
	fileInput.setAttribute('type', 'file');
	fileInput.setAttribute('accept', "image/x-png,image/gif,image/jpeg");

	fileInput.onchange = async (e) => {
		let file = fileInput.files[0];
		await StorageManager.databasePut('keyvalue', file, 'marbleTexture'); // Store the Blob in the IndexedDB
		setResetMarbleTextureState(true);
	};
	fileInput.click();
});
setupButton(resetMarbleTexture, 'options/cntr_cam_dwn', () => {
	StorageManager.databaseDelete('keyvalue', 'marbleTexture');
	setResetMarbleTextureState(false);
});

const setResetMarbleTextureState = (enabled: boolean) => {
	if (enabled) {
		resetMarbleTexture.style.pointerEvents = '';
		resetMarbleTexture.style.filter = '';
		(document.querySelector('#graphics-marble-texture-reset-text') as HTMLDivElement).style.opacity = '';
	} else {
		// Make it all grayed out and things
		resetMarbleTexture.style.pointerEvents = 'none';
		resetMarbleTexture.style.filter = 'saturate(0)';
		resetMarbleTexture.src = './assets/ui/options/cntr_cam_dwn_n.png';
		(document.querySelector('#graphics-marble-texture-reset-text') as HTMLDivElement).style.opacity = '0.7';
	}
};