import './input';
import { ResourceManager } from "./resources";
import { mainAudioManager } from "./audio";
import { StorageManager } from './storage';
import { Util } from './util';
import { Leaderboard } from './leaderboard';
import { MissionLibrary } from './mission_library';
import { state } from './state';
import { setMenu } from './ui/menu_setter';
import { initMainRenderer } from './ui/misc';

const loadingMessage = document.querySelector('#loading-message') as HTMLDivElement;
const loadingDetail = document.querySelector('#loading-detail') as HTMLDivElement;
const startGameDialog = document.querySelector('#start-game-dialog') as HTMLDivElement;

const init = async () => {
	await Util.init();
	await StorageManager.init();
	await ResourceManager.init();
	initMainRenderer();

	loadingDetail.textContent = 'Loading levels...';
	await MissionLibrary.init();
	mainAudioManager.init();

	loadingDetail.textContent = 'Loading UI...';

	let searchParams = new URLSearchParams(location.search);
	if (searchParams.has('mbg')) {
		StorageManager.data.modification = 'gold';
		StorageManager.store();
	} else if (searchParams.has('mbp')) {
		StorageManager.data.modification = 'platinum';
		StorageManager.store();
	}

	await setMenu(StorageManager.data.modification);

	loadingDetail.textContent = 'Loading leaderboard...';
	await Leaderboard.init();
	if (Util.isWeeb) document.title = 'Marble Blast Weeb'; // <- humor

	// If we're on a touch device, remind the user that the site can be installed as a PWA
	if (Util.isTouchDevice && !location.search.includes('app')) {
		let div = document.createElement('div');
		div.id = 'install-popup';
		let img = document.createElement('img');
		img.src = './assets/img/download.png';
		img.style.display = 'none';
		div.append(img);
		img.addEventListener('click', () => {
			installPromptEvent.prompt();
		});

		let intervalId = setInterval(() => {
			if (installPromptEvent) img.style.display = '';
		}, 100);

		state.menu.showAlertPopup('Install as app', `This website can be installed on your device's home screen to run in proper fullscreen and feel like a native app. To install it, press the icon below, or if there is none, follow <a href="https://natomasunified.org/kb/add-website-to-mobile-device-home-screen/" target="_blank">these</a> steps.`, div).then(() => {
			clearInterval(intervalId);
		});
	}

	let started = false;
	const start = async () => {
		started = true;
		startGameDialog.style.display = 'none';
		mainAudioManager.context.resume();
		state.menu.show();

		maybeLaunchLevelFromQueryParams(new URLSearchParams(window.location.search));
	};

	loadingMessage.style.display = 'none';
	loadingDetail.style.display = 'none';
	if (mainAudioManager.context.state === "running" && !Util.isSafari()) {
		// Start the game automatically if we already have audio autoplay permission.
		start();
		return;
	}

	// Otherwise, we need user interaction to start audio.

	if (Util.isInFullscreen() || Util.isTouchDevice) {
		// No need to tell them to enter fullscreen if they're already in it
		startGameDialog.children[0].textContent = 'Click anywhere to start';
		startGameDialog.children[1].textContent = '';
	} else {
		startGameDialog.children[0].textContent = `Press ${Util.isMac()? '^⌘F' : 'F11'} to start in fullscreen mode`;
	}
	startGameDialog.style.display = 'block';

	window.addEventListener('mousedown', () => {
		if (started) return;
		start();
	});
	window.addEventListener('pointerdown', () => {
		if (started) return;
		start();
	});
	window.addEventListener('keydown', (e) => {
		if (started) return;
		if (e.code === 'F11' && !Util.isInFullscreen()) start();
	});
};
window.onload = init;

/** Launch a level from the query params */
const maybeLaunchLevelFromQueryParams = async (urlParams: URLSearchParams) => {
	// Check if we are using the ?play-custom={id} query param to launch the game directly into the specified mission
	const playParam = urlParams.get('play-custom');
	if (playParam === null) return;
	if (!Number.isInteger(parseInt(playParam))) return;

	const intParam = parseInt(playParam);
	let missionToPlay = MissionLibrary.allMissions.find(x => x.id === intParam);
	if (missionToPlay === undefined) return;

	if (state.modification === 'gold' && (missionToPlay.path.startsWith('mbp') || missionToPlay.path.startsWith('mbu'))) {
		// Switch the menu to MBP
		await setMenu('platinum');
	}

	state.menu.home.changelogContainer.classList.add('hidden'); // No need to show version history when directly launching into the mission
	state.menu.home.hide();
	state.menu.levelSelect.show();
	state.menu.levelSelect.hide();
	state.menu.loadingScreen.loadLevel(missionToPlay, undefined);
};

let errorTimeout: number = null;
// Keep track all errors
let errorQueue: {
	message: string,
	lineno: number,
	colno: number,
	filename: string
}[] = [];
window.addEventListener('error', (e) => {
	errorQueue.push({
		message: (e.error as Error).stack,
		lineno: e.lineno,
		colno: e.colno,
		filename: e.filename
	});
	if (errorTimeout === null) sendErrors();
});
window.addEventListener('unhandledrejection', (e) => {
	errorQueue.push({
		message: e.reason instanceof Error ? e.reason.stack : e.reason.toString(),
		lineno: 0,
		colno: 0,
		filename: 'Unhandled in Promise'
	});
	if (errorTimeout === null) sendErrors();
});

/** Sends an error report to the server. */
const sendErrors = () => {
	errorTimeout = null;
	if (errorQueue.length === 0) return;

	let errors: {
		message: string,
		line: number,
		column: number,
		filename: string
	}[] = [];

	errorQueue.length = Math.min(errorQueue.length, 16); // Cap it at 16 errors, we don't wanna be sending too much
	for (let event of errorQueue) {
		errors.push({
			message: event.message,
			line: event.lineno,
			column: event.colno,
			filename: event.filename
		});
	}
	errorQueue.length = 0;

	if (errors.length > 0) {
		fetch('./api/error', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				userAgent: navigator.userAgent,
				errors: errors
			})
		});
	}

	// 5-second timeout until it's done again
	errorTimeout = setTimeout(sendErrors, 5000) as any as number;
};

const activityId = Util.getRandomId();
setInterval(() => {
	fetch('/api/activity?id=' + activityId);
}, 30000);

// Very basic Service Worker code here:
if (navigator.serviceWorker) {
	navigator.serviceWorker.register('/sw.js', {
		scope: '/'
	}).then(reg => {
		reg.update();
	}).catch(error => {
		console.log('Service worker registration failed, error:', error);
	});
}

let installPromptEvent: any = null;
window.addEventListener('beforeinstallprompt', (e: Event) => {
	e.preventDefault();
	installPromptEvent = e; // Save the prompt for later
});