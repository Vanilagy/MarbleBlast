import { Menu } from "./menu";
import { PauseScreen } from "./pause_screen";

export class MbpPauseScreen extends PauseScreen {
	initProperties() {
		this.div = document.querySelector('#mbp-pause-screen');
		this.yesButton = document.querySelector('#mbp-pause-yes');
		this.noButton = document.querySelector('#mbp-pause-no');
		this.restartButton = document.querySelector('#mbp-pause-restart');
		this.replayButton = document.querySelector('#mbp-pause-replay');

		this.yesSrc = 'exit/yes';
		this.noSrc = 'exit/no';
		this.restartSrc = 'exit/restart';
	}

	constructor(menu: Menu) {
		super(menu);

		menu.setupButton(this.replayButton, 'play/replay', (e) => this.onReplayButtonClick(e));
	}
}