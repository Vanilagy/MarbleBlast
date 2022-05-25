import { Shape } from "../shape";
import { Util } from "../../util";
import { AudioManager } from "../../audio";
import { Vector3 } from "../../math/vector3";
import { BlendingType } from "../../rendering/renderer";
import { Collision } from "../../physics/collision";
import { Marble } from "../marble";
import { EntityState } from "../../../../shared/game_server_format";
import { MultiplayerGame } from "../multiplayer_game";

export type ExplosiveState = EntityState & { entityType: 'explosive' };

const MINE_COOLDOWN = 5;

/** Land mines explode on contact and knock the marble away. */
export class LandMine extends Shape {
	dtsPath = "shapes/hazards/landmine.dts";
	disappearTime = -Infinity;
	sounds = ['explode1.wav'];
	shareMaterials = false;

	onMarbleContact(collision: Collision, marble: Marble) {
		if (this.game instanceof MultiplayerGame) {
			// We disable prediction of mine impacts of marbles we're not sure about, because mine impacts create a very sudden and disturbing gameplay effect.
			let sureAboutIt = marble.affectedBy.size === 1 && marble.affectedBy.has(this.game.localPlayer);
			if (!sureAboutIt && this.game.state.frame > this.game.state.serverFrame)
				return;
		}

		let minePos = this.worldPosition;

		for (let marble of this.game.marbles) {
			let vec = marble.body.position.clone().sub(minePos);
			let explosionStrength = this.computeExplosionStrength(vec.length());

			if (explosionStrength === 0) continue;

			// Add velocity to the marble
			marble.body.linearVelocity.addScaledVector(vec.normalize(), explosionStrength);
			marble.slidingTimeout = 2;

			this.affect(marble);
		}

		this.disappearTime = this.game.state.time;
		this.setCollisionEnabled(false);
		this.stateNeedsStore = true;

		marble.affect(this);

		this.applyCosmeticEffects();
	}

	/** Computes the strength of the explosion (force) based on distance from it. */
	computeExplosionStrength(r: number) {
		// Figured out through testing by RandomityGuy
		if (r >= 10.25) return 0;
		if (r >= 10) return Util.lerp(30.0087, 30.7555, r - 10);

		// The explosion first becomes stronger the further you are away from it, then becomes weaker again (parabolic).
		let a = 0.071436222;
		let v = ((r - 5) ** 2) / (-4 * a) + 87.5;

		return v;
	}

	update(onlyVisual?: boolean) {
		if (onlyVisual) return;

		// Enable or disable the collision based on disappear time
		let visible = this.game.state.time >= this.disappearTime + MINE_COOLDOWN;
		this.setCollisionEnabled(visible);
	}

	render() {
		let opacity = Util.clamp(this.game.state.time - (this.disappearTime + MINE_COOLDOWN), 0, 1);
		this.setOpacity(opacity);

		super.render();
	}

	getState(): ExplosiveState {
		return {
			entityType: 'explosive',
			disappearTime: this.disappearTime
		};
	}

	getInitialState(): ExplosiveState {
		return {
			entityType: 'explosive',
			disappearTime: -Infinity
		};
	}

	loadState(state: ExplosiveState) {
		if (state.disappearTime > this.disappearTime) this.applyCosmeticEffects();
		this.disappearTime = state.disappearTime;
	}

	applyCosmeticEffects() {
		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play(this.sounds[0], undefined, undefined, this.worldPosition);

			this.game.renderer.particles.createEmitter(landMineParticle, this.worldPosition);
			this.game.renderer.particles.createEmitter(landMineSmokeParticle, this.worldPosition);
			this.game.renderer.particles.createEmitter(landMineSparksParticle, this.worldPosition);
			// Normally, we would add a light here, but eh.
		}, `${this.id}sound`, true);
	}
}

/** The fire particle. */
const landMineParticle = {
	ejectionPeriod: 0.2,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 2,
	velocityVariance: 1,
	emitterLifetime: 50,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: BlendingType.Additive,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 1000,
		lifetimeVariance: 150,
		dragCoefficient: 0.8,
		acceleration: 0,
		colors: [{r: 0.56, g: 0.36, b: 0.26, a: 1}, {r: 0.56, g: 0.36, b: 0.26, a: 0}],
		sizes: [0.5, 1],
		times: [0, 1]
	}
};
/** The smoke particle. */
export const landMineSmokeParticle = {
	ejectionPeriod: 0.5,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 0.8,
	velocityVariance: 0.4,
	emitterLifetime: 50,
	inheritedVelFactor: 0.25,
	particleOptions: {
		texture: 'particles/smoke.png',
		blending: BlendingType.Normal,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 1200,
		lifetimeVariance: 300,
		dragCoefficient: 0.85,
		acceleration: -8,
		colors: [{r: 0.56, g: 0.36, b: 0.26, a: 1}, {r: 0.2, g: 0.2, b: 0.2, a: 1}, {r: 0, g: 0, b: 0, a: 0}],
		sizes: [1, 1.5, 2],
		times: [0, 0.5, 1]
	}
};
/** The sparks exploding away. */
export const landMineSparksParticle = {
	ejectionPeriod: 0.4,
	ambientVelocity: new Vector3(0, 0, 0),
	ejectionVelocity: 13 / 4,
	velocityVariance: 6.75 / 4,
	emitterLifetime: 100,
	inheritedVelFactor: 0.2,
	particleOptions: {
		texture: 'particles/spark.png',
		blending: BlendingType.Additive,
		spinSpeed: 40,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 500,
		lifetimeVariance: 350,
		dragCoefficient: 0.75,
		acceleration: -8,
		colors: [{r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 0.6, g: 0.4, b: 0.3, a: 1}, {r: 1, g: 0.4, b: 0.3, a: 0}],
		sizes: [0.5, 0.25, 0.25],
		times: [0, 0.5, 1]
	}
};