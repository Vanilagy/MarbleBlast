import { setupButton } from "./ui";
import { levelSelectDiv, hiddenUnlocker, updateOnlineLeaderboard } from "./level_select";
import { helpDiv, showHelpPage, initHelpScenes } from "./help";
import { optionsDiv } from "./options";

export const homeScreenDiv = document.querySelector('#home-screen') as HTMLDivElement;
const playButton = document.querySelector('#home-play') as HTMLImageElement;
const helpButton = document.querySelector('#home-help') as HTMLImageElement;
const optionsButton = document.querySelector('#home-options') as HTMLImageElement;
const exitButton = document.querySelector('#home-exit') as HTMLImageElement;

setupButton(playButton, 'home/play', () => {
	// Show the level select
	homeScreenDiv.classList.add('hidden');
	levelSelectDiv.classList.remove('hidden');
	hiddenUnlocker.classList.remove('hidden');

	updateOnlineLeaderboard(true);
});
setupButton(helpButton, 'home/help', () => {
	// Show the help screen
	homeScreenDiv.classList.add('hidden');
	helpDiv.classList.remove('hidden');
	initHelpScenes();
	showHelpPage(0);
});
setupButton(optionsButton, 'home/options', () => {
	// Show the options screen
	homeScreenDiv.classList.add('hidden');
	optionsDiv.classList.remove('hidden');
});
setupButton(exitButton, 'home/exit', () => {}); // JavaScript can't close its own tab, so... don't do anything.