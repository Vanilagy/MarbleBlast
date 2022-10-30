import { mainAudioManager } from "../audio";
import { previousButtonState, resetPressedFlag } from "../input";
import { Replay } from "../replay";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";
import { setEnterFullscreenButtonVisibility } from "./misc";

export abstract class PauseScreen {
	div: HTMLDivElement;
	yesButton: HTMLImageElement;
	noButton: HTMLImageElement;
	restartButton: HTMLImageElement;
	replayButton: HTMLImageElement;

	yesSrc: string;
	noSrc: string;
	restartSrc: string;

	/** If true, can't be closed using the Escape key. */
	preventClose = false;

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.yesButton, this.yesSrc, () => {
			if (!state.level) return;
			state.level.stopAndExit();
		});
		menu.setupButton(this.noButton, this.noSrc, () => state.level.unpause());
		menu.setupButton(this.restartButton, this.restartSrc, () => {
			state.level.unpause();
			state.level.restart(true);
		});

		window.addEventListener('keydown', (e) => {
			if (!state.level || state.level.offline) return;
			if (state.menu !== menu) return;

			if (e.key === 'Escape') {
				if (state.level.paused) {
					if (!this.preventClose) this.noButton.src = menu.uiAssetPath + this.noSrc + '_d.png';
				} else {
					state.level.pause();
				}
			} else if (e.code === StorageManager.data.settings.gameButtonMapping.restart && state.level.paused) {
				// Restart the level if we press the restart button
				this.restartButton.click();
				state.level.pressingRestart = true; // Prevents the level from restarting again immediately (kinda hacky 😅)
			}
		});

		window.addEventListener('keyup', (e) => {
			if (!state.level || state.level.offline) return;
			if (state.menu !== menu) return;

			if (state.level.paused && e.key === 'Escape' && this.noButton.src.endsWith('_d.png')) {
				this.noButton.src = menu.uiAssetPath + this.noSrc + '_n.png';
				state.level.unpause();
			}
		});
	}

	abstract initProperties(): void;

	show() {
		this.div.classList.remove('hidden');
		setEnterFullscreenButtonVisibility(true);
	}

	hide() {
		this.div.classList.add('hidden');
		setEnterFullscreenButtonVisibility(false);
	}

	async onReplayButtonClick(download: boolean) {
		let level = state.level;

		if (download) {
			let serialized = await level.replay.serialize();
			Replay.download(serialized, level.mission, false, true);
			if (Util.isTouchDevice && Util.isInFullscreen()) state.menu.showAlertPopup('Downloaded', 'The .wrec has been downloaded.');
		} else {
			let confirmed = await state.menu.showConfirmPopup('Confirm', "Do you want to watch this replay? Note that you can only watch it once. If you want to watch it more often, download it first. (alt-click (or long-press on touch devices))");
			if (!confirmed) return;

			level.replay.mode = 'playback';
			this.restartButton.click();
		}
	}

	handleGamepadInput(gamepad: Gamepad) {
		// A button to exit
		if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
			state.level.stopAndExit();
			mainAudioManager.play('buttonpress.wav');
		}
		// B button or pause button to continue
		if (gamepad.buttons[1].value > 0.5 && !previousButtonState[1]) {
			state.level.unpause();
			mainAudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[9].value > 0.5 && !previousButtonState[9]) {
			state.level.unpause();
			resetPressedFlag('pause');
			mainAudioManager.play('buttonpress.wav');
		}
		// Restart button to restart
		if (gamepad.buttons[8].value > 0.5 && !previousButtonState[8]) {
			state.level.unpause();
			state.level.restart(true);
			state.level.pressingRestart = true;
			mainAudioManager.play('buttonpress.wav');
		}
	}
}