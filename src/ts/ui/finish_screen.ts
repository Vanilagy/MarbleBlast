import { AudioManager } from "../audio";
import { isPressedByGamepad, getPressedFlag, resetPressedFlag } from "../input";
import { Leaderboard } from "../leaderboard";
import { GO_TIME } from "../level";
import { Replay } from "../replay";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";

export abstract class FinishScreen {
	div:HTMLDivElement;
	time: HTMLParagraphElement;
	message: HTMLParagraphElement;
	qualifyTimeElement: HTMLParagraphElement;
	goldTimeElement: HTMLParagraphElement;
	elapsedTimeElement: HTMLParagraphElement;
	bonusTimeElement: HTMLParagraphElement;
	bestTime1: HTMLParagraphElement;
	bestTime2: HTMLParagraphElement;
	bestTime3: HTMLParagraphElement;
	replayButton: HTMLImageElement;
	continueButton: HTMLImageElement;
	viewReplayButton: HTMLImageElement;

	nameEntryScreenDiv: HTMLDivElement;
	nameEntryText: HTMLParagraphElement;
	nameEntryInput: HTMLInputElement;
	nameEntryButton: HTMLImageElement;

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.replayButton, 'endgame/replay', () => {
			// Restart the level
			this.div.classList.add('hidden');
			state.currentLevel.restart();
			document.documentElement.requestPointerLock();
		});
		menu.setupButton(this.continueButton, 'endgame/continue', () => state.currentLevel.stopAndExit());
		
		this.viewReplayButton.addEventListener('click', async (e) => {
			if (e.button !== 0) return;
			let level = state.currentLevel;

			if (e.altKey) {
				let serialized = await level.replay.serialize();
				Replay.download(serialized, level.mission, false);
			} else {
				let confirmed = confirm("Do you want to start the replay for the last playthrough? This can be done only once if this isn't one of your top 3 local scores.");
				if (!confirmed) return;
			
				level.replay.mode = 'playback';
				this.replayButton.click();
			}
		});
		this.viewReplayButton.addEventListener('mouseenter', () => AudioManager.play('buttonover.wav'));
		this.viewReplayButton.addEventListener('mousedown', () => AudioManager.play('buttonpress.wav'));

		menu.setupButton(this.nameEntryButton, 'common/ok', async () => {
			let trimmed = this.nameEntryInput.value.trim();
		
			if (trimmed.length < 2) {
				alert("Please enter a proper name for usage in the online leaderboard.");
				return;
			}
		
			if (Util.isNaughty(trimmed)) {
				alert("The name you chose contains words deemed inappropriate. Please do the right thing and choose a non-offensive name.");
				return;
			}
			
			StorageManager.data.lastUsedName = trimmed;
			StorageManager.store();
		
			// Store the time and close the dialog.
			let level = state.currentLevel;
			let inserted = StorageManager.insertNewTime(level.mission.path, trimmed, level.finishTime.gameplayClock);
		
			this.nameEntryScreenDiv.classList.add('hidden');
			this.drawBestTimes();
		
			if (inserted) {
				// Store the replay
				if (level.replay.mode === 'record' && !level.replay.isInvalid) {
					level.replay.canStore = false;
					let serialized = await level.replay.serialize();
					await StorageManager.databasePut('replays', serialized, inserted.score[2]);
				}
		
				if (inserted.index === 0) Leaderboard.submitBestTime(level.mission.path, inserted.score);
			}
		});

		window.addEventListener('keydown', (e) => {
			if (!state.currentLevel) return;
		
			if (e.key === 'Enter') {
				if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
					this.nameEntryButton.src = './assets/ui/common/ok_d.png';
				} else if (!this.div.classList.contains('hidden')) {
					this.continueButton.src = './assets/ui/endgame/continue_d.png';
				}
			}
		});
		window.addEventListener('keyup', (e) => {
			if (!state.currentLevel) return;
		
			if (e.key === 'Enter') {
				if (!this.nameEntryScreenDiv.classList.contains('hidden')) {
					this.nameEntryButton.click();
				} else if (!this.div.classList.contains('hidden')) {
					this.continueButton.click();
				}
			}
		});
	}

	abstract initProperties(): void;

	show() {
		let level = state.currentLevel;
		this.div.classList.remove('hidden');
	
		let elapsedTime = Math.max(level.finishTime.currentAttemptTime - GO_TIME, 0);
		let bonusTime = Math.max(0, elapsedTime - level.finishTime.gameplayClock);
		let goldTime = level.mission.goldTime;
		let failedToQualify = false;
	
		// Change the message based on having achieve gold time, qualified time or not having qualified.
		this.message.style.color = '';
		if (level.finishTime.gameplayClock <= goldTime) {
			this.message.innerHTML = 'You beat the <span style="color: #fff700;">GOLD</span> time!';
		} else {
			if (level.finishTime.gameplayClock <= level.mission.qualifyTime) {
				this.message.innerHTML = "You've qualified!";
			} else {
				this.message.innerHTML = "You failed to qualify!";
				this.message.style.color = 'red';
				failedToQualify = true;
			}
		}
	
		// Update the time elements
		this.time.textContent = Util.secondsToTimeString(level.finishTime.gameplayClock / 1000);
		this.qualifyTimeElement.textContent = isFinite(level.mission.qualifyTime)? Util.secondsToTimeString(level.mission.qualifyTime / 1000) : '99:59.999';
		this.qualifyTimeElement.style.color = failedToQualify? 'red' : '';
		this.qualifyTimeElement.style.textShadow = failedToQualify? '1px 1px 0px black' : '';
		
		this.goldTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
		this.goldTimeElement.parentElement.style.display = level.mission.hasGoldTime? '' : 'none';
		this.elapsedTimeElement.textContent = Util.secondsToTimeString(elapsedTime / 1000);
		this.bonusTimeElement.textContent = Util.secondsToTimeString(bonusTime / 1000);
	
		this.drawBestTimes();
	
		let bestTimes = StorageManager.getBestTimesForMission(level.mission.path, 3, 'Nardo Polo');
		let place = bestTimes.filter((time) => time[1] <= level.finishTime.gameplayClock).length; // The place is determined by seeing how many scores there currently are faster than the achieved time.
	
		if (place <= 2 && !failedToQualify) {
			// Prompt the user to enter their name
			this.nameEntryScreenDiv.classList.remove('hidden');
			this.nameEntryText.textContent = `You got the ${['best', '2nd best', '3rd best'][place]} time!`;
			this.nameEntryInput.value = StorageManager.data.lastUsedName;
			//nameEntryInput.select(); // Don't select, since we want to avoid renames for leaderboard consistency
		} else {
			this.nameEntryScreenDiv.classList.add('hidden');
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
		let level = state.currentLevel;
		let goldTime = level.mission.goldTime;

		let bestTimes = StorageManager.getBestTimesForMission(level.mission.path, 3, 'Nardo Polo');
		this.bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
		this.bestTime1.children[1].textContent = Util.secondsToTimeString(bestTimes[0][1] / 1000);
		(this.bestTime1.children[1] as HTMLParagraphElement).style.color = (bestTimes[0][1] <= goldTime)? '#fff700' : '';
		(this.bestTime1.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[0][1] <= goldTime)? '1px 1px 0px black' : '';
		this.bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
		this.bestTime2.children[1].textContent = Util.secondsToTimeString(bestTimes[1][1] / 1000);
		(this.bestTime2.children[1] as HTMLParagraphElement).style.color = (bestTimes[1][1] <= goldTime)? '#fff700' : '';
		(this.bestTime2.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[1][1] <= goldTime)? '1px 1px 0px black' : '';
		this.bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
		this.bestTime3.children[1].textContent = Util.secondsToTimeString(bestTimes[2][1] / 1000);
		(this.bestTime3.children[1] as HTMLParagraphElement).style.color = (bestTimes[2][1] <= goldTime)? '#fff700' : '';
		(this.bestTime3.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[2][1] <= goldTime)? '1px 1px 0px black' : '';
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