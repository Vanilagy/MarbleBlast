import { mainAudioManager } from "../audio";
import { Mission } from "../mission";
import { BestTimes, StorageManager } from "../storage";
import { Util } from "../util";
import { LevelSelect } from "./level_select";
import { MissionLibrary } from "../mission_library";
import { MBP_GOLD_COLOR, MBP_PLATINUM_COLOR, MBP_ULTIMATE_COLOR } from "./finish_screen_mbp";
import { state } from "../state";
import { MbpMenu } from "./menu_mbp";
import { ResourceManager } from "../resources";

export class MbpLevelSelect extends LevelSelect {
	loadReplayButton = document.querySelector('#mbp-load-replay-button') as HTMLImageElement;
	shuffleButton = document.querySelector('#mbp-shuffle-button') as HTMLImageElement;
	viewToggleButton = document.querySelector('#mbp-level-select-view-toggle') as HTMLImageElement;
	metadataContainer = document.querySelector('#mbp-level-metadata') as HTMLDivElement;
	scoresContainer = document.querySelector('#mbp-level-scores') as HTMLDivElement;
	easterEggIcon = document.querySelector('#mbp-level-select-egg') as HTMLImageElement;

	difficultySelectorCollapsed = document.querySelector('#mbp-difficulty-selector-collapsed') as HTMLImageElement;
	difficultySelectorModificationIcon = document.querySelector('#mbp-difficulty-selector-modification-icon') as HTMLImageElement;
	difficultySelectorWindow = document.querySelector('#mbp-difficulty-selector-window') as HTMLDivElement;
	difficultySelectorContent = document.querySelector('#mbp-difficulty-selector-window > ._content') as HTMLDivElement;

	localScoresCount = 5;
	scorePlaceholderName = "Matan W.";
	scoreElementHeight = 16;

	initProperties() {
		this.div = document.querySelector('#mbp-level-select');
		this.homeButton = document.querySelector('#mbp-level-select-home-button');
		this.homeButtonSrc = 'play/menu';

		this.prevButton = document.querySelector('#mbp-level-select-prev') as HTMLImageElement;
		this.playButton = document.querySelector('#mbp-level-select-play') as HTMLImageElement;
		this.nextButton = document.querySelector('#mbp-level-select-next') as HTMLImageElement;
		this.levelImage = document.querySelector('#mbp-level-image') as HTMLImageElement;
		this.levelTitle = document.querySelector('#mbp-level-title') as HTMLParagraphElement;
		this.levelArtist = document.querySelector('#mbp-level-artist') as HTMLParagraphElement;
		this.levelDescription = document.querySelector('#mbp-level-description') as HTMLParagraphElement;
		this.levelQualifyTime = document.querySelector('#mbp-level-qualify-time') as HTMLParagraphElement;
		this.localBestTimesContainer = document.querySelector('#mbp-level-select-local-best-times') as HTMLDivElement;
		this.leaderboardLoading = document.querySelector('#mbp-online-leaderboard-loading') as HTMLParagraphElement;
		this.leaderboardScores = document.querySelector('#mbp-leaderboard-scores') as HTMLDivElement;
		this.scrollWindow = document.querySelector('#mbp-level-select-text-window') as HTMLDivElement;
		this.searchInput = document.querySelector('#mbp-search-input') as HTMLInputElement;
		this.sortToggleButton = document.querySelector('#mbp-sort-icon') as HTMLImageElement;
	}

