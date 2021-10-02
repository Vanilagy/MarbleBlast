import { AudioManager } from "../audio";
import { Mission } from "../mission";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { MissionLibrary } from "./mission_library";
import { LevelSelect } from "./level_select";
import { Menu } from "./menu";

export class MbgLevelSelect extends LevelSelect {
	hiddenUnlocker: HTMLDivElement;

	initProperties() {
		this.div = document.querySelector('#level-select');
		this.homeButton = document.querySelector('#level-select-home-button');
		this.homeButtonSrc = 'play/back';
		this.tabBeginner = document.querySelector('#tab-beginner') as HTMLImageElement;
		this.tabIntermediate = document.querySelector('#tab-intermediate') as HTMLImageElement;
		this.tabAdvanced = document.querySelector('#tab-advanced') as HTMLImageElement;
		this.tabCustom = document.querySelector('#tab-custom') as HTMLImageElement;
		this.scrollWindow = document.querySelector('#level-select-text-window-scrollable') as HTMLDivElement;
		this.levelTitle = document.querySelector('#level-title') as HTMLParagraphElement;
		this.levelArtist = document.querySelector('#level-artist') as HTMLParagraphElement;
		this.levelDescription = document.querySelector('#level-description') as HTMLParagraphElement;
		this.levelQualifyTime = document.querySelector('#level-qualify-time') as HTMLParagraphElement;
		this.bestTime1 = document.querySelector('#level-select-best-time-1') as HTMLDivElement;
		this.bestTime2 = document.querySelector('#level-select-best-time-2') as HTMLDivElement;
		this.bestTime3 = document.querySelector('#level-select-best-time-3') as HTMLDivElement;
		this.leaderboardLoading = document.querySelector('#online-leaderboard-loading') as HTMLParagraphElement;
		this.leaderboardScores = document.querySelector('#leaderboard-scores') as HTMLDivElement;
		this.levelImage = document.querySelector('#level-image') as HTMLImageElement;
		this.notQualifiedOverlay = document.querySelector('#not-qualified-overlay') as HTMLDivElement;
		this.levelNumberElement = document.querySelector('#level-number') as HTMLParagraphElement;
		this.prevButton = document.querySelector('#level-select-prev') as HTMLImageElement;
		this.playButton = document.querySelector('#level-select-play') as HTMLImageElement;
		this.nextButton = document.querySelector('#level-select-next') as HTMLImageElement;
		this.searchInput = document.querySelector('#search-input') as HTMLInputElement;
		this.newBadge = document.querySelector('#new-badge') as HTMLImageElement;
		this.loadReplayButton = document.querySelector('#load-replay-button') as HTMLImageElement;
		this.shuffleButton = document.querySelector('#shuffle-button') as HTMLImageElement;
		this.hiddenUnlocker = document.querySelector('#hidden-level-unlocker') as HTMLDivElement;
	}

	constructor(menu: Menu) {
		super(menu);

		const setupTab = (element: HTMLImageElement, levels: Mission[]) => {
			element.addEventListener('mousedown', (e) => {
				if (e.button !== 0) return;
				AudioManager.play('buttonpress.wav');
			});
			element.addEventListener('click', (e) => e.button === 0 && this.setMissionArray(levels));
		};
		setupTab(this.tabBeginner, MissionLibrary.goldBeginner);
		setupTab(this.tabIntermediate, MissionLibrary.goldIntermediate);
		setupTab(this.tabAdvanced, MissionLibrary.goldAdvanced);
		setupTab(this.tabCustom, MissionLibrary.goldCustom);

		this.hiddenUnlocker.addEventListener('mousedown', () => {
			// Unlock the current mission if it is the first not-unlocked mission in the selected mission category
			let index = [MissionLibrary.goldBeginner, MissionLibrary.goldIntermediate, MissionLibrary.goldAdvanced].indexOf(this.currentMissionArray);
			if (index === -1) return;

			let unlockedLevels = StorageManager.data.unlockedLevels[index];
			if (this.currentMissionIndex === unlockedLevels) {
				StorageManager.data.unlockedLevels[index]++;
				StorageManager.store();
				this.displayMission();
				AudioManager.play('buttonpress.wav');
			}
		});
	}

	getDefaultMissionIndex() {
		let which = [MissionLibrary.goldBeginner, MissionLibrary.goldIntermediate, MissionLibrary.goldAdvanced, MissionLibrary.goldCustom].indexOf(this.currentMissionArray);

		let index = (StorageManager.data.unlockedLevels[which] ?? 0) - 1;
		index = Util.clamp(index, 0, this.currentMissionArray.length - 1);
		if (which === 3) index = MissionLibrary.goldCustom.length - 1; // Select the last custom level

		return index;
	}

	setMissionArray(arr: Mission[]) {
		super.setMissionArray(arr);

		for (let elem of [this.tabBeginner, this.tabIntermediate, this.tabAdvanced, this.tabCustom]) {
			elem.style.zIndex = "-1";
		}
	
		let index = [MissionLibrary.goldBeginner, MissionLibrary.goldIntermediate, MissionLibrary.goldAdvanced, MissionLibrary.goldCustom].indexOf(this.currentMissionArray);
	
		let elem = [this.tabBeginner, this.tabIntermediate, this.tabAdvanced, this.tabCustom][index];
		elem.style.zIndex = "0";
	}
}