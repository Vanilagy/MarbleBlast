import { setupButton } from "./ui";
import { levelSelectDiv, hiddenUnlocker } from "./level_select";
import { helpDiv, showHelpPage, initHelpScenes } from "./help";
import { optionsDiv } from "./options";
import { Leaderboard } from "../leaderboard";
import { ResourceManager } from "../resources";
import { StorageManager } from "../storage";
import { Util } from "../util";

export const homeScreenDiv = document.querySelector('#home-screen') as HTMLDivElement;
const playButton = document.querySelector('#home-play') as HTMLImageElement;
const helpButton = document.querySelector('#home-help') as HTMLImageElement;
const optionsButton = document.querySelector('#home-options') as HTMLImageElement;
const exitButton = document.querySelector('#home-exit') as HTMLImageElement;
const showChangelogButton = document.querySelector('#show-changelog') as HTMLImageElement;
const showChangelogText = document.querySelector('#show-changelog-text') as HTMLDivElement;
const changelogContainer = document.querySelector('#changelog') as HTMLDivElement;
const changelogBackButton = document.querySelector('#changelog-back') as HTMLImageElement;
const changelogContent = document.querySelector('#changelog-content') as HTMLDivElement;
const version = document.querySelector('#version') as HTMLParagraphElement;

setupButton(playButton, 'home/play', () => {
	// Show the level select
	hideHome();
	levelSelectDiv.classList.remove('hidden');
	hiddenUnlocker.classList.remove('hidden');

	Leaderboard.syncLeaderboard();
});
setupButton(helpButton, 'home/help', () => {
	// Show the help screen
	hideHome();
	helpDiv.classList.remove('hidden');
	initHelpScenes();
	showHelpPage(0);
});
setupButton(optionsButton, 'home/options', () => {
	// Show the options screen
	hideHome();
	optionsDiv.classList.remove('hidden');
});
setupButton(exitButton, 'home/exit', () => {}); // JavaScript can't close its own tab, so... don't do anything.

setupButton(showChangelogButton, 'motd/motd_buttn_textless', () => {
	changelogContainer.classList.remove('hidden');
});
setupButton(changelogBackButton, 'play/back', () => {
	changelogContainer.classList.add('hidden');
});

export const initHome = async () => {
	// Fetch and display the version history
	let blob = await ResourceManager.loadResource('/api/version_history');
	let text = await ResourceManager.readBlobAsText(blob);

	let latestVersion = /(^|\n)## (\d+\.\d+\.\d+)/.exec(text)[2];
	version.textContent = `MBGW v${latestVersion}`;

	// Cheap conversion from markdown to HTML here
	text = text.replace(/(^|\n)# (.*)/g, '$1<span class="changelog-h1">$2</span>');
	text = text.replace(/(^|\n)## (.*)/g, '$1<span class="changelog-h2">$2</span>');
	text = text.replace(/(^|\n)### (.*)/g, '$1<span class="changelog-h3">$2</span>');
	text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

	changelogContent.innerHTML = text;

	// Decide if we should show the changelog on startup
	if (StorageManager.data.lastSeenVersion) {
		let bigger = Util.compareVersions(latestVersion, StorageManager.data.lastSeenVersion) > 0;
		if (bigger) {
			// There's a newer version, go show the changes!
			changelogContainer.classList.remove('hidden');
		}
	} else if (Object.keys(StorageManager.data.bestTimes).length > 0) {
		// We assume that if there's at least one local score, the user has interacted with the website to an extent where we can show the changelog.
		changelogContainer.classList.remove('hidden');
	}

	StorageManager.data.lastSeenVersion = latestVersion;
	StorageManager.store();
};

const hideHome = () => {
	homeScreenDiv.classList.add('hidden');
	showChangelogButton.classList.add('hidden');
	showChangelogText.classList.add('hidden');
};

export const showHome = () => {
	homeScreenDiv.classList.remove('hidden');
	showChangelogButton.classList.remove('hidden');
	showChangelogText.classList.remove('hidden');
};