	async init() {
		await super.init();

		this.menu.setupVaryingButton(this.difficultySelectorCollapsed, [
			'play/difficulty_beginner', 'play/difficulty_intermediate', 'play/difficulty_advanced', 'play/difficulty_expert', 'play/difficulty_custom'
		], () => {
			if (this.difficultySelectorWindow.classList.contains('hidden')) {
				this.difficultySelectorWindow.classList.remove('hidden');
			} else {
				this.difficultySelectorWindow.classList.add('hidden');
			}
		}, undefined, undefined, false);

		this.createDifficultySection('Gold', './assets/ui_mbp/play/marble_gold.png', [
			{ name: 'Beginner', arr: MissionLibrary.goldBeginner },
			{ name: 'Intermediate', arr: MissionLibrary.goldIntermediate },
			{ name: 'Advanced', arr: MissionLibrary.goldAdvanced },
			{ name: 'Custom', arr: MissionLibrary.goldCustom }
		]);
		this.createDifficultySection('Platinum', './assets/ui_mbp/play/marble_platinum.png', [
			{ name: 'Beginner', arr: MissionLibrary.platinumBeginner },
			{ name: 'Intermediate', arr: MissionLibrary.platinumIntermediate },
			{ name: 'Advanced', arr: MissionLibrary.platinumAdvanced },
			{ name: 'Expert', arr: MissionLibrary.platinumExpert },
			{ name: 'Custom', arr: MissionLibrary.platinumCustom }
		]);
		this.createDifficultySection('Ultra', './assets/ui_mbp/play/marble_ultra.png', [
			{ name: 'Beginner', arr: MissionLibrary.ultraBeginner },
			{ name: 'Intermediate', arr: MissionLibrary.ultraIntermediate },
			{ name: 'Advanced', arr: MissionLibrary.ultraAdvanced },
			{ name: 'Custom', arr: MissionLibrary.ultraCustom }
		]);

		this.difficultySelectorWindow.querySelector('._click-preventer').addEventListener('mousedown', () => {
			mainAudioManager.play('buttonpress.wav');
		});
		this.difficultySelectorWindow.querySelector('._click-preventer').addEventListener('click', () => {
			this.difficultySelectorWindow.classList.add('hidden');
		});

		// Button toggles between metadata and scores screen
		this.menu.setupVaryingButton(this.viewToggleButton, ['mp/play/scoresactive', 'mp/play/settingsactive'], () => {
			if (this.scoresContainer.classList.contains('hidden')) {
				this.metadataContainer.classList.add('hidden');
				this.scoresContainer.classList.remove('hidden');
				this.levelQualifyTime.classList.add('hidden');
				this.scrollWindow.style.height = '';
				this.menu.setButtonVariant(this.viewToggleButton, 1);
				this.viewToggleButton.title = "Show level information";
			} else {
				this.metadataContainer.classList.remove('hidden');
				this.scoresContainer.classList.add('hidden');
				this.levelQualifyTime.classList.remove('hidden');
				this.scrollWindow.style.height = '150px';
				this.menu.setButtonVariant(this.viewToggleButton, 0);
				this.viewToggleButton.title = "Show scores";
			}
		}, undefined, undefined, false);

		this.menu.setupButton(this.loadReplayButton, 'play/replay', (e) => {
			this.showLoadReplayPrompt(e);
		}, undefined, undefined, false);
		this.menu.setupButton(this.shuffleButton, 'search/random', () => {
			this.shuffle();
		}, undefined, undefined, false);

		// Preload images and leaderboards
		for (let category of MissionLibrary.allCategories) {
			this.setMissionArray(category, false); // Make sure to disable the image timeouts so that no funky stuff happens
		}

		// Show a random beginner category at the start
		this.setMissionArray(Util.randomFromArray([MissionLibrary.goldBeginner, MissionLibrary.platinumBeginner, MissionLibrary.ultraBeginner]), false);

		await ResourceManager.loadImages(['play/eggnotfound.png', 'play/eggfound.png', 'play/marble_gold.png', 'play/marble_platinum.png', 'play/marble_ultra.png', 'mp/menu/brown/joined.png', 'mp/menu/brown/divider-orange-joined.png', 'options/textentry.png'].map(x => './assets/ui_mbp/' + x));
	}

	/** Creates a vertical section for the difficulty picker. */
	createDifficultySection(title: string, img: string, difficulties: { name: string, arr?: Mission[] }[]) {
		let div = document.createElement('div');
		let header = document.createElement('p');
		let icon = document.createElement('img');

		div.classList.add('_section');
		div.append(header, icon);

		header.textContent = title;
		icon.src = img;

		for (let difficulty of difficulties) {
			let container = document.createElement('div');
			let nameElement = document.createElement('p');
			let buttonElement = document.createElement('img');

			container.append(nameElement, buttonElement);
			div.append(container);

			nameElement.textContent = difficulty.name;
			this.menu.setupButton(buttonElement, 'play/difficulty_highlight-120', () => {
				this.setMissionArray(difficulty.arr);
				this.difficultySelectorWindow.classList.add('hidden');
			});

			if (!difficulty.arr) {
				container.style.opacity = '0.333';
				container.style.pointerEvents = 'none';
			}
		}

		this.difficultySelectorContent.append(div);
	}

