import { PauseScreen } from "./pause_screen";

export class MbgPauseScreen extends PauseScreen {
	initProperties() {
		this.div = document.querySelector('#pause-screen');
		this.yesButton = document.querySelector('#pause-yes');
		this.noButton = document.querySelector('#pause-no');
		this.restartButton = document.querySelector('#pause-restart');
		this.replayButton = document.querySelector('#pause-replay');
	}
}