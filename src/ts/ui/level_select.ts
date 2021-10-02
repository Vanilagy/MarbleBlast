import { AudioManager } from "../audio";
import { ResourceManager } from "../resources";
import { Util } from "../util";
import { StorageManager } from "../storage";
import { Mission } from "../mission";
import { Replay } from "../replay";
import { previousButtonState } from "../input";
import { getRandomId } from "../state";
import { Leaderboard } from "../leaderboard";
import { Menu } from "./menu";
import { MissionLibrary } from "./mission_library";

export abstract class LevelSelect {
	menu: Menu;
	div: HTMLDivElement;
	homeButton: HTMLImageElement;
	homeButtonSrc: string;
	tabBeginner: HTMLImageElement;
	tabIntermediate: HTMLImageElement;
	tabAdvanced: HTMLImageElement;
	tabCustom: HTMLImageElement;
	scrollWindow: HTMLDivElement;
	levelTitle: HTMLParagraphElement;
	levelArtist: HTMLParagraphElement;
	levelDescription: HTMLParagraphElement;
	levelQualifyTime: HTMLParagraphElement;
	bestTime1: HTMLDivElement;
	bestTime2: HTMLDivElement;
	bestTime3: HTMLDivElement;
	leaderboardLoading: HTMLParagraphElement;
	leaderboardScores: HTMLDivElement;
	levelImage: HTMLImageElement;
	notQualifiedOverlay: HTMLDivElement;
	levelNumberElement: HTMLParagraphElement;
	prevButton: HTMLImageElement;
	playButton: HTMLImageElement;
	nextButton: HTMLImageElement;
	searchInput: HTMLInputElement;
	newBadge: HTMLImageElement;
	loadReplayButton: HTMLImageElement;
	shuffleButton: HTMLImageElement;

	setImagesTimeout: number = null;
	clearImageTimeout: number = null;
	/** The current words in the search query. Used for matching. */
	currentQueryWords: string[] = [];
	lastDisplayBestTimesId: string; // Used to prevent some async issues

	currentMissionArray: Mission[];
	currentMissionIndex: number;
	get currentMission() { return this.currentMissionArray?.[this.currentMissionIndex]; }

	constructor(menu: Menu) {
		this.menu = menu;
		this.initProperties();

		menu.setupButton(this.homeButton, this.homeButtonSrc, () => {
			this.hide();
			menu.home.show();
		});

		menu.setupButton(this.prevButton, 'play/prev', () => this.cycleMission(-1), true, true);
		menu.setupButton(this.playButton, 'play/play', () => this.playCurrentMission(), true);
		menu.setupButton(this.nextButton, 'play/next', () => this.cycleMission(1), true, true);
	}

	abstract initProperties(): void;