	setMissionArray(arr: Mission[], doImageTimeout?: boolean) {
		super.setMissionArray(arr, doImageTimeout);

		if (arr.length > 0) {
			// Make sure to update the difficulty picker accordingly
			this.menu.setButtonVariant(this.difficultySelectorCollapsed,
				['beginner', 'intermediate', 'advanced', 'expert', 'custom'].indexOf(MissionLibrary.getDifficulty(arr))
			);
			this.difficultySelectorModificationIcon.src = "./assets/ui_mbp/play/" + ((MissionLibrary.getModification(arr) === 'gold')? "marble_gold.png" : (MissionLibrary.getModification(arr) === 'ultra')? "marble_ultra.png" : "marble_platinum.png");
		}

		this.updateBackground();
	}

	displayMetadata() {
		let mission = this.currentMission;

		this.levelTitle.textContent = `#${this.currentMissionIndex+1}: ${mission.title}`;
		this.levelArtist.textContent = 'Author: ' + mission.artist.trim();
		this.levelDescription.textContent = mission.description;
		let qualifyTime = (mission.qualifyTime !== 0)? mission.qualifyTime : Infinity;
		this.levelQualifyTime.innerHTML = `<span style="opacity: 0.8;">${mission.modification === 'gold'? 'Qualify' : 'Par'} Time: </span>` + (isFinite(qualifyTime)? Util.secondsToTimeString(qualifyTime / 1000) : 'N/A');

		if (mission.hasEasterEgg) {
			this.easterEggIcon.classList.remove('hidden');
			this.easterEggIcon.src = StorageManager.data.collectedEggs.includes(mission.path)? './assets/ui_mbp/play/eggfound.png' : './assets/ui_mbp/play/eggnotfound.png';
		} else {
			this.easterEggIcon.classList.add('hidden');
		}
	}

	displayEmptyMetadata() {
		this.levelTitle.innerHTML = '<br>';
		this.levelArtist.innerHTML = '<br>';
		this.levelDescription.innerHTML = '<br>';
		this.levelQualifyTime.innerHTML = '';
		this.easterEggIcon.classList.add('hidden');
	}

	createScoreElement(getReplayData: () => Promise<ArrayBuffer>) {
		let element = document.createElement('div');
		element.classList.add('mbp-level-select-best-time');

		let name = document.createElement('div');
		element.appendChild(name);

		let time = document.createElement('div');
		element.appendChild(time);

		element.appendChild(this.createReplayButton(getReplayData));

		return element;
	}

	getReplayButtonForScoreElement(element: HTMLDivElement): HTMLImageElement {
		return element.children[2] as HTMLImageElement;
	}

	updateScoreElement(element: HTMLDivElement, score: BestTimes[number], rank: number) {
		element.children[0].innerHTML = `<span>${rank}.</span> ${Util.htmlEscape(score[0])}`;
		element.children[1].textContent = Util.secondsToTimeString(score[1] / 1000);
		Util.monospaceNumbers(element.children[1]);

		element.style.color = '';
		if (!this.currentMission) return;

		if (score[1] <= this.currentMission.goldTime) element.style.color = (this.currentMission.modification === 'gold')? MBP_GOLD_COLOR : MBP_PLATINUM_COLOR;
		if (score[1] <= this.currentMission.ultimateTime) element.style.color = MBP_ULTIMATE_COLOR;
	}

	show() {
		super.show();
		this.updateBackground();
	}

	/** Sets the background image based on the modification. */
	updateBackground() {
		let arr = this.currentMissionArray;
		state.menu.backgroundImage.src =
			(MissionLibrary.getModification(arr) === 'gold')? (state.menu as MbpMenu).mbgBg :
			(MissionLibrary.getModification(arr) === 'ultra')? (state.menu as MbpMenu).mbuBg :
			(state.menu as MbpMenu).mbpBg;
	}
}