import { TimeState } from "../level";
import { Helicopter } from "./helicopter";
import { PowerUp } from "./power_up";
import { ShockAbsorber } from "./shock_absorber";
import { SuperBounce } from "./super_bounce";
import { SuperJump } from "./super_jump";
import { SuperSpeed } from "./super_speed";
import { TimeTravel } from "./time_travel";

// https://stackoverflow.com/questions/39392853/is-there-a-type-for-class-in-typescript-and-does-any-include-it
interface Type<T> extends Function {
    new (...args: any[]): T;
}

export const POSSIBLE_POWERUPS = [SuperJump, SuperSpeed, Helicopter, SuperBounce, ShockAbsorber, TimeTravel];

export class RandomPowerUp extends PowerUp {
	dtsPath = "shapes/items/random.dts";
	sounds = POSSIBLE_POWERUPS.map(x => new x(this.element).sounds).flat();
	lastInstance: PowerUp;
	pickedUpCount = 0;

	pickUp() {
		// Loop until a power-up is found that can be picked up
		while (true) {
			let random: Type<PowerUp>;
			if (this.level.replay.mode === 'record') random = POSSIBLE_POWERUPS[Math.floor(Math.random() * 6)]; // Choose a random power-up
			else random = POSSIBLE_POWERUPS[this.level.replay.randomPowerUpChoices.get(this.id)[this.pickedUpCount]]; // Select the one stored in the replay

			let instance = new random(this.element);
			instance.level = this.level; // Prevent having to init()
			instance.id = this.id;
			if (random === TimeTravel) this.cooldownDuration = Infinity; // Don't respawn again

			if (instance.pickUp()) {
				// We pretend we're them
				this.pickUpName = instance.pickUpName;
				this.customPickUpAlert = instance.customPickUpAlert;
				this.an = instance.an;
				this.autoUse = instance.autoUse;
				this.lastInstance = instance;
				this.pickedUpCount++;

				if (this.level.replay.mode === 'record') {
					// Save the random choice to the replay
					let arr = this.level.replay.randomPowerUpChoices.get(this.id);
					if (!arr) arr = [], this.level.replay.randomPowerUpChoices.set(this.id, arr);
					arr.push(POSSIBLE_POWERUPS.indexOf(random));
				}

				return true;
			}
		}
	}

	use(time: TimeState) {
		if (this.lastInstance instanceof TimeTravel) {
			this.lastInstance.use(time, this.bodies[0]); // Give it our body so it can compute collision time properly
		} else {
			this.lastInstance.use(time);
		}
	}

	getAllDtsPaths() {
		return POSSIBLE_POWERUPS.map(x => new x(this.element).dtsPath);
	}

	reset() {
		super.reset();
		this.pickedUpCount = 0;
	}
}