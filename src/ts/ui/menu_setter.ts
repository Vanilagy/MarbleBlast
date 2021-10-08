import { state } from "../state";
import { StorageManager } from "../storage";
import { MbgMenu } from "./menu_mbg";
import { MbpMenu } from "./menu_mbp";

// I'm pissed. Had to put this in a separate file because Rollup is just too stupid to order stuff correctly.

let mbgMenu: MbgMenu;
let mbpMenu: MbpMenu;
const switchingMessage = document.querySelector('#switching-message') as HTMLDivElement;

/** Sets the menu to the given modification. */
export const setMenu = async (type: 'gold' | 'platinum') => {
	state.menu?.hide();
	if (state.menu) switchingMessage.classList.remove('hidden');
	document.querySelector('#favicon').setAttribute('href', (type === 'gold')? "./assets/img/marble-blast-gold-logo.png" : "./assets/img/mbp.png");

	if (type === 'gold') {
		if (mbgMenu) {
			// It already exists, show it immediately
			state.modification = 'gold';
			state.menu = mbgMenu;
			mbgMenu.show();
		} else {
			// We still need to create it
			mbgMenu = new MbgMenu();
			state.modification = 'gold';
			state.menu = mbgMenu;
			await mbgMenu.init();
			if (mbpMenu) mbgMenu.show();
		}
	} else {
		if (mbpMenu) {
			// It already exists, show it immediately
			state.modification = 'platinum';
			state.menu = mbpMenu;
			mbpMenu.show();
		} else {
			// We still need to create it
			mbpMenu = new MbpMenu();
			state.modification = 'platinum';
			state.menu = mbpMenu;
			await mbpMenu.init();
			if (mbgMenu) mbpMenu.show();
		}
	}

	switchingMessage.classList.add('hidden');
	StorageManager.data.modification = type;
	StorageManager.store();
};