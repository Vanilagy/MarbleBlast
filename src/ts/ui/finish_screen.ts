import { AudioManager } from "../audio";
import { isPressedByGamepad, getPressedFlag, resetPressedFlag } from "../input";
import { Leaderboard } from "../leaderboard";
import { Replay } from "../replay";
import { G } from "../global";
import { BestTimes, StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";

export abstract class FinishScreen {
	div:HTMLDivElement;
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
			G.game.signalRestartIntent();
		});
		menu.setupButton(this.continueButton, 'endgame/continue', () => G.game.stopAndExit());

		menu.setupButton(this.nameEntryButton, this.nameEntryButtonSrc, async () => {
			let trimmed = this.nameEntryInput.value.trim().slice(0, 16);

			if (trimmed.length < 2) {
				G.menu.showAlertPopup('Warning', "Please enter a proper name for usage in the online leaderboard.");
				return;
			}

			if (Util.isNaughty(trimmed)) {
				G.menu.showAlertPopup('Warning', "The name you chose contains words deemed inappropriate. Please do the right thing and choose a non-offensive name.");
				return;
			}

			StorageManager.data.lastUsedName = trimmed;
			StorageManager.store();

			// Store the time and close the dialog.
			let game = G.game;
			let inserted = StorageManager.insertNewTime(game.mission.path, trimmed, 1000 * game.finishState.time);

			this.nameEntryScreenDiv.classList.add('hidden');
			this.div.style.pointerEvents = '';
			this.drawBestTimes();

			if (inserted) {
				// Store the replay
				/* todo
				if (game.replay.mode === 'record' && !game.replay.isInvalid) {
					game.replay.canStore = false;
					let serialized = await game.replay.serialize();
					await StorageManager.databasePut('replays', serialized, inserted.score[2]);
				}*/

				// Submit the score to the leaderboard but only if it's the local top time and qualified
				if (inserted.index === 0 && 1000 * game.finishState.time <= game.mission.qualifyTime)
					Leaderboard.submitBestTime(game.mission.path, inserted.score);
			}
		}, undefined, undefined, G.modification === 'gold');

		window.addEventListener('keydown', (e) => {
			if (!G.game) return;
			if (G.menu !== menu) return;

			if (e.key === 'Enter') {
				if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
					this.nameEntryButton.src = menu.uiAssetPath + this.nameEntryButtonSrc + '_d.png';
				} else if (!this.div.classList.contains('hidden')) {
					this.continueButton.src = menu.uiAssetPath + 'endgame/continue_d.png';
				}
			}
		});
		window.addEventListener('keyup', (e) => {
			if (!G.game) return;
			if (G.menu !== menu) return;

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
		let game = G.game;
		this.div.classList.remove('hidden');

		let time = game.finishState.time;
		let elapsedTime = game.finishState.elapsedTime;

		let bonusTime = Util.roundToMultiple(Math.max(0, elapsedTime - time), 1e-8); // Fix 4999 bullshit
		let failedToQualify = false;

		// Change the message based on having achieve gold time, qualified time or not having qualified.
		if (1000 * time > game.mission.qualifyTime) {
			this.showMessage('failed');
			failedToQualify = true;
		} else if (1000 * time <= game.mission.ultimateTime) {
			this.showMessage('ultimate');
		} else if (1000 * time <= game.mission.goldTime) {
			this.showMessage('gold');
		} else {
			this.showMessage('qualified');
		}

		this.updateTimeElements(elapsedTime, bonusTime, failedToQualify);

		this.drawBestTimes();

		let bestTimes = StorageManager.getBestTimesForMission(game.mission.path, this.bestTimeCount, this.scorePlaceholderName);
		let place = bestTimes.filter(x => x[1] <= 1000 * time).length; // The place is determined by seeing how many scores there currently are faster than the achieved time.

		if (game.type === 'singleplayer' && place < this.bestTimeCount && (!failedToQualify || this.storeNotQualified)) {
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

		if (!failedToQualify && game.mission.type !== 'custom') {
			let levelSelect = G.menu.levelSelect;
			if (levelSelect.currentMission === game.mission) levelSelect.cycleMission(1); // Cycle to that next level, but only if it isn't already selected
		}

		// todo Hide the replay button if the replay's invalid
		//this.viewReplayButton.style.display = game.replay.isInvalid? 'none' : '';
	}

	hide() {
		this.div.classList.add('hidden');
	}

	/** Updates the best times. */
	drawBestTimes() {
		let bestTimes = StorageManager.getBestTimesForMission(G.game.mission.path, this.bestTimeCount, this.scorePlaceholderName);
		for (let i = 0; i < this.bestTimeCount; i++) {
			this.updateBestTimeElement(this.bestTimeContainer.children[i] as HTMLDivElement, bestTimes[i], i+1);
		}
	}

	async onViewReplayButtonClick(download: boolean) {
		let game = G.game;

		// todo

		if (download) {
			let serialized = await game.replay.serialize();
			Replay.download(serialized, game.mission, false);
			if (Util.isTouchDevice && Util.isInFullscreen()) G.menu.showAlertPopup('Downloaded', 'The .wrec has been downloaded.');
		} else {
			let confirmed = await G.menu.showConfirmPopup('Confirm', `Do you want to start the replay for the last playthrough? This can be done only once if this isn't one of your top ${this.bestTimeCount} local scores.`);
			if (!confirmed) return;

			game.replay.mode = 'playback';
			this.replayButton.click();
		}
	}

	handleGamepadInput() {
		// If the finish screen is up, handle those buttons ...
		if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
			if (isPressedByGamepad('jump') && getPressedFlag('jump')) {
				resetPressedFlag('jump');
				this.nameEntryButton.click();
				AudioManager.play('buttonpress.wav');
			}
		} else if (!this.div.classList.contains('hidden')) {
			// Check for buttons
			if (isPressedByGamepad('use') && getPressedFlag('use')) {
				resetPressedFlag('use');
				this.viewReplayButton.click();
				AudioManager.play('buttonpress.wav');
			}
			if (isPressedByGamepad('jump') && getPressedFlag('jump')) {
				resetPressedFlag('jump');
				this.continueButton.click();
				AudioManager.play('buttonpress.wav');
				return;
			}
			if (isPressedByGamepad('restart') && getPressedFlag('restart')) {
				resetPressedFlag('restart');
				this.replayButton.click();
				AudioManager.play('buttonpress.wav');
			}
		}
	}
}