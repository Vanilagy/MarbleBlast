import { LevelSelect } from "./level_select";

export class MbpLevelSelect extends LevelSelect {
	initProperties() {
		this.div = document.querySelector('#mbp-level-select');
		this.homeButton = document.querySelector('#mbp-level-select-home-button');

		this.homeButtonSrc = 'play/menu';
	}
}