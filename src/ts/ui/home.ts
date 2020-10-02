import { setupButton } from "./ui";
import { levelSelectDiv } from "./level_select";

export const homeScreenDiv = document.querySelector('#home-screen') as HTMLDivElement;
const playButton = document.querySelector('#home-play') as HTMLImageElement;
const helpButton = document.querySelector('#home-help') as HTMLImageElement;
const optionsButton = document.querySelector('#home-options') as HTMLImageElement;
const exitButton = document.querySelector('#home-exit') as HTMLImageElement;

setupButton(playButton, 'home/play', () => {
	homeScreenDiv.classList.add('hidden');
	levelSelectDiv.classList.remove('hidden');
});
setupButton(helpButton, 'home/help', () => {});
setupButton(optionsButton, 'home/options', () => {});
setupButton(exitButton, 'home/exit', () => {});