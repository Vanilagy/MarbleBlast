import { HomeScreen } from "./home";
import { Menu } from "./menu";

export class MbpHomeScreen extends HomeScreen {
    onlineButton: HTMLImageElement;

    initProperties() {
        this.div = document.querySelector('#mbp-home-screen');
        this.playButton = document.querySelector('#mbp-home-play');
        this.optionsButton = document.querySelector('#mbp-home-options');
        this.helpButton = document.querySelector('#mbp-home-help');
        this.exitButton = document.querySelector('#mbp-home-quit');

		// DESE ARE TEMPPPPPPPPP TEMP TEMP
		this.showChangelogButton = document.querySelector('#show-changelog');
        this.showChangelogText = document.querySelector('#show-changelog-text');
        this.changelogContainer = document.querySelector('#changelog');
        this.changelogBackButton = document.querySelector('#changelog-back');
        this.changelogContent = document.querySelector('#changelog-content');
        this.version = document.querySelector('#version');

        this.playSrc = 'menu/play';
        this.optionsSrc = 'menu/options';
        this.helpSrc = 'menu/help';
        this.exitSrc = 'menu/quit';
    }

    constructor(menu: Menu) {
        super(menu);

        this.onlineButton = document.querySelector('#mbp-home-online');
        menu.setupButton(this.onlineButton, 'menu/online', () => {});
    }
}