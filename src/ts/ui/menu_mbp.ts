import { HomeScreen } from "./home";
import { LevelSelect } from "./level_select";
import { MbpLevelSelect } from "./level_select_mbp";
import { MbpHomeScreen } from "./home_mbp";
import { Menu } from "./menu";
import { LoadingScreen } from "./loading";
import { FinishScreen } from "./finish_screen";
import { HelpScreen } from "./help";
import { Hud } from "./hud";
import { OptionsScreen } from "./options";
import { PauseScreen } from "./pause_screen";
import { MbpLoadingScreen } from "./loading_mbp";
import { MbpPauseScreen } from "./pause_screen_mbp";
import { MbpHud } from "./hud_mbp";
import { MbpFinishScreen } from "./finish_screen_mbp";
import { MbpOptionsScreen } from "./options_mbp";
import { MbpHelpScreen } from "./help_mbp";

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
		return new MbpOptionsScreen(this);
	}

	createHelpScreen(): HelpScreen {
		return new MbpHelpScreen(this);
	}

	createHud(): Hud {
		return new MbpHud(this);
	}

	createPauseScreen(): PauseScreen {
		return new MbpPauseScreen(this);
	}

	createFinishScreen(): FinishScreen {
		return new MbpFinishScreen(this);
	}

	getMenuDiv() {
		return document.querySelector('#mbp-menu') as HTMLDivElement;
	}
}