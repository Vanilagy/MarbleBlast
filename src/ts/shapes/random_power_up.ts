import { EntityState } from "../../../shared/game_server_format";
import { Marble } from "../marble";
import { Util } from "../util";
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

export const POSSIBLE_RANDOM_POWER_UPS: Type<PowerUp>[] = [SuperJump, SuperSpeed, Helicopter, SuperBounce, ShockAbsorber, TimeTravel];

type RandomPowerUpState = EntityState & { entityType: 'randomPowerUp' };

/** A random power-up decides which power-up it acts like once it is picked up. */
export class RandomPowerUp extends PowerUp {
	dtsPath = "shapes/items/random.dts";
	pickUpName = '';
	lastInstance: PowerUp = null;
	probeCount = 0;

	pickUp(marble: Marble) {
		// Loop until a power-up is found that can be picked up
		while (true) {
			// Choose a random power-up
			let instance = this.game.randomPowerUpInstances[
				Math.floor(Util.seededRandom(this.game.seed + this.id, this.probeCount++) * this.game.randomPowerUpInstances.length)
			];

			if (instance.pickUp(marble)) {
				this.lastInstance = instance;
				this.imitatePowerUp(instance);

				marble.interactWith(instance);

				return true;
			}
		}
	}

	use(marble: Marble, t: number) {
		this.lastInstance.use(marble, t);
	}

	useCosmetically(marble: Marble) {
		this.lastInstance.useCosmetically(marble);
	}

	imitatePowerUp(instance: PowerUp) {
		this.pickUpName = instance.pickUpName;
		this.customPickUpAlert = instance.customPickUpAlert;
		this.an = instance.an;
		this.autoUse = instance.autoUse;
		this.cooldownDuration = instance.cooldownDuration;
		this.sounds = instance.sounds;
	}

	getState(): RandomPowerUpState {
		return {
			...super.getState(),
			entityType: 'randomPowerUp',
			probeCount: this.probeCount,
			lastInstance: this.lastInstance?.id ?? null
		};
	}

	getInitialState(): RandomPowerUpState {
		return {
			...super.getInitialState(),
			entityType: 'randomPowerUp',
			probeCount: 0,
			lastInstance: null
		};
	}

	loadState(state: RandomPowerUpState, meta: { frame: number, remote: boolean }) {
		this.probeCount = state.probeCount;

		this.lastInstance = this.game.getEntityById(state.lastInstance) as PowerUp;
		if (this.lastInstance) this.imitatePowerUp(this.lastInstance);

		super.loadState(state, meta);
	}
}