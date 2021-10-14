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
import { Util } from "../util";
import { ResourceManager } from "../resources";

const BACKGROUNDS = {
	'gold': 12,
	'platinum': 28,
	'ultra': 9,
	'multi': 13
};

export class MbpMenu extends Menu {
	get uiAssetPath() {
		return './assets/ui_mbp/';
	}
	audioAssetPath = './assets/data_mbp/sound/';
	menuMusicSrc = 'music/pianoforte.ogg';

	homeBg: string;
	mbgBg: string;
	mbpBg: string;

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

	getBackgroundImage() {
		return document.querySelector('#mbp-background-image') as HTMLImageElement;
	}

	async init() {
		// Preselect random backgrounds and load them
		let homeCategory = Util.randomFromArray(Object.keys(BACKGROUNDS));
		let homeIndex = Math.floor(Math.random() * BACKGROUNDS[homeCategory as keyof typeof BACKGROUNDS]) + 1;
		let mbgIndex = Math.floor(Math.random() * BACKGROUNDS['gold']) + 1;
		let mbpIndex = Math.floor(Math.random() * BACKGROUNDS['platinum']) + 1;

		this.homeBg = './assets/ui_mbp/backgrounds/' + homeCategory + '/' + homeIndex + '.jpg';
		this.mbgBg = './assets/ui_mbp/backgrounds/' + 'gold/' + mbgIndex + '.jpg';
		this.mbpBg = './assets/ui_mbp/backgrounds/' + 'platinum/' + mbpIndex + '.jpg';

		await ResourceManager.loadImages([this.homeBg, this.mbgBg, this.mbpBg]);

		await super.init();
	}
}