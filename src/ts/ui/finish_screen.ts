import { mainAudioManager } from "../audio";
import { isPressedByGamepad, getPressedFlag, resetPressedFlag } from "../input";
import { Leaderboard } from "../leaderboard";
import { GO_TIME } from "../level";
import { Replay } from "../replay";
import { state } from "../state";
import { BestTimes, StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";

export abstract class FinishScreen {
	div: HTMLDivElement;
	time: HTMLParagraphElement;
	message: HTMLParagraphElement;
	bestTimeContainer: HTMLDivElement;
	replayButton: HTMLImageElement;
	continueButton: HTMLImageElement;
	viewReplayButton: HTMLImageElement;

	nameEntryScreenDiv: HTMLDivElement;
	nameEntryText: HTMLParagraphElement;
	nameEntryInput: HTMLInputElement;
	nameEntryButton: HTMLImageElement;
	nameEntryButtonSrc: string;

	abstract bestTimeCount: number;
	abstract scorePlaceholderName: string;
	abstract storeNotQualified: boolean;

	get showing() {
		return !this.div.classList.contains('hidden');
	}

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.replayButton, 'endgame/replay', () => {
			// Restart the level
			this.div.classList.add('hidden');
			state.level.restart(true);
			if (!Util.isTouchDevice) Util.requestPointerLock();
		});
		menu.setupButton(this.continueButton, 'endgame/continue', () => state.level.stopAndExit());

		menu.setupButton(this.nameEntryButton, this.nameEntryButtonSrc, async () => {
			let trimmed = this.nameEntryInput.value.trim().slice(0, 16);

			if (trimmed.length < 2) {
				state.menu.showAlertPopup('Warning', "Please enter a proper name for usage in the online leaderboard.");
				return;
			}

			if (Util.isNaughty(trimmed)) {
				state.menu.showAlertPopup('Warning', "The name you chose contains words deemed inappropriate. Please do the right thing and choose a non-offensive name.");
				return;
			}

			StorageManager.data.lastUsedName = trimmed;
			StorageManager.store();

			// Store the time and close the dialog.
			let level = state.level;
			let inserted = StorageManager.insertNewTime(level.mission.path, trimmed, level.finishTime.gameplayClock);

			this.nameEntryScreenDiv.classList.add('hidden');
			this.div.style.pointerEvents = '';
			this.drawBestTimes();

			if (inserted) {
				// Store the replay
				if (level.replay.mode === 'record' && !level.replay.isInvalid) {
					level.replay.canStore = false;
					let serialized = await level.replay.serialize();
					await StorageManager.databasePut('replays', serialized, inserted.score[2]);
				}
			}

			// Submit the score to the leaderboard if it's qualified
			if (level.finishTime.gameplayClock <= level.mission.qualifyTime) {
				Leaderboard.submitScore(level.mission.path, inserted.score);
			}
		}, undefined, undefined, state.modification === 'gold');

		window.addEventListener('keydown', (e) => {
			if (!state.level) return;
			if (state.menu !== menu) return;

			if (e.key === 'Enter') {
				if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
					this.nameEntryButton.src = menu.uiAssetPath + this.nameEntryButtonSrc + '_d.png';
				} else if (!this.div.classList.contains('hidden')) {
					this.continueButton.src = menu.uiAssetPath + 'endgame/continue_d.png';
				}
			}
		});
		window.addEventListener('keyup', (e) => {
			if (!state.level) return;
			if (state.menu !== menu) return;

			if (e.key === 'Enter') {
				if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
					this.nameEntryButton.click();
				} else if (!this.div.classList.contains('hidden')) {
					this.continueButton.click();
				}
			}
		});
	}

	async init() {
		for (let i = 0; i < this.bestTimeCount; i++) {
			let element = this.createBestTimeElement();
			this.bestTimeContainer.appendChild(element);
		}
	}

	abstract initProperties(): void;
	abstract showMessage(type: 'failed' | 'qualified' | 'gold' | 'ultimate'): void;
	abstract updateTimeElements(elapsedTime: number, bonusTime: number, failedToQualify: boolean): void;
	abstract createBestTimeElement(): HTMLDivElement;
	abstract updateBestTimeElement(element: HTMLDivElement, score: BestTimes[number], rank: number): void;
	abstract generateNameEntryText(place: number): string;

	show() {
		let level = state.level;
		this.div.classList.remove('hidden');

		let elapsedTime = Math.max(level.finishTime.currentAttemptTime - GO_TIME, 0);
		let bonusTime = Util.roundToMultiple(Math.max(0, elapsedTime - level.finishTime.gameplayClock), 1e-8); // Fix 4999 bullshit
		let failedToQualify = false;

		// Change the message based on having achieve gold time, qualified time or not having qualified.
		if (level.finishTime.gameplayClock > level.mission.qualifyTime) {
			this.showMessage('failed');
			failedToQualify = true;
		} else if (level.finishTime.gameplayClock <= level.mission.ultimateTime) {
			this.showMessage('ultimate');
		} else if (level.finishTime.gameplayClock <= level.mission.goldTime) {
			this.showMessage('gold');
		} else {
			this.showMessage('qualified');
		}

		this.updateTimeElements(elapsedTime, bonusTime, failedToQualify);

		this.drawBestTimes();

		let bestTimes = StorageManager.getBestTimesForMission(level.mission.path, this.bestTimeCount, this.scorePlaceholderName);
		let place = bestTimes.filter((time) => time[1] <= level.finishTime.gameplayClock).length; // The place is determined by seeing how many scores there currently are faster than the achieved time.

		if (place < this.bestTimeCount && (!failedToQualify || this.storeNotQualified)) {
			// Prompt the user to enter their name
			this.nameEntryScreenDiv.classList.remove('hidden');
			this.nameEntryText.textContent = this.generateNameEntryText(place);
			this.nameEntryInput.value = StorageManager.data.lastUsedName;
			this.div.style.pointerEvents = 'none';
			//nameEntryInput.select(); // Don't select, since we want to avoid renames for leaderboard consistency
		} else {
			this.nameEntryScreenDiv.classList.add('hidden');
			this.div.style.pointerEvents = '';
		}

		if (!failedToQualify && level.mission.type !== 'custom') {
			let levelSelect = state.menu.levelSelect;
			if (levelSelect.currentMission === level.mission) levelSelect.cycleMission(1); // Cycle to that next level, but only if it isn't already selected
		}

		// Hide the replay button if the replay's invalid
		this.viewReplayButton.style.display = level.replay.isInvalid? 'none' : '';
	}

	hide() {
		this.div.classList.add('hidden');
	}

	/** Updates the best times. */
	drawBestTimes() {
		let bestTimes = StorageManager.getBestTimesForMission(state.level.mission.path, this.bestTimeCount, this.scorePlaceholderName);
		for (let i = 0; i < this.bestTimeCount; i++) {
			this.updateBestTimeElement(this.bestTimeContainer.children[i] as HTMLDivElement, bestTimes[i], i+1);
		}
	}

	async onViewReplayButtonClick(download: boolean) {
		let level = state.level;

		if (download) {
			let serialized = await level.replay.serialize();
			Replay.download(serialized, level.mission, false);
			if (Util.isTouchDevice && Util.isInFullscreen()) state.menu.showAlertPopup('Downloaded', 'The .wrec has been downloaded.');
		} else {
			let confirmed = await state.menu.showConfirmPopup('Confirm', `Do you want to start the replay for the last playthrough? This can be done only once if this isn't one of your top ${this.bestTimeCount} local scores.`);
			if (!confirmed) return;

			level.replay.mode = 'playback';
			this.replayButton.click();
		}
	}

	handleGamepadInput() {
		// If the finish screen is up, handle those buttons ...
		if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
			if (isPressedByGamepad('jump') && getPressedFlag('jump')) {
				resetPressedFlag('jump');
				this.nameEntryButton.click();
				mainAudioManager.play('buttonpress.wav');
			}
		} else if (!this.div.classList.contains('hidden')) {
			// Check for buttons
			if (isPressedByGamepad('use') && getPressedFlag('use')) {
				resetPressedFlag('use');
				this.viewReplayButton.click();
				mainAudioManager.play('buttonpress.wav');
			}
			if (isPressedByGamepad('jump') && getPressedFlag('jump')) {
				resetPressedFlag('jump');
				this.continueButton.click();
				mainAudioManager.play('buttonpress.wav');
				return;
			}
			if (isPressedByGamepad('restart') && getPressedFlag('restart')) {
				resetPressedFlag('restart');
				this.replayButton.click();
				mainAudioManager.play('buttonpress.wav');
			}
		}
	}
}