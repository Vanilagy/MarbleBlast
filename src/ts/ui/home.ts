import { Leaderboard } from "../leaderboard";
import { ResourceManager } from "../resources";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";

export abstract class HomeScreen {
	div: HTMLDivElement;
	playButton: HTMLImageElement;
	optionsButton: HTMLImageElement;
	helpButton: HTMLImageElement;
	exitButton: HTMLImageElement;
	showChangelogButton: HTMLImageElement;
	showChangelogText: HTMLParagraphElement;
	changelogContainer: HTMLDivElement;
	changelogBackButton: HTMLImageElement;
	changelogContent: HTMLDivElement;
	version: HTMLParagraphElement;

	playSrc: string;
	optionsSrc: string;
	helpSrc: string;
	exitSrc: string;

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.playButton, this.playSrc, () => {
			// Show the level select
			//hideHome();
			//levelSelectDiv.classList.remove('hidden');
			//hiddenUnlocker.classList.remove('hidden');

			this.hide();
			menu.levelSelect.show();
		
			Leaderboard.syncLeaderboard();
		});
		menu.setupButton(this.helpButton, this.helpSrc, () => {
			// Show the help screen
			this.hide();
			menu.helpScreen.show();
		});
		menu.setupButton(this.optionsButton, this.optionsSrc, () => {
			// Show the options screen
			this.hide();
			menu.optionsScreen.show();
		});
		menu.setupButton(this.exitButton, this.exitSrc, () => {}); // JavaScript can't close its own tab, so... don't do anything.
	}

	abstract initProperties(): void;

	show() {
		this.div.classList.remove('hidden');
		this.showChangelogButton.classList.remove('hidden');
		this.showChangelogText.classList.remove('hidden');
	}

	hide() {
		this.div.classList.add('hidden');
		this.showChangelogButton.classList.add('hidden');
		this.showChangelogText.classList.add('hidden');
	}

	async init() {
		// Fetch and display the version history
		let blob = await ResourceManager.loadResource('/api/version_history');
		let text = await ResourceManager.readBlobAsText(blob);

		let latestVersion = /(^|\n)## (\d+\.\d+\.\d+)/.exec(text)[2];
		this.version.textContent = `MBGW v${latestVersion}`;

		// Cheap conversion from markdown to HTML here
		text = text.replace(/(^|\n)# (.*)/g, '$1<span class="changelog-h1">$2</span>');
		text = text.replace(/(^|\n)## (.*)/g, '$1<span class="changelog-h2">$2</span>');
		text = text.replace(/(^|\n)### (.*)/g, '$1<span class="changelog-h3">$2</span>');
		text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

		this.changelogContent.innerHTML = text;

		// Decide if we should show the changelog on startup
		if (StorageManager.data.lastSeenVersion) {
			let bigger = Util.compareVersions(latestVersion, StorageManager.data.lastSeenVersion) > 0;
			if (bigger) {
				// There's a newer version, go show the changes!
				this.changelogContainer.classList.remove('hidden');
			}
		} else if (Object.keys(StorageManager.data.bestTimes).length > 0) {
			// We assume that if there's at least one local score, the user has interacted with the website to an extent where we can show the changelog.
			this.changelogContainer.classList.remove('hidden');
		}

		StorageManager.data.lastSeenVersion = latestVersion;
		StorageManager.store();
	}
}