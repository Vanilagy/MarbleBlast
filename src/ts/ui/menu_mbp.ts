import { HomeScreen } from "./home";
import { LevelSelect } from "./level_select";
import { MbpLevelSelect } from "./level_select_mbp";
import { MbpHomeScreen } from "./home_mbp";
import { Menu } from "./menu";
import { LoadingScreen } from "./loading";
import { FinishScreen } from "./finish_screen";
import { MbgFinishScreen } from "./finish_screen_mbg";
import { HelpScreen } from "./help";
import { MbgHelpScreen } from "./help_mbg";
import { Hud } from "./hud";
import { MbgHud } from "./hud_mbg";
import { OptionsScreen } from "./options";
import { MbgOptionsScreen } from "./options_mbg";
import { PauseScreen } from "./pause_screen";
import { MbgPauseScreen } from "./pause_screen_mbg";
import { MbgLoadingScreen } from "./loading_mbg";
import { MbpLoadingScreen } from "./loading_mbp";
import { MbpPauseScreen } from "./pause_screen_mbp";
import { MbpHud } from "./hud_mbp";

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

	createLoadingScreen(): LoadingScreen {
		return new MbpLoadingScreen(this);
	}

	createOptionsScreen(): OptionsScreen {
		return null;
	}

	createHelpScreen(): HelpScreen {
		return null;
	}

	createHud(): Hud {
		return new MbpHud(this);
	}

	createPauseScreen(): PauseScreen {
		return new MbpPauseScreen(this);
	}

	createFinishScreen(): FinishScreen {
		return new MbgFinishScreen(this);
	}

	getMenuDiv() {
		return document.querySelector('#mbp-menu') as HTMLDivElement;
	}

	async init() {
		super.init();
	}
}