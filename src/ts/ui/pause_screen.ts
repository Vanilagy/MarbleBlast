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

	constructor(menu: Menu) {
		this.initProperties();

		menu.setupButton(this.yesButton, 'common/yes', () => {
			if (!state.currentLevel) return;
			state.currentLevel.stopAndExit();
		});
		menu.setupButton(this.noButton, 'common/no', () => state.currentLevel.unpause());
		menu.setupButton(this.restartButton, 'common/restart', () => {
			state.currentLevel.unpause();
			state.currentLevel.restart();
		});

		this.replayButton.addEventListener('click', async (e) => {
			if (e.button !== 0) return;
			let level = state.currentLevel;
		
			if (e.altKey) {
				let serialized = await level.replay.serialize();
				Replay.download(serialized, level.mission, false, true);
			} else {
				let confirmed = confirm("Note that you can only watch this replay once. If you want to watch it more often, download it first. (alt-click)");
				if (!confirmed) return;
			
				level.replay.mode = 'playback';
				this.restartButton.click();
			}
		});

		window.addEventListener('keydown', (e) => {
			if (!state.currentLevel) return;
		
			if (e.key === 'Escape') {
				if (state.currentLevel?.paused) {
					this.noButton.src = './assets/ui/common/no_d.png';
				} else {
					this.tryPause();
				}
			}
		});
		
		window.addEventListener('keyup', (e) => {
			if (!state.currentLevel) return;
		
			if (state.currentLevel.paused && e.key === 'Escape' && this.noButton.src.endsWith('/assets/ui/common/no_d.png')) {
				this.noButton.src = './assets/ui/common/no_n.png';
				state.currentLevel.unpause();
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

	tryPause() {
		if (!state.currentLevel
			|| state.currentLevel.paused
			|| (state.currentLevel.finishTime && state.currentLevel.replay.mode === 'record')) return;

		state.currentLevel.pause();
	}

	handleGamepadInput(gamepad: Gamepad) {
		// A button to exit
		if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
			state.currentLevel.stopAndExit();
			AudioManager.play('buttonpress.wav');
		}
		// B button or pause button to continue
		if (gamepad.buttons[1].value > 0.5 && !previousButtonState[1]) {
			state.currentLevel.unpause();
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[9].value > 0.5 && !previousButtonState[9]) {
			state.currentLevel.unpause();
			resetPressedFlag('pause');
			AudioManager.play('buttonpress.wav');
		}
		// Restart button to restart
		if (gamepad.buttons[8].value > 0.5 && !previousButtonState[8]) {
			state.currentLevel.unpause();
			state.currentLevel.restart();
			state.currentLevel.pressingRestart = true;
			AudioManager.play('buttonpress.wav');
		}
	}
}