import { FinishScreen } from "./finish_screen";

export class MbgFinishScreen extends FinishScreen {
	initProperties() {
		this.div = document.querySelector('#finish-screen');
		this.time = document.querySelector('#finish-screen-time-time');
		this.message = document.querySelector('#finish-message');
		this.qualifyTimeElement = document.querySelector('#finish-qualify-time');
		this.goldTimeElement = document.querySelector('#finish-gold-time');
		this.elapsedTimeElement = document.querySelector('#finish-elapsed-time');
		this.bonusTimeElement = document.querySelector('#finish-bonus-time');
		this.bestTime1 = document.querySelector('#best-time-1');
		this.bestTime2 = document.querySelector('#best-time-2');
		this.bestTime3 = document.querySelector('#best-time-3');
		this.replayButton = document.querySelector('#finish-replay');
		this.continueButton = document.querySelector('#finish-continue');
		this.viewReplayButton = document.querySelector('#finish-view-replay');

		this.nameEntryScreenDiv = document.querySelector('#name-entry-screen');
		this.nameEntryText = document.querySelector('#name-entry-screen > p:nth-child(3)');
		this.nameEntryInput = document.querySelector('#name-entry-input');
		this.nameEntryButton = this.nameEntryScreenDiv.querySelector('#name-entry-confirm');
	}
}