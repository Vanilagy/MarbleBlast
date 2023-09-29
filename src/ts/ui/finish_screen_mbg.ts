import { mainAudioManager } from "../audio";
import { state } from "../state";
import { BestTimes } from "../storage";
import { Util } from "../util";
import { FinishScreen } from "./finish_screen";
import { Menu } from "./menu";

export class MbgFinishScreen extends FinishScreen {
	viewReplayButton = document.querySelector('#finish-view-replay') as HTMLImageElement;
	qualifyTimeElement: HTMLElement;
	goldTimeElement: HTMLElement;
	elapsedTimeElement: HTMLElement;
	bonusTimeElement: HTMLElement;

	bestTimeCount = 3;
	scorePlaceholderName = "Nardo Polo";
	storeNotQualified = false;

	initProperties() {
		this.div = document.querySelector('#finish-screen');
		this.time = document.querySelector('#finish-screen-time-time');
		this.message = document.querySelector('#finish-message');
		this.qualifyTimeElement = document.querySelector('#finish-qualify-time');
		this.goldTimeElement = document.querySelector('#finish-gold-time');
		this.elapsedTimeElement = document.querySelector('#finish-elapsed-time');
		this.bonusTimeElement = document.querySelector('#finish-bonus-time');
		this.replayButton = document.querySelector('#finish-replay');
		this.continueButton = document.querySelector('#finish-continue');
		this.bestTimeContainer = document.querySelector('#finish-best-times');

		this.nameEntryScreenDiv = document.querySelector('#name-entry-screen');
		this.nameEntryText = document.querySelector('#name-entry-screen > p:nth-child(3)');
		this.nameEntryInput = document.querySelector('#name-entry-input');
		this.nameEntryButton = this.nameEntryScreenDiv.querySelector('#name-entry-confirm');
		this.nameEntryButtonSrc = 'common/ok';
	}

	constructor(menu: Menu) {
		super(menu);

		this.viewReplayButton.addEventListener('click', async (e) => {
			if (e.button !== 0) return;
			this.onViewReplayButtonClick(e.altKey);
		});
		Util.onLongTouch(this.viewReplayButton, () => this.onViewReplayButtonClick(true));
		this.viewReplayButton.addEventListener('mouseenter', () => mainAudioManager.play('buttonover.wav'));
		this.viewReplayButton.addEventListener('mousedown', () => mainAudioManager.play('buttonpress.wav'));
	}

	showMessage(type: 'failed' | 'qualified' | 'gold' | 'ultimate') {
		this.message.style.color = '';

		if (type === 'ultimate') {
			// This message doesn't really exist in MBG, but can't hurt to add it here for completeness.
			this.message.innerHTML = 'You beat the <span style="color: #fff700;">ULTIMATE</span> time!';
		} else if (type === 'gold') {
			this.message.innerHTML = 'You beat the <span style="color: #fff700;">GOLD</span> time!';
		} else if (type === 'qualified') {
			this.message.innerHTML = "You've qualified!";
		} else if (type === 'failed') {
			this.message.innerHTML = "You failed to qualify!";
			this.message.style.color = 'red';
		}
	}

	updateTimeElements(elapsedTime: number, bonusTime: number, failedToQualify: boolean) {
		let level = state.level;

		this.time.textContent = Util.secondsToTimeString(level.finishTime.gameplayClock / 1000);
		this.qualifyTimeElement.textContent = isFinite(level.mission.qualifyTime)? Util.secondsToTimeString(level.mission.qualifyTime / 1000) : Util.secondsToTimeString(5999.999);
		this.qualifyTimeElement.style.color = failedToQualify? 'red' : '';
		this.qualifyTimeElement.style.textShadow = failedToQualify? '1px 1px 0px black' : '';
		Util.monospaceNumbers(this.qualifyTimeElement);

		let goldTime = level.mission.goldTime;
		this.goldTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
		this.goldTimeElement.parentElement.style.display = (goldTime !== -Infinity)? '' : 'none';
		Util.monospaceNumbers(this.goldTimeElement);

		this.elapsedTimeElement.textContent = Util.secondsToTimeString(elapsedTime / 1000);
		this.bonusTimeElement.textContent = Util.secondsToTimeString(bonusTime / 1000);
		Util.monospaceNumbers(this.elapsedTimeElement);
		Util.monospaceNumbers(this.bonusTimeElement);
	}

	createBestTimeElement() {
		let div = document.createElement('div');
		div.innerHTML = '<p></p><p></p>';
		div.classList.add('finish-row');

		return div;
	}

	updateBestTimeElement(element: HTMLDivElement, score: BestTimes[number], rank: number) {
		let goldTime = state.level.mission.goldTime;

		element.children[0].textContent = rank + '. ' + score[0];
		element.children[1].textContent = Util.secondsToTimeString(score[1] / 1000);
		Util.monospaceNumbers(element.children[1]);
		(element.children[1] as HTMLParagraphElement).style.color = (score[1] <= goldTime)? '#fff700' : '';
		(element.children[1] as HTMLParagraphElement).style.textShadow = (score[1] <= goldTime)? '1px 1px 0px black' : '';
	}

	generateNameEntryText(place: number) {
		return `You got the ${['best', '2nd best', '3rd best'][place]} time!`;
	}
}