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