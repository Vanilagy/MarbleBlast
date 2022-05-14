import { G } from "../global";
import { Util } from "../util";
import { Replay } from "../replay";
import { Mission } from "../mission";
import { Menu } from "./menu";
import { Game } from "../game/game";
import { MultiplayerGame } from "../game/multiplayer_game";
import { gameServers } from "../net/game_server";
import { SingleplayerGame } from "../game/singleplayer_game";
import { Lobby } from "../net/lobby";
import { Socket } from "../../../shared/socket";

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

	async loadMission(mission: Mission, createGame: () => Game) {
		if (G.game) throw new Error("There's already a game running!");

		this.show();
		let indexAtStart = this.loadingIndex; // Remember the index at the start. If it changes later, that means that loading was cancelled.

		this.levelNameElement.textContent = mission.title;
		this.progressBar.style.width = '0px';

		// Give the UI a bit of time to breathe before we begin to load the level.
		await Util.wait(50);

		try {
			await mission.load();

			if (this.loadingIndex !== indexAtStart) return;

			let lastSendTime = -Infinity;
			this.refresher = setInterval(() => {
				// Constantly refresh the loading bar's width
				let completion = game.initter.getLoadingCompletion();
				this.progressBar.style.width = (completion * this.maxProgressBarWidth) + 'px';

				if (game instanceof MultiplayerGame && performance.now() - lastSendTime > 1000) {
					lastSendTime = performance.now();
					Socket.send('loadingCompletion', Math.min(completion, 0.99));
				}
			}) as unknown as number;

			let game = createGame();
			G.game = game;
			await game.init();

			/*
			if (getReplay) {
				let replay = getReplay();
				// Load the replay
				level.replay = replay;
				replay.level = level;
				replay.mode = 'playback';
			}
			*/

			if (this.loadingIndex !== indexAtStart) {
				game.dispose();
				return;
			}
			clearInterval(this.refresher);

			// Fake some second loading pass
			let start = performance.now();
			this.refresher = setInterval(() => {
				let completion = Util.clamp((performance.now() - start) / 100, 0, 1);
				this.progressBar.style.width = (completion * this.maxProgressBarWidth) + 'px';
			});

			await Util.wait(150);

			if (this.loadingIndex !== indexAtStart) {
				game.dispose();
				return;
			}
			clearInterval(this.refresher);

			// Loading has finished, hop into gameplay.

			await game.start();

			this.hide();
			this.menu.hide();
			this.menu.showGameUi();
		} catch(e) {
			console.error(e);
			this.cancelButton.click();
			G.game = null;
			G.menu.showAlertPopup('Error', "There was an error due to which the level couldn't be loaded.");
		}
	}

	loadMissionSingleplayer(mission: Mission) {
		return this.loadMission(mission, () => new SingleplayerGame(mission));
	}

	loadMissionMultiplayer(mission: Mission, lobby: Lobby, gameId: string, seed: number) {
		let gameServer = gameServers.find(x => x.id === lobby.settings.gameServer);
		return this.loadMission(mission, () => {
			let game = new MultiplayerGame(mission, gameServer);
			game.id = gameId;
			game.seed = seed;

			return game;
		});
	}
}