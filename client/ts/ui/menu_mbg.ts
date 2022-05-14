import { HomeScreen } from "./home";
import { LevelSelect } from "./level_select";
import { MbgLevelSelect } from "./level_select_mbg";
import { MbgHomeScreen } from "./home_mbg";
import { Menu } from "./menu";
import { LoadingScreen } from "./loading";
import { MbgLoadingScreen } from "./loading_mbg";
import { OptionsScreen } from "./options";
import { MbgOptionsScreen } from "./options_mbg";
import { HelpScreen } from "./help";
import { MbgHelpScreen } from "./help_mbg";
import { Hud } from "./hud";
import { MbgHud } from "./hud_mbg";
import { PauseScreen } from "./pause_screen";
import { MbgPauseScreen } from "./pause_screen_mbg";
import { FinishScreen } from "./finish_screen";
import { MbgFinishScreen } from "./finish_screen_mbg";
import { Util } from "../util";

export class MbgMenu extends Menu {
	get uiAssetPath() {
		return './assets/ui/';
	}
	audioAssetPath = './assets/data/sound/';
	menuMusicSrc = 'shell.ogg';
	popupBackgroundSrc = './assets/ui/common/dialog.png';
	popupOkaySrc = 'common/ok';
	popupNoSrc = 'common/no';
	popupYesSrc = 'common/yes';

	createHome(): HomeScreen {
		return new MbgHomeScreen(this);
	}

	createLevelSelect(): LevelSelect {
		return new MbgLevelSelect(this);
	}

	createLoadingScreen(): LoadingScreen {
		return new MbgLoadingScreen(this);
	}

	createOptionsScreen(): OptionsScreen {
		return new MbgOptionsScreen(this);
	}

	createHelpScreen(): HelpScreen {
		return new MbgHelpScreen(this);
	}

	createHud(): Hud {
		return new MbgHud(this);
	}

	createPauseScreen(): PauseScreen {
		return new MbgPauseScreen(this);
	}

	createFinishScreen(): FinishScreen {
		return new MbgFinishScreen(this);
	}

	getMenuDiv() {
		return document.querySelector('#menu') as HTMLDivElement;
	}

	getBackgroundImage() {
		return document.querySelector('#background-image') as HTMLImageElement;
	}

	async init() {
		if (Util.isWeeb) {
			this.backgroundImage.src = `./assets/img/weeb${Math.floor(4*Math.random() + 1)}.jpg`;
		}

		await super.init();
	}
}