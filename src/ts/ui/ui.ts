import { AudioManager } from "../audio";
import { ResourceManager } from "../resources";

/** Sets up an image element to act like a button and change textures based on click and hover state. */
export const setupButton = (element: HTMLImageElement, path: string, onclick: () => any, loadDisabledImage = false, triggerOnMouseDown = false) => {
	let ogPath = path;
	path = './assets/ui/' + path;
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
};