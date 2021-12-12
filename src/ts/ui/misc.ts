import { Renderer } from "../rendering/renderer";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";

export const mainCanvas = document.querySelector('#main-canvas') as HTMLCanvasElement;
export const mainRenderer = new Renderer({ canvas: mainCanvas });

const MIN_WIDTH = 640;
const MIN_HEIGHT = 600;

/** Ratio by which the entire body gets scaled by, while still fitting into the screen. */
export let SCALING_RATIO = 1;

export const resize = async (wait = true) => {
	if (wait) await Util.wait(100); // Sometimes you gotta give browser UI elements a little time to update

	let ratio = Math.max(1, MIN_WIDTH / window.innerWidth, MIN_HEIGHT / window.innerHeight);
	document.body.style.width = Math.ceil(window.innerWidth * ratio) + 'px';
	document.body.style.height = Math.ceil(window.innerHeight * ratio) + 'px';
	document.body.style.transform = `scale(${1 / ratio})`;
	SCALING_RATIO = ratio;
	
	mainCanvas.style.width = '100%';
	mainCanvas.style.height = '100%';
	mainRenderer.setSize(window.innerWidth, window.innerHeight);
	mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, [0.5, 1.0, 1.5, 2.0, Infinity][StorageManager.data?.settings.pixelRatio]));

	state.level?.onResize();
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