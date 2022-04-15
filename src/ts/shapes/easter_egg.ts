import { AudioManager } from "../audio";
import { Game } from "../game/game";
import { Marble } from "../marble";
import { MissionElement } from "../parsing/mis_parser";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { PowerUp, PowerUpState } from "./power_up";

/** Easter eggs are hidden collectibles that the player can search for. */
export class EasterEgg extends PowerUp {
	dtsPath = "shapes/items/easteregg.dts";
	cooldownDuration = Infinity; // Won't respawn until the level is restarted
	autoUse = true;
	sounds = ["easter.wav", "easterfound.wav"]; // The sound varies based on if the player already found the egg
	pickUpName = '';
	alreadyHadEasterEgg = false;

	init(game?: Game, srcElement: MissionElement = null) {
		//this.alreadyHadEasterEgg = StorageManager.data.collectedEggs.includes(game.mission.path);
		Util.removeFromArray(StorageManager.data.collectedEggs, game.mission.path);
		return super.init(game, srcElement);
	}

	pickUp() {
		return true;
	}

	pickUpCosmetically(marble: Marble, frame: number) {
		let alreadyFound = StorageManager.data.collectedEggs.includes(this.game.mission.path);
		if (!alreadyFound) {
			StorageManager.data.collectedEggs.push(this.game.mission.path);
			StorageManager.store();
			state.menu.levelSelect.displayMission(); // To refresh the icon
		}

		this.game.simulator.executeNonDuplicatableEvent(() => AudioManager.play(this.sounds[Number(alreadyFound)]), `${this.id}sound`, true);
		state.menu.hud.displayAlert(() => alreadyFound ? "You already found this Easter Egg." : "You found an Easter Egg!", frame);
	}

	use() {}
	useCosmetically() {}

	loadState(_state: PowerUpState, meta: { frame: number, remote: number }) {
		if (!this.alreadyHadEasterEgg) {
			let index = StorageManager.data.collectedEggs.indexOf(this.game.mission.path);
			if (index !== -1 && _state.pickedUpBy === null) {
				// "Unpickup" the egg
				StorageManager.data.collectedEggs.splice(index, 1);
				StorageManager.store();
				state.menu.levelSelect.displayMission(); // To refresh the icon
			}
		}

		super.loadState(_state, meta);
	}
}