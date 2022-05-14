import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { EntityState } from "../../../shared/game_server_format";
import { AudioManager } from "../audio";
import { G } from "../global";
import { DEFAULT_PITCH, DEFAULT_YAW, Marble } from "./marble";
import { Euler } from "../math/euler";
import { Vector3 } from "../math/vector3";
import { MisParser } from "../../../shared/mis_parser";
import { Entity } from "./entity";
import { Game } from "./game";
import { MisUtils } from "../parsing/mis_utils";
import { Shape } from "./shape";
import { CheckpointTrigger } from "./triggers/checkpoint_trigger";
import { Gem } from "./shapes/gem";
import { PowerUp } from "./shapes/power_up";

type CheckpointStateState = EntityState & { entityType: 'checkpointState' };

interface InternalCheckpointStateState {
	scheduledPickUpFrame: number
}

export class CheckpointState extends Entity {
	restartable = true;
	marble: Marble;

	/** Stores the shape that is the destination of the current checkpoint. */
	currentCheckpoint: Shape = null;
	/** If the checkpoint was triggered by a trigger, this field stores that trigger. */
	currentCheckpointTrigger: CheckpointTrigger = null;
	checkpointCollectedGems = new Set<Gem>();
	checkpointHeldPowerUp: PowerUp = null;
	/** Up vector at the point of checkpointing */
	checkpointUp: Vector3 = null;
	checkpointBlast: number = null;

	scheduledPickUpFrame: number = null;

	constructor(game: Game, id: number, marble: Marble) {
		super(game);

		this.id = id;
		this.marble = marble;
	}

	/** Sets a new active checkpoint. */
	save(shape: Shape, trigger?: CheckpointTrigger) {
		if (this.currentCheckpoint === shape) return;
		if (this.currentCheckpoint?.worldPosition.equals(shape.worldPosition)) return; // Some levels have identical overlapping checkpoints, which can cause an infinite checkpointing loop.

		let disableOob = (shape.srcElement as any)?.disableOob || trigger?.element.disableOob;
		if (MisParser.parseBoolean(disableOob) && this.marble.outOfBoundsFrame !== null) return; // The checkpoint is configured to not work when the player is already OOB

		this.currentCheckpoint = shape;
		this.currentCheckpointTrigger = trigger;
		this.checkpointCollectedGems.clear();
		this.checkpointUp = this.marble.currentUp.clone();
		this.checkpointBlast = this.marble.blastAmount;

		// Remember all gems that were collected up to this point
		for (let shape of this.game.shapes) {
			if (!(shape instanceof Gem)) continue;
			if (shape.pickUpHistory[0] === this.marble) this.checkpointCollectedGems.add(shape);
		}

		this.checkpointHeldPowerUp = this.marble.heldPowerUp;

		G.menu.hud.displayAlert(() => {
			return this.marble === this.game.localPlayer.controlledMarble ? "Checkpoint reached!" : null;
		}, this.game.state.frame);

		if (this.marble === this.game.localPlayer.controlledMarble) {
			this.game.simulator.executeNonDuplicatableEvent(() => {
				AudioManager.play('checkpoint.wav');
			}, `${this.id}sound`, true);
		}

		this.marble.affect(this);
		this.stateNeedsStore = true;
	}

