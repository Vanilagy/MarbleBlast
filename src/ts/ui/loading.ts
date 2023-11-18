import { state } from "../state";
import { Level } from "../level";
import { Util } from "../util";
import { Replay } from "../replay";
import { Mission } from "../mission";
import { Menu } from "./menu";

export abstract class LoadingScreen {
	menu: Menu;
	div: HTMLDivElement;
	levelNameElement: HTMLParagraphElement;
	cancelButton: HTMLImageElement;
	progressBar: HTMLDivElement;
	loadingIndex = 0;
	refresher: number;
	abstract maxProgressBarWidth: number;

	constructor(menu: Menu) {
		this.menu = menu;
		this.initProperties();

		menu.setupButton(this.cancelButton, 'loading/cancel', () => {
			// Cancel the loading progress and return to level select
			this.hide();
			menu.levelSelect.show();
			this.loadingIndex++;
			clearInterval(this.refresher);
		});
	}

	abstract initProperties(): void;

	show() {
		this.div.classList.remove('hidden');
	}

	hide() {
		this.div.classList.add('hidden');
	}

	async loadLevel(mission: Mission, getReplay?: () => Promise<Replay>) {
		this.show();
		let indexAtStart = this.loadingIndex; // Remember the index at the start. If it changes later, that means that loading was cancelled.

		this.levelNameElement.textContent = mission.title;
		this.progressBar.style.width = '0px';

		// Give the UI a bit of time to breathe before we begin to load the level.
		await Util.wait(50);

		try {
			// Fire off replay fetching right at the start
			let replayPromise = getReplay ? getReplay() : Promise.resolve();

			await mission.load();

			if (this.loadingIndex !== indexAtStart) return;

			this.refresher = setInterval(() => {
				// Constantly refresh the loading bar's width
				let completion = level.getLoadingCompletion();
				this.progressBar.style.width = (completion * this.maxProgressBarWidth) + 'px';
			}) as unknown as number;

			let level = new Level(mission);
			state.level = level;
			await level.init();

			let replay = await replayPromise;
			if (replay) {
				level.replay = replay;
				replay.level = level;
				replay.mode = 'playback';
			}

			if (this.loadingIndex !== indexAtStart) {
				level.dispose();
				return;
			}
			clearInterval(this.refresher);

			// Fake some second loading pass
			let start = performance.now();
			this.refresher = setInterval(() => {
				let completion = Util.clamp((performance.now() - start) / 100, 0, 1);
				this.progressBar.style.width = (completion * this.maxProgressBarWidth) + 'px';
			}) as unknown as number;

			await Util.wait(150);

			if (this.loadingIndex !== indexAtStart) {
				level.dispose();
				return;
			}
			clearInterval(this.refresher);

			// Loading has finished, hop into gameplay.

			level.start();

			this.hide();
			this.menu.hide();
			this.menu.showGameUi();
		} catch(e) {
			console.error(e);
			this.cancelButton.click();
			state.level = null;
			state.menu.showAlertPopup('Error', "There was an error due to which the level couldn't be loaded.");
		}
	}
}