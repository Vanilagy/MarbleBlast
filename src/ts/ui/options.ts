import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";

export const buttonToDisplayNameMbg: Record<keyof typeof StorageManager.data.settings.gameButtonMapping, string> = {
	up: 'Move Forward',
	down: 'Move Backward',
	left: 'Move Left',
	right: 'Move Right',
	use: 'Use PowerUp',
	jump: 'Jump',
	cameraUp: 'Rotate Camera Up',
	cameraDown: 'Rotate Camera Down',
	cameraLeft: 'Rotate Camera Left',
	cameraRight: 'Rotate Camera Right',
	freeLook: 'Free Look',
	restart: 'Restart',
	blast: 'Use Blast'
};
export const buttonToDisplayNameMbp: Record<keyof typeof StorageManager.data.settings.gameButtonMapping, string> = {
	up: 'Move Forward',
	down: 'Move Backward',
	left: 'Move Left',
	right: 'Move Right',
	use: 'Use PowerUp',
	jump: 'Jump',
	cameraUp: 'Look Up',
	cameraDown: 'Look Down',
	cameraLeft: 'Look Left',
	cameraRight: 'Look Right',
	freeLook: 'Free Look',
	restart: 'Respawn',
	blast: 'Use Blast'
};

export abstract class OptionsScreen {
	menu: Menu;
	div: HTMLDivElement;
	homeButton: HTMLImageElement;
	homeButtonSrc: string;

	/** Stores the button that's currently being rebound. */
	currentlyRebinding: keyof typeof StorageManager.data.settings.gameButtonMapping = null;
	/** Stores the value that we currently want to rebind to. */
	rebindValue: string = null;
	rebindDialog: HTMLDivElement;
	rebindConfirm: HTMLDivElement;
	rebindConfirmYes: HTMLImageElement;
	rebindConfirmNo: HTMLImageElement;
	rebindConfirmYesSrc: string;
	rebindConfirmNoSrc: string;

	rebindConfirmWarningEnding = `Do you want to undo this<br>mapping?`;

	constructor(menu: Menu) {
		this.menu = menu;
		this.initProperties();

		menu.setupButton(this.homeButton, this.homeButtonSrc, () => {
			this.hide();
			menu.home.show();
		}, undefined, undefined, state.modification === 'gold');

		window.addEventListener('keydown', (e) => {
			if (!this.currentlyRebinding || this.rebindValue) return;

			if (e.code === 'Escape') {
				// Exits keybinding without changing anything
				this.currentlyRebinding = null;
				this.rebindDialog.classList.add('hidden');
			} else {
				this.setKeybinding(this.currentlyRebinding, e.code);
			}
		});

		window.addEventListener('mousedown', (e) => {
			if (!this.currentlyRebinding || this.rebindValue) return;

			let buttonName = ["LMB", "MMB", "RMB"][e.button];
			if (!buttonName) return;

			this.setKeybinding(this.currentlyRebinding, buttonName);
		});

		menu.setupButton(this.rebindConfirmYes, this.rebindConfirmYesSrc, () => {
			// Find the other value and nullify its binding value (empty string)
			for (let key in StorageManager.data.settings.gameButtonMapping) {
				let typedKey = key as keyof typeof StorageManager.data.settings.gameButtonMapping;
				let otherValue = StorageManager.data.settings.gameButtonMapping[typedKey];

				if (otherValue === this.rebindValue) StorageManager.data.settings.gameButtonMapping[typedKey] = '';
			}

			// Bind the new value
			StorageManager.data.settings.gameButtonMapping[this.currentlyRebinding] = this.rebindValue;
			StorageManager.store();
			this.currentlyRebinding = null;
			this.rebindValue = null;
			this.rebindConfirm.classList.add('hidden');
			this.refreshKeybindings();
		});
		menu.setupButton(this.rebindConfirmNo, this.rebindConfirmNoSrc, () => {
			// Cancel the rebinding process.
			this.currentlyRebinding = null;
			this.rebindValue = null;
			this.rebindConfirm.classList.add('hidden');
		});
	}

	abstract initProperties(): void;

	async init() {}

	show() {
		this.div.classList.remove('hidden');
	}

	hide() {
		this.div.classList.add('hidden');
	}

	abstract refreshKeybindings(): void;

	/** Returns a nice string representation of the key that a button is bound to. */
	formatKeybinding(button: keyof typeof StorageManager.data.settings.gameButtonMapping) {
		let str = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[button as keyof typeof StorageManager.data.settings.gameButtonMapping]);
		if (str.startsWith('the')) return str.slice(str.indexOf(' ') + 1, str.lastIndexOf(' ')); // If the string starts with 'the', then it's a mouse button, and we clean it up by only keeping the middle part (dropping 'the' and 'button')
		else return str;
	}

	/** Starts the rebinding process and shows a dialog. */
	changeKeybinding(button: keyof typeof StorageManager.data.settings.gameButtonMapping) {
		if (Util.isTouchDevice) return; // Don't

		let map = (state.modification === 'gold')? buttonToDisplayNameMbg : buttonToDisplayNameMbp;
		this.rebindDialog.classList.remove('hidden');
		this.rebindDialog.children[1].innerHTML = `Press a new key or button for<br>"${map[button]}"`;
		this.currentlyRebinding = button;
	}

	/** Updates the binding for a given button. */
	setKeybinding(button: keyof typeof StorageManager.data.settings.gameButtonMapping, value: string) {
		let map = (state.modification === 'gold')? buttonToDisplayNameMbg : buttonToDisplayNameMbp;

		// Check for collisions with other bindings
		for (let key in StorageManager.data.settings.gameButtonMapping) {
			let typedKey = key as keyof typeof StorageManager.data.settings.gameButtonMapping;
			let otherValue = StorageManager.data.settings.gameButtonMapping[typedKey];

			if (otherValue === value && typedKey !== button) {
				// We found another binding that binds to the same key, bring up the conflict dialog.
				this.rebindDialog.classList.add('hidden');
				this.rebindConfirm.classList.remove('hidden');
				this.rebindConfirm.children[1].innerHTML = `"${this.formatKeybinding(typedKey)}" is already bound to "${map[typedKey]}"!<br>` + this.rebindConfirmWarningEnding;
				this.rebindValue = value;

				return;
			}
		}

		// Simply store the keybind.
		StorageManager.data.settings.gameButtonMapping[button] = value;
		StorageManager.store();
		this.currentlyRebinding = null;
		this.rebindDialog.classList.add('hidden');
		this.refreshKeybindings();
	}

	showMarbleTexturePicker() {
		return new Promise<void>(resolve => {
			// Show an image picker
			let fileInput = document.createElement('input');
			fileInput.setAttribute('type', 'file');
			fileInput.setAttribute('accept', "image/x-png,image/gif,image/jpeg");

			fileInput.onchange = async () => {
				let file = fileInput.files[0];
				await StorageManager.databasePut('keyvalue', file, 'marbleTexture'); // Store the Blob in the IndexedDB
				resolve();
			};
			fileInput.click();
		});
	}
}