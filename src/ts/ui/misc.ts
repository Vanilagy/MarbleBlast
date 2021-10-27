import { Util } from "../util";

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