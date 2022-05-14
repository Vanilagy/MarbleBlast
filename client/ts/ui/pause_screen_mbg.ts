import { Util } from "../util";
import { Menu } from "./menu";
import { PauseScreen } from "./pause_screen";

export class MbgPauseScreen extends PauseScreen {
	initProperties() {
		this.div = document.querySelector('#pause-screen');
		this.yesButton = document.querySelector('#pause-yes');
		this.noButton = document.querySelector('#pause-no');
		this.restartButton = document.querySelector('#pause-restart');
		this.replayButton = document.querySelector('#pause-replay');

		this.yesSrc = 'common/yes';
		this.noSrc = 'common/no';
		this.restartSrc = 'common/restart';
	}

	constructor(menu: Menu) {
		super(menu);

		this.replayButton.addEventListener('click', async (e) => {
			if (e.button !== 0) return;
			this.onReplayButtonClick(e.altKey);
		});
		Util.onLongTouch(this.replayButton, () => this.onReplayButtonClick(true));
	}
}