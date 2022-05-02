import { G } from "../global";
import { StorageManager } from "../storage";
import { MbgMenu } from "./menu_mbg";
import { MbpMenu } from "./menu_mbp";

// I'm pissed. Had to put this in a separate file because Rollup is just too stupid to order stuff correctly.

let mbgMenu: MbgMenu;
let mbpMenu: MbpMenu;
const switchingMessage = document.querySelector('#switching-message') as HTMLDivElement;

/** Sets the menu to the given modification. */
export const setMenu = async (type: 'gold' | 'platinum') => {
	G.menu?.hide();
	if (G.menu) switchingMessage.classList.remove('hidden');
	document.querySelector('#favicon').setAttribute('href', (type === 'gold')? "./assets/img/marble-blast-gold-logo.png" : "./assets/img/mbp.png");

	if (type === 'gold') {
		if (mbgMenu) {
			// It already exists, show it immediately
			G.modification = 'gold';
			G.menu = mbgMenu;
			mbgMenu.show();
		} else {
			// We still need to create it
			mbgMenu = new MbgMenu();
			G.modification = 'gold';
			G.menu = mbgMenu;
			await mbgMenu.init();
			if (mbpMenu) mbgMenu.show();
		}
	} else {
		if (mbpMenu) {
			// It already exists, show it immediately
			G.modification = 'platinum';
			G.menu = mbpMenu;
			mbpMenu.show();
		} else {
			// We still need to create it
			mbpMenu = new MbpMenu();
			G.modification = 'platinum';
			G.menu = mbpMenu;
			await mbpMenu.init();
			if (mbgMenu) mbpMenu.show();
		}
	}

	switchingMessage.classList.add('hidden');
	StorageManager.data.modification = type;
	StorageManager.store();
};