	init() {
		for (let elem of [this.bestTime1.children[3], this.bestTime2.children[3], this.bestTime3.children[3]]) {
			let replayButton = elem as HTMLImageElement;
			replayButton.addEventListener('click', async (e) => {
				if (e.button !== 0) return;
				let mission = this.currentMission;
				if (!mission) return;

				let attr = replayButton.getAttribute('data-score-id');
				if (!attr) return;

				let replayData = await StorageManager.databaseGet('replays', attr);
				if (!replayData) return;

				if (!e.altKey) {
					this.playCurrentMission(replayData);
				} else {
					Replay.download(replayData, mission);
				}
			});

			replayButton.addEventListener('mouseenter', () => {
				AudioManager.play('buttonover.wav');
			});
			replayButton.addEventListener('mousedown', (e) => {
				if (e.button === 0) AudioManager.play('buttonpress.wav');
			});
		}

		// Create the elements for the online leaderboard (will be reused)
		for (let i = 0; i < 18; i++) {
			let element = document.createElement('div');
			element.classList.add('level-select-best-time');

			let name = document.createElement('div');
			element.appendChild(name);

			let img = document.createElement('img');
			img.src = "./assets/ui/play/goldscore.png";
			element.appendChild(img);

			let time = document.createElement('div');
			element.appendChild(time);

			this.leaderboardScores.appendChild(element);
		}

		this.scrollWindow.addEventListener('scroll', () => this.updateOnlineLeaderboard());

		window.addEventListener('keydown', (e) => {
			if (this.div.classList.contains('hidden')) return;
		
			if (e.code === 'ArrowLeft') {
				this.cycleMission(-1);
				if (!this.prevButton.style.pointerEvents) this.prevButton.src = './assets/ui/play/prev_d.png';
			} else if (e.code === 'ArrowRight') {
				this.cycleMission(1);
				if (!this.nextButton.style.pointerEvents) this.nextButton.src = './assets/ui/play/next_d.png';
			} else if (e.code === 'Escape') {
				this.homeButton.src = './assets/ui/play/back_d.png';
			}
		});
		
		window.addEventListener('keyup', (e) => {
			if (this.div.classList.contains('hidden')) return;
		
			if (e.code === 'ArrowLeft') {
				if (!this.prevButton.style.pointerEvents) this.prevButton.src = this.prevButton.hasAttribute('data-hovered')? './assets/ui/play/prev_h.png' : './assets/ui/play/prev_n.png';
			} else if (e.code === 'ArrowRight') {
				if (!this.nextButton.style.pointerEvents) this.nextButton.src = this.nextButton.hasAttribute('data-hovered')? './assets/ui/play/next_h.png' : './assets/ui/play/next_n.png';
			} else if (e.code === 'Escape') {
				this.homeButton.click();
			}
		});

		this.searchInput.addEventListener('input', () => {
			this.onSearchInputChange();
		});
		this.searchInput.addEventListener('focus', () => {
			// Clear the search when focused
			this.searchInput.value = '';
			this.onSearchInputChange();
		});

		this.loadReplayButton.addEventListener('click', async (e) => {
			// Show a file picker
			let fileInput = document.createElement('input');
			fileInput.setAttribute('type', 'file');
			fileInput.setAttribute('accept', ".wrec");
		
			fileInput.onchange = async () => {
				try {
					let file = fileInput.files[0];
					let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(file);
					let replay = Replay.fromSerialized(arrayBuffer);
		
					let mission = [...MissionLibrary.goldBeginner, ...MissionLibrary.goldIntermediate, ...MissionLibrary.goldAdvanced, ...MissionLibrary.goldCustom].find(x => x.path === replay.missionPath);
					if (!mission) throw new Error("Mission not found.");
		
					this.div.classList.add('hidden');
					this.menu.loadingScreen.loadLevel(mission, () => replay);
				} catch (e) {
					alert("There was an error loading the replay.");
					console.error(e);
				}
			};
			fileInput.click();
		});
		
		this.loadReplayButton.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		this.loadReplayButton.addEventListener('mousedown', (e) => {
			if (e.button === 0) AudioManager.play('buttonpress.wav');
		});

		this.shuffleButton.addEventListener('click', () => {
			if (this.currentMissionArray.length <= 1) return;
		
			// Find a random mission that isn't the current one
			let nextIndex = this.currentMissionIndex;
			while (nextIndex === this.currentMissionIndex) {
				nextIndex = Math.floor(Util.popRandomNumber() * this.currentMissionArray.length);
			}
		
			this.currentMissionIndex = nextIndex;
			this.displayMission();
		});
		this.shuffleButton.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		this.shuffleButton.addEventListener('mousedown', (e) => {
			if (e.button === 0) AudioManager.play('buttonpress.wav');
		});

		// Preload images and leaderboards
		this.setMissionArray(MissionLibrary.goldCustom, false); // Make sure to disable the image timeouts so that no funky stuff happens
		this.setMissionArray(MissionLibrary.goldAdvanced, false);
		this.setMissionArray(MissionLibrary.goldIntermediate, false);
		this.setMissionArray(MissionLibrary.goldBeginner, false);
	}

	show() {
		this.div.classList.remove('hidden');
	}

	hide() {
		this.div.classList.add('hidden');
	}

	setMissionArray(arr: Mission[], doImageTimeout = true) {
		this.currentMissionArray = arr;
		this.currentMissionIndex = this.getDefaultMissionIndex();

		this.selectBasedOnSearchQuery(false);
		this.displayMission(doImageTimeout);
	}

	abstract getDefaultMissionIndex(): number;

