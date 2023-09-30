import { MissionLibrary } from "../mission_library";
import { state } from "../state";
import { BestTimes } from "../storage";
import { Util } from "../util";
import { FinishScreen } from "./finish_screen";
import { Menu } from "./menu";

export const MBP_GOLD_COLOR = 'rgb(255, 204, 0)';
export const MBP_PLATINUM_COLOR = 'rgb(204, 204, 204)';
export const MBP_ULTIMATE_COLOR = 'rgb(255, 221, 34)';

export class MbpFinishScreen extends FinishScreen {
	viewReplayButton = document.querySelector('#mbp-finish-view-replay') as HTMLImageElement;
	timeRows = document.querySelector('#mbp-finish-time-rows') as HTMLDivElement;
	qualifyTimeElement: HTMLElement;
	goldTimeElement: HTMLElement;
	elapsedTimeElement: HTMLElement;
	bonusTimeElement: HTMLElement;
	platinumTimeElement: HTMLSpanElement;
	ultimateTimeElement: HTMLSpanElement;
	nextLevelImage = document.querySelector('#mbp-finish-next-level-image') as HTMLImageElement;
	nextLevelButton = document.querySelector('#mbp-finish-next-level') as HTMLImageElement;

	bestTimeCount = 5;
	scorePlaceholderName = "Matan W.";
	storeNotQualified = true;

	initProperties() {
		this.div = document.querySelector('#mbp-finish-screen');
		this.time = document.querySelector('#mbp-finish-screen-time-time');
		this.message = document.querySelector('#mbp-finish-message');
		this.replayButton = document.querySelector('#mbp-finish-replay');
		this.continueButton = document.querySelector('#mbp-finish-continue');
		this.bestTimeContainer = document.querySelector('#mbp-finish-screen-top-times');

		this.nameEntryScreenDiv = document.querySelector('#mbp-name-entry-screen');
		this.nameEntryText = document.querySelector('#mbp-name-entry-screen > p:nth-child(3)');
		this.nameEntryInput = document.querySelector('#mbp-name-entry-input');
		this.nameEntryButton = this.nameEntryScreenDiv.querySelector('#mbp-name-entry-confirm');
		this.nameEntryButtonSrc = 'endgame/ok';
	}

	constructor(menu: Menu) {
		super(menu);

		menu.setupButton(this.viewReplayButton, 'play/replay', (e) => this.onViewReplayButtonClick(e.altKey));
		Util.onLongTouch(this.viewReplayButton, () => this.onViewReplayButtonClick(true));

		this.qualifyTimeElement = this.createTimeRow('Par Time').children[0] as HTMLSpanElement;
		this.goldTimeElement = this.createTimeRow('Gold Time').children[0] as HTMLSpanElement;
		this.platinumTimeElement = this.createTimeRow('Platinum Time').children[0] as HTMLSpanElement;
		this.ultimateTimeElement = this.createTimeRow('Ultimate Time').children[0] as HTMLSpanElement;
		this.elapsedTimeElement = this.createTimeRow('Time Passed').children[0] as HTMLSpanElement;
		this.bonusTimeElement = this.createTimeRow('Clock Bonuses').children[0] as HTMLSpanElement;

		this.goldTimeElement.parentElement.style.color = 'rgb(255, 204, 0)';
		this.platinumTimeElement.parentElement.style.color = 'rgb(204, 204, 204)';
		this.ultimateTimeElement.parentElement.style.color = 'rgb(255, 221, 34)';
		this.elapsedTimeElement.parentElement.style.marginTop = '20px';

		menu.setupButton(this.nextLevelButton, 'endgame/level_window', () => {
			let nextLevel = this.getNextLevel();
			let levelSelect = state.menu.levelSelect;

			// Exit to level select and immediately load the next level
			this.continueButton.click();
			levelSelect.setMissionArray(nextLevel.array);
			levelSelect.currentMissionIndex = nextLevel.index;
			levelSelect.playCurrentMission();
		}, undefined, undefined, false);
	}

	createTimeRow(label: string) {
		let row = document.createElement('p');
		row.innerHTML = label + ':<span></span>';
		this.timeRows.appendChild(row);

		return row;
	}

	show() {
		super.show();

		let nextLevel = this.getNextLevel();
		let sortedArray = [...nextLevel.array].sort(state.menu.levelSelect.currentSortFn);
		let mission = sortedArray[nextLevel.index];

		this.nextLevelImage.src = mission.getImagePath();
	}

