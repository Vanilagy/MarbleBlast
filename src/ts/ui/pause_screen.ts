import { AudioManager } from "../audio";
import { previousButtonState, resetPressedFlag } from "../input";
import { Replay } from "../replay";
import { G } from "../global";
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
			if (!G.game) return;
			G.game.stopAndExit();
		});
		menu.setupButton(this.noButton, this.noSrc, () => G.game.unpause());
		menu.setupButton(this.restartButton, this.restartSrc, () => {
			G.game.unpause();
			G.game.signalRestartIntent();
		});

		window.addEventListener('keydown', (e) => {
			if (!G.game) return;
			if (G.menu !== menu) return;

			if (e.key === 'Escape') {
				if (G.game.paused) {
					if (!this.preventClose) this.noButton.src = menu.uiAssetPath + this.noSrc + '_d.png';
				} else {
					G.game.pause();
				}
			} else if (e.code === StorageManager.data.settings.gameButtonMapping.restart && G.game.paused) {
				// Restart the level if we press the restart button
				this.restartButton.click();
				//state.level.pressingRestart = true; // fixme Prevents the level from restarting again immediately (kinda hacky 😅)
			}
		});

		window.addEventListener('keyup', (e) => {
			if (!G.game) return;
			if (G.menu !== menu) return;

			if (G.game.paused && e.key === 'Escape' && this.noButton.src.endsWith('_d.png')) {
				this.noButton.src = menu.uiAssetPath + this.noSrc + '_n.png';
				G.game.unpause();
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
		let level = G.level;

		if (download) {
			let serialized = await level.replay.serialize();
			Replay.download(serialized, level.mission, false, true);
			if (Util.isTouchDevice && Util.isInFullscreen()) G.menu.showAlertPopup('Downloaded', 'The .wrec has been downloaded.');
		} else {
			let confirmed = await G.menu.showConfirmPopup('Confirm', "Do you want to watch this replay? Note that you can only watch it once. If you want to watch it more often, download it first. (alt-click (or long-press on touch devices))");
			if (!confirmed) return;

			level.replay.mode = 'playback';
			this.restartButton.click();
		}
	}

	handleGamepadInput(gamepad: Gamepad) {
		// A button to exit
		if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
			G.level.stopAndExit();
			AudioManager.play('buttonpress.wav');
		}
		// B button or pause button to continue
		if (gamepad.buttons[1].value > 0.5 && !previousButtonState[1]) {
			G.level.unpause();
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[9].value > 0.5 && !previousButtonState[9]) {
			G.level.unpause();
			resetPressedFlag('pause');
			AudioManager.play('buttonpress.wav');
		}
		// Restart button to restart
		if (gamepad.buttons[8].value > 0.5 && !previousButtonState[8]) {
			G.level.unpause();
			G.level.restart(true);
			G.level.pressingRestart = true;
			AudioManager.play('buttonpress.wav');
		}
	}
}