	displayMission(doImageTimeout = true) {
		let mission = this.currentMission;

		if (!mission) {
			// There is no mission (likely custom tab), so hide most information.

			this.notQualifiedOverlay.style.display = 'block';
			this.levelImage.style.display = 'none';
			this.levelTitle.innerHTML = '<br>';
			this.levelArtist.style.display = 'none';
			this.levelDescription.innerHTML = '<br>';
			this.levelQualifyTime.innerHTML = '';
			this.levelNumberElement.textContent = `Level ${this.currentMissionIndex + 1}`;
			this.playButton.src = './assets/ui/play/play_i.png';
			this.playButton.style.pointerEvents = 'none';
			this.newBadge.style.display = 'none';
			this.displayBestTimes();
		} else {
			// Reenable the play button if it was disabled
			if (this.playButton.style.pointerEvents === 'none') {
				this.playButton.src = './assets/ui/play/play_n.png';
				this.playButton.style.pointerEvents = '';
			}

			// Show or hide the "Not Qualified!" notice depending on the level unlocked state.
			if (false /*unlockedLevels <= currentLevelIndex*/) {
				this.notQualifiedOverlay.style.display = 'block';
				this.playButton.src = './assets/ui/play/play_i.png';
				this.playButton.style.pointerEvents = 'none';
			} else {
				this.notQualifiedOverlay.style.display = 'none';
				this.playButton.src = './assets/ui/play/play_n.png';
				this.playButton.style.pointerEvents = '';
			}

			this.levelImage.style.display = '';
		
			// Display metadata
			this.levelTitle.textContent = mission.title;
			this.levelArtist.textContent = 'by ' + mission.artist.trim();
			this.levelArtist.style.display = (mission.type === 'custom')? 'block' : 'none'; // Only show the artist for custom levels
			this.levelDescription.textContent = mission.description;
			let qualifyTime = (mission.qualifyTime !== 0)? mission.qualifyTime : Infinity;
			this.levelQualifyTime.textContent = isFinite(qualifyTime)? "Time to Qualify: " + Util.secondsToTimeString(qualifyTime / 1000) : '';

			// Display best times
			this.displayBestTimes();

			if (!this.clearImageTimeout) this.clearImageTimeout = setTimeout(() => this.levelImage.src = '', 16) as any as number; // Clear the image after a very short time (if no image is loaded 'til then)

			this.levelNumberElement.textContent = `${Util.uppercaseFirstLetter(mission.type)} Level ${this.currentMissionIndex + 1}`;
			this.newBadge.style.display = mission.isNew? 'block' : 'none';
		}

		this.setImages(false, doImageTimeout);
		this.updateNextPrevButtons();
		Leaderboard.loadLocal();
	}

	playCurrentMission(replayData?: ArrayBuffer) {
		let currentMission = this.currentMission;
		if (!currentMission) return;
	
		this.div.classList.add('hidden');
		this.menu.loadingScreen.loadLevel(currentMission, replayData? () => Replay.fromSerialized(replayData) : undefined); // Initiate level loading
	}

	/** Advance the current mission index by the specified count while respecting the search query. That count can be negative. */
	cycleMission(direction: number) {
		let index = this.getCycleMissionIndex(direction);
		if (index === null || index === this.currentMissionIndex) return;

		this.currentMissionIndex = index;
		this.displayMission();
	}

	/** Gets the mission index you would get by skipping a certain amount forwards/backwards while respecting the search query. Returns null if the index would peek outside of the current mission array. */
	getCycleMissionIndex(direction: number) {
		if (direction === 0) return this.currentMissionIndex;

		for (let i = this.currentMissionIndex + Math.sign(direction); i >= 0 && i < this.currentMissionArray.length; i += Math.sign(direction)) {
			if (this.currentMissionArray[i].matchesSearch(this.currentQueryWords)) direction = Math.sign(direction) * (Math.abs(direction) - 1);
			if (direction === 0) return i;
		}

		return null;
	}

	/** Returns true if there is a next mission to go to. */
	canGoNext() {
		let canGoNext = false;
		for (let i = this.currentMissionIndex + 1; i < this.currentMissionArray.length; i++) {
			if (this.currentMissionArray[i].matchesSearch(this.currentQueryWords)) {
				canGoNext = true;
				break;
			}
		}
	
		return canGoNext;
	}
	
	/** Returns true if there is a previous mission to go back to. */
	canGoPrev() {
		let canGoPrev = false;
		for (let i = this.currentMissionIndex - 1; i >= 0; i--) {
			if (this.currentMissionArray[i].matchesSearch(this.currentQueryWords)) {
				canGoPrev = true;
				break;
			}
		}
	
		return canGoPrev;
	}
	
	updateNextPrevButtons() {
		// Enable or disable the next button based on if there are still missions to come
		if (!this.canGoNext()) {
			this.nextButton.src = './assets/ui/play/next_i.png';
			this.nextButton.style.pointerEvents = 'none';
		} else {
			if (this.nextButton.src.endsWith('i.png')) this.nextButton.src = './assets/ui/play/next_n.png';
			this.nextButton.style.pointerEvents = '';
		}
	
		// Enable or disable the prev button based on if there are still missions to come
		if (!this.canGoPrev()) {
			this.prevButton.src = './assets/ui/play/prev_i.png';
			this.prevButton.style.pointerEvents = 'none';
		} else {
			if (this.prevButton.src.endsWith('i.png')) this.prevButton.src = './assets/ui/play/prev_n.png';
			this.prevButton.style.pointerEvents = '';
		}
	}

