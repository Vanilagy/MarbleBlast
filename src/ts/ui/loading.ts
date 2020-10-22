import { setupButton, menuDiv, stopMenuMusic } from "./ui";
import { levelSelectDiv } from "./level_select";
import { state } from "../state";
import { Level } from "../level";
import { gameUiDiv } from "./game";
import { Util } from "../util";
import { Replay } from "../replay";
import { Mission } from "../mission";

const loadingDiv = document.querySelector('#loading') as HTMLDivElement;
const levelNameElement = document.querySelector('#loading-level-name') as HTMLParagraphElement;
const cancelButton = document.querySelector('#loading-cancel') as HTMLImageElement;
const progressBar = document.querySelector('#loading-progress') as HTMLDivElement;
const maxProgressBarWidth = 252;
/** Used to cancel loading if necessary. */
let loadingIndex = 0;

setupButton(cancelButton, 'loading/cancel', () => {
	// Cancel the loading progress and return to level select
	loadingDiv.classList.add('hidden');
	levelSelectDiv.classList.remove('hidden');
	loadingIndex++;
});

export const loadLevel = async (mission: Mission, getReplay?: () => Replay) => {
	loadingDiv.classList.remove('hidden');
	let indexAtStart = loadingIndex; // Remember the index at the start. If it changes later, that means that loading was cancelled.
	
	levelNameElement.textContent = mission.title;

	progressBar.style.width = '0px';

	// Give the UI a bit of time to breathe before we begin to load the level.
	await Util.wait(50);

	await mission.load();

	if (loadingIndex !== indexAtStart) return;

	let refresher = setInterval(() => {
		// Constantly refresh the loading bar's width
		let completion = level.getLoadingCompletion();
		progressBar.style.width = (completion * maxProgressBarWidth) + 'px';
	}) as unknown as number;

	let level = new Level(mission);
	try {
		await level.init();

		if (getReplay) {
			let replay = getReplay();
			// Load the replay
			level.replay = replay;
			replay.level = level;
			replay.mode = 'playback';
		}

		clearInterval(refresher);
		if (loadingIndex !== indexAtStart) return;

		// Fake some second loading pass
		let start = performance.now();
		refresher = setInterval(() => {
			let completion = Util.clamp((performance.now() - start) / 100, 0, 1);
			progressBar.style.width = (completion * maxProgressBarWidth) + 'px';
		});

		await Util.wait(150);
		clearInterval(refresher);

		if (loadingIndex !== indexAtStart) return;

		// Loading has finished, hop into gameplay.

		stopMenuMusic();
		state.currentLevel = level;
		level.start();

		loadingDiv.classList.add('hidden');
		menuDiv.classList.add('hidden');
		gameUiDiv.classList.remove('hidden');
	} catch(e) {
		console.error(e);
		cancelButton.click();
		clearInterval(refresher);

		setTimeout(() => alert("There was an error due to which the level couldn't be loaded."), 50);
	}
};