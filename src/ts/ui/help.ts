import { state } from "../state";
import { Menu } from "./menu";

export abstract class HelpScreen {
	div: HTMLDivElement;
	homeButton: HTMLImageElement;
	homeButtonSrc: string;

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.homeButton, this.homeButtonSrc, () => {
			// Close help and go back to the main menu
			this.hide();
			menu.home.show();
		}, undefined, undefined, state.modification === 'gold');
	}

	abstract initProperties(): void;

	async init() {}

	show() {
		this.div.classList.remove('hidden');
	}

	hide() {
		this.div.classList.add('hidden');
	}
}