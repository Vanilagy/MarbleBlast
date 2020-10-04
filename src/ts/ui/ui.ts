import { AudioManager, AudioSource } from "../audio";

export const menuDiv = document.querySelector('#menu') as HTMLDivElement;

export const setupButton = (element: HTMLImageElement, path: string, onclick: () => any) => {
	path = './assets/ui/' + path;
	let normal = path + '_n.png';
	let hover = path + '_h.png';
	let down = path + '_d.png';
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
	});
	window.addEventListener('mouseup', () => {
		if (element.style.pointerEvents === 'none') return;
		held = false;
		if (!element.hasAttribute('data-locked')) element.src = normal;
	});
	element.addEventListener('click', (e) => e.button === 0 && onclick());
};

let menuMusic: AudioSource;

export const startUi = async () => {
	menuDiv.classList.remove('hidden');
	startMenuMusic();
};

export const startMenuMusic = async () => {
	menuMusic = await AudioManager.createAudioSource('shell.ogg', AudioManager.musicGain);
	menuMusic.node.loop = true;
	menuMusic.play();
};

export const stopMenuMusic = async () => {
	menuMusic?.stop();
};