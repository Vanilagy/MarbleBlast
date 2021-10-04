import { HomeScreen } from "./home";
import { Menu } from "./menu";

export class MbgHomeScreen extends HomeScreen {
    onlineButton: HTMLImageElement;

    initProperties() {
		this.div = document.querySelector('#home-screen');
        this.playButton = document.querySelector('#home-play');
        this.optionsButton = document.querySelector('#home-options');
        this.helpButton = document.querySelector('#home-help');
        this.exitButton = document.querySelector('#home-exit');
        this.showChangelogButton = document.querySelector('#show-changelog');
        this.showChangelogText = document.querySelector('#show-changelog-text');
        this.changelogContainer = document.querySelector('#changelog');
        this.changelogBackButton = document.querySelector('#changelog-back');
        this.changelogContent = document.querySelector('#changelog-content');
        this.version = document.querySelector('#version');

        this.playSrc = 'home/play';
        this.optionsSrc = 'home/options';
        this.helpSrc = 'home/help';
        this.exitSrc = 'home/exit';
    }

    constructor(menu: Menu) {
        super(menu);

		menu.setupButton(this.showChangelogButton, 'motd/motd_buttn_textless', () => {
			this.changelogContainer.classList.remove('hidden');
		});
		menu.setupButton(this.changelogBackButton, 'play/back', () => {
			this.changelogContainer.classList.add('hidden');
		});
    }
}