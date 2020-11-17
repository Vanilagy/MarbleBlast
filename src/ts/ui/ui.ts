import { AudioManager, AudioSource } from "../audio";
import { ResourceManager } from "../resources";

export const menuDiv = document.querySelector('#menu') as HTMLDivElement;

/** Sets up an image element to act like a button and change textures based on click and hover state. */
export const setupButton = (element: HTMLImageElement, path: string, onclick: () => any, loadDisabledImage = false, triggerOnMouseDown = false) => {
	let ogPath = path;
	path = './assets/ui/' + path;
	let normal = path + '_n.png';
	let hover = path + '_h.png';
	let down = path + '_d.png';
	let disabled = path + '_i.png';
	let held = false;

	element.src = normal;
	element.addEventListener('mouseenter', () => {
		if (element.style.pointerEvents === 'none') return;
		if (!element.hasAttribute('data-locked')) element.src = held? down : hover;
		if (!held) AudioManager.play('buttonover.wav');
	});
	element.addEventListener('mouseleave', () => {
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
		if (element.style.pointerEvents === 'none') return;
		held = false;
		if (!element.hasAttribute('data-locked')) element.src = normal;
	});
	if (!triggerOnMouseDown) element.addEventListener('click', (e) => e.button === 0 && onclick());

	if (ogPath) {
		// Preload the images
		ResourceManager.loadImage(normal);
		ResourceManager.loadImage(hover);
		ResourceManager.loadImage(down);
		if (loadDisabledImage) ResourceManager.loadImage(disabled);
	}
};

let menuMusic: AudioSource;

export const initUi = async () => {
	await AudioManager.loadBuffers(['shell.ogg', 'buttonover.wav', 'buttonpress.wav']);
};

export const startUi = () => {
	menuDiv.classList.remove('hidden');
	startMenuMusic();
};

export const startMenuMusic = async () => {
	menuMusic = AudioManager.createAudioSource('shell.ogg', AudioManager.musicGain);
	menuMusic.node.loop = true;
	menuMusic.play();
	await menuMusic.promise;
};

export const stopMenuMusic = async () => {
	menuMusic?.stop();
};