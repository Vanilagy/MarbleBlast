import { AudioManager } from "../audio";
import { previousButtonState, resetPressedFlag } from "../input";
import { Replay } from "../replay";
import { state } from "../state";
import { Menu } from "./menu";

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
			if (!state.level) return;
		
			if (e.key === 'Escape') {
				if (state.level.paused && !this.preventClose) {
					this.noButton.src = menu.uiAssetPath + this.noSrc + '_d.png';
				} else {
					this.tryPause();
				}
			}
		});
		
		window.addEventListener('keyup', (e) => {
			if (!state.level) return;
		
			if (state.level.paused && e.key === 'Escape' && this.noButton.src.endsWith('_d.png')) {
				this.noButton.src = menu.uiAssetPath + this.noSrc + '_n.png';
				state.level.unpause();
			}
		});
	}

	abstract initProperties(): void;

	show() {
		this.div.classList.remove('hidden');
	}
	
	hide() {
		this.div.classList.add('hidden');
	}

	/** Pauses the current level if it makes sense. */
	tryPause() {
		if (!state.level
			|| state.level.paused
			|| (state.level.finishTime && state.level.replay.mode === 'record')) return;

		state.level.pause();
	}

	async onReplayButtonClick(e: MouseEvent) {
		let level = state.level;
	
		if (e.altKey) {
			let serialized = await level.replay.serialize();
			Replay.download(serialized, level.mission, false, true);
		} else {
			let confirmed = confirm("Note that you can only watch this replay once. If you want to watch it more often, download it first. (alt-click)");
			if (!confirmed) return;
		
			level.replay.mode = 'playback';
			this.restartButton.click();
		}
	}

	handleGamepadInput(gamepad: Gamepad) {
		// A button to exit
		if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
			state.level.stopAndExit();
			AudioManager.play('buttonpress.wav');
		}
		// B button or pause button to continue
		if (gamepad.buttons[1].value > 0.5 && !previousButtonState[1]) {
			state.level.unpause();
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[9].value > 0.5 && !previousButtonState[9]) {
			state.level.unpause();
			resetPressedFlag('pause');
			AudioManager.play('buttonpress.wav');
		}
		// Restart button to restart
		if (gamepad.buttons[8].value > 0.5 && !previousButtonState[8]) {
			state.level.unpause();
			state.level.restart(true);
			state.level.pressingRestart = true;
			AudioManager.play('buttonpress.wav');
		}
	}
}