	/** Resets to the last stored checkpoint state. */
	load() {
		if (!this.currentCheckpoint) return;

		let marble = this.marble;

		// Quite note: Checkpoints have slightly different behavior in Ultra, that's why there's some checks

		let gravityField = (this.currentCheckpoint.srcElement as any)?.gravity || this.currentCheckpointTrigger?.element.gravity;
		if (MisParser.parseBoolean(gravityField) || this.game.mission.modification === 'ultra') {
			// In this case, we set the gravity to the relative "up" vector of the checkpoint shape.
			let up = new Vector3(0, 0, 1);
			up.applyQuaternion(this.currentCheckpoint.worldOrientation);
			marble.setUp(up, true);
		} else {
			// Otherwise, we restore gravity to what was stored.
			marble.setUp(this.checkpointUp, true);
		}

		// Determine where to spawn the marble
		let offset = new Vector3();
		let add = (this.currentCheckpoint.srcElement as any)?.add || this.currentCheckpointTrigger?.element.add;
		if (add) offset.add(MisUtils.parseVector3(add));
		let sub = (this.currentCheckpoint.srcElement as any)?.sub || this.currentCheckpointTrigger?.element.sub;
		if (sub) offset.sub(MisUtils.parseVector3(sub));
		if (!add && !sub) {
			offset.z = 3; // Defaults to (0, 0, 3)

			if (this.game.mission.modification === 'ultra')
				offset.applyQuaternion(this.currentCheckpoint.worldOrientation); // weird <3
		}

		marble.body.position.copy(this.currentCheckpoint.worldPosition).add(offset);
		marble.body.linearVelocity.setScalar(0);
		marble.body.angularVelocity.setScalar(0);
		marble.calculatePredictiveTransforms();
		marble.group.position.copy(marble.body.position);
		marble.group.recomputeTransform();
		marble.cancelInterpolation();

		if (marble.controllingPlayer) {
		// Set camera orienation
			let euler = new Euler();
			euler.setFromQuaternion(this.currentCheckpoint.worldOrientation, "ZXY");
			marble.controllingPlayer.yaw = DEFAULT_YAW + euler.z;
			marble.controllingPlayer.pitch = DEFAULT_PITCH;
		}

		// Restore gem states
		for (let shape of this.game.shapes) {
			if (!(shape instanceof Gem)) continue;
			if (shape.pickUpHistory[0] === marble && !this.checkpointCollectedGems.has(shape)) {
				shape.pickDown();
				marble.affect(shape);
			}
		}

		// Turn all of these off
		marble.superBounceEnableFrame = -Infinity;
		marble.shockAbsorberEnableFrame = -Infinity;
		marble.helicopterEnableFrame = -Infinity;
		marble.megaMarbleEnableFrame = -Infinity;

		this.scheduledPickUpFrame = null;
		marble.outOfBoundsFrame = null;
		marble.blastAmount = this.checkpointBlast;
		marble.inFinishState = false; // For those very, very rare cases where the player touched the finish while OOB, but not fast enough, so they get respawned at the checkpoint and we need to remove the "finish lock".

		marble.unequipPowerUp(); // Always deselect first
		// Wait a bit to select the powerup to prevent immediately using it incase the user skipped the OOB screen by clicking
		if (this.checkpointHeldPowerUp) {
			this.scheduledPickUpFrame = this.game.state.frame + GAME_UPDATE_RATE/2;
			this.internalStateNeedsStore = true;
		}

		this.game.simulator.executeNonDuplicatableEvent(() => {
			AudioManager.play('spawn.wav', undefined, undefined, marble.body.position);
		}, `${this.id}spawn`);
	}

	update() {
		if (this.scheduledPickUpFrame !== null && this.game.state.frame === this.scheduledPickUpFrame) {
			this.marble.pickUpPowerUp(this.checkpointHeldPowerUp);
			this.scheduledPickUpFrame = null;
			this.internalStateNeedsStore = true;
		}
	}

	render() {}

	getState(): CheckpointStateState {
		return {
			entityType: 'checkpointState',
			currentCheckpoint: this.currentCheckpoint?.id ?? null,
			currentCheckpointTrigger: this.currentCheckpointTrigger?.id ?? null,
			checkpointCollectedGems: [...this.checkpointCollectedGems].map(x => x.id),
			checkpointHeldPowerUp: this.checkpointHeldPowerUp?.id ?? null,
			checkpointUp: this.checkpointUp,
			checkpointBlast: this.checkpointBlast
		};
	}

	getInitialState(): CheckpointStateState {
		return {
			entityType: 'checkpointState',
			currentCheckpoint: null,
			currentCheckpointTrigger: null,
			checkpointCollectedGems: [],
			checkpointHeldPowerUp: null,
			checkpointUp: null,
			checkpointBlast: null
		};
	}

	loadState(state: CheckpointStateState) {
		this.currentCheckpoint = this.game.getEntityById(state.currentCheckpoint) as Shape;
		this.currentCheckpointTrigger = this.game.getEntityById(state.currentCheckpointTrigger) as CheckpointTrigger;
		this.checkpointCollectedGems = new Set(state.checkpointCollectedGems.map(x => this.game.getEntityById(x) as Gem));
		this.checkpointHeldPowerUp = this.game.getEntityById(state.checkpointHeldPowerUp) as PowerUp;
		this.checkpointUp = state.checkpointUp && new Vector3().fromObject(state.checkpointUp);
		this.checkpointBlast = state.checkpointBlast;
	}

	getInternalState(): InternalCheckpointStateState {
		return {
			scheduledPickUpFrame: this.scheduledPickUpFrame
		};
	}

	loadInternalState(state: InternalCheckpointStateState) {
		this.scheduledPickUpFrame = state.scheduledPickUpFrame;
	}
}