	setImages(fromTimeout = false, doTimeout = true) {
		if (fromTimeout) {
			// We come from a timeout, so clear it
			clearTimeout(this.setImagesTimeout);	
			this.setImagesTimeout = null;
		}
	
		if (this.setImagesTimeout !== null && doTimeout) {
			// There is currently a timeout ongoing; reset the timer and return.
			clearTimeout(this.setImagesTimeout);
			this.setImagesTimeout = setTimeout(() => this.setImages(true), 75) as any as number;
			return;
		}
	
		// List of missions whose image should be loaded
		let toLoad = new Set<Mission>();
	
		// Preload the neighboring-mission images for faster flicking between missions without having to wait for images to load.
		for (let i = 0; i <= 10; i++) {
			let index = this.getCycleMissionIndex(Math.ceil(i / 2) * ((i % 2)? 1 : -1)); // Go in an outward spiral pattern, but only visit the missions that match the current search
			let mission = this.currentMissionArray[index];
			if (!mission) continue;
	
			toLoad.add(mission);
		}
	
		// Preload the next shuffled missions
		for (let mission of this.getNextShuffledMissions()) toLoad.add(mission);
	
		for (let mission of toLoad) {
			let imagePath = mission.getImagePath();
			let start = performance.now();
	
			ResourceManager.loadResource(imagePath).then(async blob => {
				if (!blob) return;
	
				if (mission === this.currentMission) {
					// Show the thumbnail if the mission is the same
					let dataUrl = await ResourceManager.readBlobAsDataUrl(blob);
					if (mission === this.currentMission) {
						clearTimeout(this.clearImageTimeout);
						this.clearImageTimeout = null;
						this.levelImage.src = dataUrl;
					}
				}
	
				let elapsed = performance.now() - start;
				if (elapsed > 75 && !this.setImagesTimeout && doTimeout) {
					// If the image took too long to load, set a timeout to prevent spamming requests.
					this.setImagesTimeout = setTimeout(() => this.setImages(true), 75) as any as number;
				}
			});
		}
	}
	
	/** Returns the next few missions that would be selected by repeating pressing of the shuffle button. */
	getNextShuffledMissions() {
		let missions: Mission[] = [];

		if (this.currentMissionArray.length > 1) {
			let lastIndex = this.currentMissionIndex;
			let i = 0;
			let count = 0;
			while (count < 5) {
				let randomNumber = Util.peekRandomNumber(i++);
				let nextIndex = Math.floor(randomNumber * this.currentMissionArray.length);

				if (lastIndex !== nextIndex) {
					let mission = this.currentMissionArray[nextIndex];
					missions.push(mission);
					count++;
				}

				lastIndex = nextIndex;
			}
		}

		return missions;
	}

	displayBestTimes() {
		let mission = this.currentMission;
		let goldTime = 0;
		let randomId = getRandomId();
		this.lastDisplayBestTimesId = randomId;
	
		if (mission) goldTime = mission.goldTime;
	
		const updateReplayButton = async (bestTimeIndex: number) => {
			let bestTime = bestTimes[bestTimeIndex];
			let element = [this.bestTime1, this.bestTime2, this.bestTime3][bestTimeIndex].children[3] as HTMLImageElement;
			element.style.display = 'none';
			element.removeAttribute('data-score-id');
			if (!bestTime[2]) return;
	
			let count = await StorageManager.databaseCount('replays', bestTime[2]);
			if (randomId === this.lastDisplayBestTimesId && count > 0) {
				element.style.display = 'block';
				element.setAttribute('data-score-id', bestTime[2]);
			}
		};
	
		let bestTimes = StorageManager.getBestTimesForMission(mission?.path);
		this.bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
		(this.bestTime1.children[1] as HTMLImageElement).style.opacity = (bestTimes[0][1] <= goldTime)? '' : '0';
		this.bestTime1.children[2].textContent = Util.secondsToTimeString(bestTimes[0][1] / 1000);
		updateReplayButton(0);
		this.bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
		(this.bestTime2.children[1] as HTMLImageElement).style.opacity = (bestTimes[1][1] <= goldTime)? '' : '0';
		this.bestTime2.children[2].textContent = Util.secondsToTimeString(bestTimes[1][1] / 1000);
		updateReplayButton(1);
		this.bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
		(this.bestTime3.children[1] as HTMLImageElement).style.opacity = (bestTimes[2][1] <= goldTime)? '' : '0';
		this.bestTime3.children[2].textContent = Util.secondsToTimeString(bestTimes[2][1] / 1000);
		updateReplayButton(2);
	
		this.leaderboardLoading.style.display = Leaderboard.isLoading(mission.path)? 'block' : 'none';
	
		this.updateOnlineLeaderboard();
	}

