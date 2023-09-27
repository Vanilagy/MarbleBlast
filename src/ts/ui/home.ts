import { Leaderboard } from "../leaderboard";
import { ResourceManager } from "../resources";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";
import { setMenu } from "./menu_setter";

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
	showChangelogSrc: string;
	changelogBackSrc: string;

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.playButton, this.playSrc, () => {
			// Show the level select
			this.hide();
			menu.levelSelect.show();
			Leaderboard.syncLeaderboard();
		});
		menu.setupButton(this.helpButton, this.helpSrc, () => {
			// Show the help screen
			this.hide();
			menu.helpScreen.show();
		}, undefined, undefined, state.modification === 'gold');
		menu.setupButton(this.optionsButton, this.optionsSrc, () => {
			// Show the options screen
			this.hide();
			menu.optionsScreen.show();
		});
		menu.setupButton(this.exitButton, this.exitSrc, () => {
			window.close(); // Won't work unless PWA
			if (!location.search.includes('app')) location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Internet veterans will recognize this link
		});

		menu.setupButton(this.showChangelogButton, this.showChangelogSrc, () => {
			this.changelogContainer.classList.remove('hidden');
		}, undefined, undefined, state.modification === 'gold');
		menu.setupButton(this.changelogBackButton, this.changelogBackSrc, () => {
			this.changelogContainer.classList.add('hidden');
		});

		this.div.querySelector('.modification-switcher').addEventListener('click', () => {
			setMenu((state.modification === 'gold')? 'platinum' : 'gold');
		});
	}

	abstract initProperties(): void;

	show() {
		this.div.classList.remove('hidden');
	}

	hide() {
		this.div.classList.add('hidden');
	}

	async init() {
		// Fetch and display the version history
		let blob = await ResourceManager.loadResource('/api/version_history');
		let text = await ResourceManager.readBlobAsText(blob);

		let latestVersion = /(^|\n)## (\d+\.\d+\.\d+)/.exec(text)[2];
		this.version.textContent = `MBW v${latestVersion}`;
		if (Util.isTouchDevice) {
			// Make sure it's not occluded by rounded corners
			this.version.style.left = '15px';
			this.version.style.bottom = '15px';
		}

		let classPrefix = (state.modification === 'gold')? 'changelog' : 'mbp-changelog';
		// Cheap conversion from markdown to HTML here
		text = text.replace(/(^|\n)# (.*)/g, `$1<span class="${classPrefix}-h1">$2</span>`);
		text = text.replace(/(^|\n)## (.*)/g, `$1<span class="${classPrefix}-h2">$2</span>`);
		text = text.replace(/(^|\n)### (.*)/g, `$1<span class="${classPrefix}-h3">$2</span>`);
		text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
		text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

		this.changelogContent.innerHTML = text;

		// Decide if we should show the changelog on startup
		if (StorageManager.data.lastSeenVersion) {
			//let bigger = Util.compareVersions(latestVersion, StorageManager.data.lastSeenVersion) > 0;
			let different = latestVersion !== StorageManager.data.lastSeenVersion;
			if (different) {
				// There's a newer version, go show the changes!
				this.changelogContainer.classList.remove('hidden');
				await StorageManager.onVersionUpgrade(StorageManager.data.lastSeenVersion);
			}
		} else if (Object.keys(StorageManager.data.bestTimes).length > 0 || StorageManager.hadOldDatabase) {
			// We assume that if there's at least one local score, the user has interacted with the website to an extent where we can show the changelog.
			this.changelogContainer.classList.remove('hidden');
		}

		StorageManager.data.lastSeenVersion = latestVersion;
		StorageManager.store();
	}
}