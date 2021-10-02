import { HomeScreen } from "./home";
import { LevelSelect } from "./level_select";
import { MbpLevelSelect } from "./level_select_mbp";
import { MbpHomeScreen } from "./home_mbp";
import { Menu } from "./menu";

export class MbpMenu extends Menu {
	get uiAssetPath() {
		return './assets/ui_mbp/';
	}
	audioAssetPath = './assets/data_mbp/sound/';
	menuMusicSrc = 'music/pianoforte.ogg';

	createHome(): HomeScreen {
		return new MbpHomeScreen(this);
	}

	createLevelSelect(): LevelSelect {
		return new MbpLevelSelect(this);
	}

	getMenuDiv() {
		return document.querySelector('#mbp-menu') as HTMLDivElement;
	}

	async init() {
		super.init();
	}
}