	showMessage(type: 'failed' | 'qualified' | 'gold' | 'ultimate') {
		this.message.style.color = '';

		if (type === 'ultimate') {
			this.message.innerHTML = `You beat the <span style="color: ${MBP_ULTIMATE_COLOR};">Ultimate</span> Time!`;
		} else if (type === 'gold') {
			if (state.level.mission.modification === 'gold') this.message.innerHTML = `You beat the <span style="color: ${MBP_GOLD_COLOR};">Gold</span> Time!`;
			else this.message.innerHTML = `You beat the <span style="color: ${MBP_PLATINUM_COLOR};">Platinum</span> Time!`;
		} else if (type === 'qualified') {
			this.message.innerHTML = "You beat the Par Time!";
		} else {
			this.message.innerHTML = "You didn't pass the Par Time!";
			this.message.style.color = 'rgb(245, 85, 85)';
		}
	}

	updateTimeElements(elapsedTime: number, bonusTime: number) {
		let level = state.level;

		this.time.textContent = Util.secondsToTimeString(level.finishTime.gameplayClock / 1000);
		this.qualifyTimeElement.textContent = isFinite(level.mission.qualifyTime)? Util.secondsToTimeString(level.mission.qualifyTime / 1000) : Util.secondsToTimeString(5999.999);
		Util.monospaceNumbers(this.qualifyTimeElement);

		let goldTime = level.mission.goldTime;
		this.goldTimeElement.parentElement.style.display = 'none';
		this.platinumTimeElement.parentElement.style.display = 'none';

		if (goldTime !== -Infinity) {
			if (level.mission.modification === 'gold') {
				this.goldTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
				this.goldTimeElement.parentElement.style.display = '';
				Util.monospaceNumbers(this.goldTimeElement);
			} else {
				this.platinumTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
				this.platinumTimeElement.parentElement.style.display = '';
				Util.monospaceNumbers(this.platinumTimeElement);
			}
		}

		let ultimateTime = level.mission.ultimateTime;
		this.ultimateTimeElement.parentElement.style.display = 'none';

		if (ultimateTime !== -Infinity) {
			this.ultimateTimeElement.textContent = Util.secondsToTimeString(ultimateTime / 1000);
			this.ultimateTimeElement.parentElement.style.display = '';
			Util.monospaceNumbers(this.ultimateTimeElement);
		}

		this.elapsedTimeElement.textContent = Util.secondsToTimeString(elapsedTime / 1000);
		this.bonusTimeElement.textContent = Util.secondsToTimeString(bonusTime / 1000);
		Util.monospaceNumbers(this.elapsedTimeElement);
		Util.monospaceNumbers(this.bonusTimeElement);
	}

	createBestTimeElement() {
		let div = document.createElement('div');
		return div;
	}

	updateBestTimeElement(element: HTMLDivElement, score: BestTimes[number], rank: number) {
		let goldTime = state.level.mission.goldTime;
		let ultimateTime = state.level.mission.ultimateTime;

		let tmp = document.createElement('div');
		tmp.textContent = Util.secondsToTimeString(score[1] / 1000);
		Util.monospaceNumbers(tmp);
		element.innerHTML = `<div><span>${rank}. </span>${Util.htmlEscape(score[0])}</div><div>${tmp.innerHTML}</div>`;

		element.style.color = '';
		if (score[1] <= goldTime) element.style.color = (state.level.mission.modification === 'gold')? MBP_GOLD_COLOR : MBP_PLATINUM_COLOR;
		if (score[1] <= ultimateTime) element.style.color = MBP_ULTIMATE_COLOR;
	}

	generateNameEntryText(place: number) {
		return `You have the ${['top', 'second top', 'third top', 'fourth top', 'fifth top'][place]} time!`;
	}

	/** Figures out what the next level after this one should be. */
	getNextLevel() {
		let levelSelect = state.menu.levelSelect;
		let currIndex = levelSelect.sortedMissionArray.indexOf(state.level.mission); // Get it like this because the index might have already changed

		if (currIndex < levelSelect.currentMissionArray.length-1) {
			// Just the next level in the current array
			return {
				index: currIndex + 1,
				array: levelSelect.currentMissionArray
			};
		} else {
			if (levelSelect.currentMission.type === 'custom') return {
				// We stay at the last custom level
				index: currIndex,
				array: levelSelect.currentMissionArray
			}; else {
				// Move on to the next mission array
				let next = MissionLibrary.allCategories[MissionLibrary.allCategories.indexOf(levelSelect.currentMissionArray) + 1];

				return {
					index: 0,
					array: next
				};
			}
		}
	}
}