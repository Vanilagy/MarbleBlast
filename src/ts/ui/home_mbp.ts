import { state } from "../state";
import { HomeScreen } from "./home";
import { Menu } from "./menu";
import { MbpMenu } from "./menu_mbp";

export class MbpHomeScreen extends HomeScreen {
	onlineButton: HTMLImageElement;

	initProperties() {
		this.div = document.querySelector('#mbp-home-screen');
		this.playButton = document.querySelector('#mbp-home-play');
		this.optionsButton = document.querySelector('#mbp-home-options');
		this.helpButton = document.querySelector('#mbp-home-help');
		this.exitButton = document.querySelector('#mbp-home-quit');

		this.showChangelogButton = document.querySelector('#mbp-show-changelog');
		this.changelogContainer = document.querySelector('#mbp-changelog');
		this.changelogBackButton = document.querySelector('#mbp-changelog-back');
		this.changelogContent = document.querySelector('#mbp-changelog-content');
		this.version = document.querySelector('#mbp-version');

		this.playSrc = 'menu/play';
		this.optionsSrc = 'menu/options';
		this.helpSrc = 'menu/help';
		this.exitSrc = 'menu/quit';
		this.showChangelogSrc = 'menu/changelog';
		this.changelogBackSrc = 'motd/ok';
	}

	constructor(menu: Menu) {
		super(menu);

		this.onlineButton = document.querySelector('#mbp-home-online'); // Doesn't do anything yet :)
	}

	show() {
		super.show();
		state.menu.backgroundImage.src = (state.menu as MbpMenu).homeBg;
	}
}