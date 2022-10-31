import { Renderer } from "../rendering/renderer";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";

export const mainCanvas = document.querySelector('#main-canvas') as HTMLCanvasElement;
export let mainRenderer: Renderer;

export const initMainRenderer = () => {
	mainRenderer = new Renderer({
		canvas: mainCanvas,
		desynchronized: StorageManager.data.settings.canvasDesynchronized
	});

	resize(false);

	const enableDebugModeSwitching = false;
	if (enableDebugModeSwitching) {
		window.addEventListener('keypress', (e) => {
			if (e.code === "KeyQ") {
				mainRenderer.debugMode++;
			}
			if (e.code === "KeyZ") {
				mainRenderer.debugMode--;
			}
		});
	}
};

const MIN_WIDTH = 640;
const MIN_HEIGHT = 600;

/** Ratio by which the entire body gets scaled by, while still fitting into the screen. */
export let SCALING_RATIO = 1;

export const computeUiScalingRatio = (width: number, height: number) => {
	return Math.max(1, MIN_WIDTH / width, MIN_HEIGHT / height);
};

export const resize = async (wait = true) => {
	if (wait) await Util.wait(100); // Sometimes you gotta give browser UI elements a little time to update

	let ratio = computeUiScalingRatio(window.innerWidth, window.innerHeight);
	document.body.style.width = Math.ceil(window.innerWidth * ratio) + 'px';
	document.body.style.height = Math.ceil(window.innerHeight * ratio) + 'px';
	document.body.style.transform = `scale(${1 / ratio})`;
	SCALING_RATIO = ratio;

	if (state.level && state.level.offline) return; // Disable the resizing logic below when we're rendering an offline level

	let pixelRatio = Math.min(window.devicePixelRatio, [0.5, 1.0, 1.5, 2.0, Infinity][StorageManager.data?.settings.pixelRatio]);

	mainCanvas.style.width = '100%';
	mainCanvas.style.height = '100%';
	mainRenderer?.setSize(window.innerWidth, window.innerHeight);
	mainRenderer?.setPixelRatio(pixelRatio);

	state.level?.onResize(window.innerWidth, window.innerHeight, Math.max(pixelRatio, 1));
};
window.addEventListener('resize', resize as any);

resize();

/** Becomes true when the user has closed the fullscreen enforcer. */
let dislikesFullscreen = false;
const fullscreenEnforcer = document.querySelector('#fullscreen-enforcer');

fullscreenEnforcer.addEventListener('click', () => {
	document.documentElement.requestFullscreen();
});
fullscreenEnforcer.querySelector('img').addEventListener('click', (e) => {
	dislikesFullscreen = true;
	fullscreenEnforcer.classList.add('hidden');
	e.stopPropagation();
});

const enterFullscreenButton = document.querySelector('#enter-fullscreen');
enterFullscreenButton.addEventListener('click', () => {
	document.documentElement.requestFullscreen();
	dislikesFullscreen = false; // They changed their mind, yay
});

let fullscreenButtonVisibility = true;
export const setEnterFullscreenButtonVisibility = (state: boolean) => {
	fullscreenButtonVisibility = state;

	if (state && Util.isTouchDevice && !Util.isSafari() && !Util.isInFullscreen()) enterFullscreenButton.classList.remove('hidden');
	else enterFullscreenButton.classList.add('hidden');
};

// Periodically, check if the mobile user has left fullscreen and if so, remind them to re-enter it.
let lastImmunityTime = -Infinity;
setInterval(() => {
	if (document.activeElement?.tagName === 'INPUT') lastImmunityTime = performance.now();

	if (Util.isTouchDevice && !Util.isSafari()) {
		if (Util.isInFullscreen()) {
			// They're in fullscreen, hide the overlay
			fullscreenEnforcer.classList.add('hidden');
		} else if (!dislikesFullscreen && document.activeElement?.tagName !== 'INPUT' && performance.now() - lastImmunityTime > 666) {
			// They're not in fullscreen, show the overlay
			fullscreenEnforcer.classList.remove('hidden');
		}
	}

	setEnterFullscreenButtonVisibility(fullscreenButtonVisibility);
}, 250);

// Disable image dragging in Firefox
window.addEventListener('dragstart', (e) => {
	if ((e.target as any).nodeName?.toUpperCase() === 'IMG') {
		e.preventDefault();
	}
});