	/** Updates the elements in the online leaderboard. Updates only the visible elements and adds padding to increase performance. */
	updateOnlineLeaderboard() {
		let mission = this.currentMission;
		let onlineScores = Leaderboard.scores.get(mission.path) ?? [];
		let goldTime = mission.goldTime;
		let elements = this.leaderboardScores.children;
		let index = 0;

		// Reset styling
		this.leaderboardScores.style.paddingTop = '0px';
		this.leaderboardScores.style.paddingBottom = '0px';
		(elements[index] as HTMLDivElement).style.display = 'block';

		// Get the y of the top element
		let currentY = (elements[0] as HTMLDivElement).offsetTop - this.scrollWindow.scrollTop;

		this.leaderboardScores.style.height = onlineScores.length * 14 + 'px';

		// As long as the top element is out of view, move to the next one. By doing this, we find the first element that's in view (from the top)
		while (currentY < -14 && index < onlineScores.length) {
			index++;
			currentY += 14;
		}

		// Add padding to the top according to how many elements we've already passed at the top
		this.leaderboardScores.style.paddingTop = index * 14 + 'px';

		for (let i = 0; i < elements.length; i++) {
			let element = elements[i] as HTMLDivElement;

			if (index < onlineScores.length) {
				// If there's a score, apply it to the current element
				let score = onlineScores[index];
				element.style.display = 'block';
				element.children[0].textContent = (index + 1) + '. ' + score[0];
				(element.children[1] as HTMLImageElement).style.opacity = (score[1] <= goldTime)? '' : '0';
				element.children[2].textContent = Util.secondsToTimeString(score[1] / 1000, 3);
			} else {
				// Hide the element otherwise
				element.style.display = 'none';
			}

			index++;
		}

		// Add padding to the bottom according to how many scores there are still left
		this.leaderboardScores.style.paddingBottom = Math.max(onlineScores.length - index, 0) * 12 + 'px';
	}

	onSearchInputChange() {
		// Normalize the search string and split it into words
		let str = Util.removeSpecialCharacters(Util.normalizeString(this.searchInput.value)).toLowerCase();
		this.currentQueryWords = str.split(' ');
		if (!str) this.currentQueryWords.length = 0;
	
		this.selectBasedOnSearchQuery();
		this.updateNextPrevButtons();
	}
	
	/** Selects a valid mission based on the current search query. */
	selectBasedOnSearchQuery(display = true) {
		// Check if the current mission already matches the search. In that case, don't do anything.
		if (this.currentMission?.matchesSearch(this.currentQueryWords)) return;
	
		// Find the first matching mission
		for (let i = 0; i < this.currentMissionArray.length; i++) {
			let mis = this.currentMissionArray[i];
			if (mis.matchesSearch(this.currentQueryWords)) {
				this.currentMissionIndex = i;
				if (display) this.displayMission();
				break;
			}
		}
	}

	handleControllerInput(gamepad: Gamepad) {
		// A button to play
		if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
			this.playCurrentMission();
			AudioManager.play('buttonpress.wav');
		}
		// LT, RT to change category
		if (gamepad.buttons[6].value > 0.5 && !previousButtonState[6]) {
			// Should probably have a function for this tbh
			if (this.currentMissionArray === MissionLibrary.goldIntermediate)
				this.setMissionArray(MissionLibrary.goldBeginner);
			else if (this.currentMissionArray === MissionLibrary.goldAdvanced)
				this.setMissionArray(MissionLibrary.goldIntermediate);
			else if (this.currentMissionArray === MissionLibrary.goldCustom)
				this.setMissionArray(MissionLibrary.goldAdvanced);
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[7].value > 0.5 && !previousButtonState[7]) {
			// Should probably have a function for this tbh
			if (this.currentMissionArray === MissionLibrary.goldBeginner)
				this.setMissionArray(MissionLibrary.goldIntermediate);
			else if (this.currentMissionArray === MissionLibrary.goldIntermediate)
				this.setMissionArray(MissionLibrary.goldAdvanced);
			else if (this.currentMissionArray === MissionLibrary.goldAdvanced)
				this.setMissionArray(MissionLibrary.goldCustom);
			AudioManager.play('buttonpress.wav');
		}
		// D-pad left+right to change missions
		if (gamepad.buttons[14].value > 0.5 && !previousButtonState[14]) {
			this.cycleMission(-1);
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[15].value > 0.5 && !previousButtonState[15]) {
			this.cycleMission(1);
			AudioManager.play('buttonpress.wav');
		}
	}
}