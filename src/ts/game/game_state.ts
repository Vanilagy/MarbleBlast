import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { DefaultMap } from "../../../shared/default_map";
import { GameObjectUpdate } from "../../../shared/game_server_format";
import { AudioManager } from "../audio";
import { DEFAULT_PITCH, PHYSICS_TICK_RATE } from "../level";
import { Euler } from "../math/euler";
import { Vector3 } from "../math/vector3";
import { MissionElementSimGroup, MissionElementTrigger, MisParser } from "../parsing/mis_parser";
import { StartPad } from "../shapes/start_pad";
import { state } from "../state";
import { Util } from "../util";
import { Game } from "./game";
import { GameObject } from "./game_object";

export const GO_TIME = 0 ?? 3.5; // fixme

export class GameState {
	game: Game;
	id = 0;

	tick = -1;
	attemptTick = -1;
	clock = 0;

	get time() {
		return (this.tick + this.subtickCompletion) / GAME_UPDATE_RATE;
	}

	get attemptTime() {
		return (this.attemptTick + this.subtickCompletion) / GAME_UPDATE_RATE;
	}

	subtickCompletion = 0;

	stateHistory = new DefaultMap<number, GameObjectUpdate[]>(() => []);

	collectedGems = 0;
	currentTimeTravelBonus = 0;

	gameObjectGraphHistory = new DefaultMap<number, {
		tick: number,
		owner: number,
		version: number,
		adj: Set<GameObject>
	}[]>(() => []);

	constructor(game: Game) {
		this.game = game;
	}

	advanceTime() {
		if (this.attemptTime >= GO_TIME) {
			if (this.currentTimeTravelBonus > 0) {
				// Subtract remaining time travel time
				this.currentTimeTravelBonus -= 1 / GAME_UPDATE_RATE;
			} else {
				// Increase the gameplay time
				this.clock += 1 / PHYSICS_TICK_RATE;
			}

			if (this.currentTimeTravelBonus < 0) {
				// If we slightly undershot the zero mark of the remaining time travel bonus, add the "lost time" back onto the gameplay clock:
				this.clock += -this.currentTimeTravelBonus;
				this.currentTimeTravelBonus = 0;
			}
		}

		this.tick++;
		this.attemptTick++;
	}

	restart() {
		let { game } = this;
		let hud = state.menu.hud;

		this.clock = 0;
		this.attemptTick = -1;
		this.currentTimeTravelBonus = 0;

		if (game.totalGems > 0) {
			this.collectedGems = 0;
			hud.displayGemCount(this.collectedGems, game.totalGems);
		}

		let marble = game.marble;
		let { position: startPosition, euler } = this.getStartPositionAndOrientation();

		// Todo put all this shit into marble bro! what the fuck are you thinking
		// Place the marble a bit above the start pad position
		marble.body.position.set(startPosition.x, startPosition.y, startPosition.z + 3);
		marble.body.syncShapes();
		marble.group.position.copy(marble.body.position);
		marble.group.recomputeTransform();
		marble.reset();
		marble.calculatePredictiveTransforms();

		let missionInfo = game.mission.missionInfo;
		if (missionInfo.starthelptext)
			hud.displayHelp(missionInfo.starthelptext); // Show the start help text

		for (let object of game.objects) object.reset();

		game.timeTravelSound?.stop();
		game.timeTravelSound = null;
		game.alarmSound?.stop();
		game.alarmSound = null;

		AudioManager.play('spawn.wav');
	}

	saveStates() {
		for (let i = 0; i < this.game.objects.length; i++) {
			let object = this.game.objects[i];
			if (object.hasChangedState) {
				let arr = this.stateHistory.get(object.id);
				if (Util.last(arr)?.tick === this.tick) arr.pop();

				let node = this.getGameObjectGraphNode(object);

				let stateUpdate: GameObjectUpdate = {
					gameStateId: this.id,
					gameObjectId: object.id,
					tick: this.tick,
					owner: node.owner,
					originator: this.game.playerId,
					version: node.version,
					state: object.getCurrentState()
				};
				arr.push(stateUpdate);

				object.hasChangedState = false;
			}
		}
	}

	/** Gets the position and orientation of the player spawn point. */
	getStartPositionAndOrientation() {
		let { game } = this;

		// The player is spawned at the last start pad in the mission file.
		let startPad = Util.findLast(game.shapes, (shape) => shape instanceof StartPad);
		let position: Vector3;
		let euler = new Euler();

		if (startPad) {
			// If there's a start pad, start there
			position = startPad.worldPosition;
			euler.setFromQuaternion(startPad.worldOrientation, "ZXY");
		} else {
			// Search for spawn points used for multiplayer
			let spawnPoints = game.mission.allElements.find(x => x._name === "SpawnPoints") as MissionElementSimGroup;
			if (spawnPoints) {
				let first = spawnPoints.elements[0] as MissionElementTrigger;
				position = MisParser.parseVector3(first.position);
			} else {
				// If there isn't anything, start at this weird point
				position = new Vector3(0, 0, 300);
			}
		}

		return { position, euler };
	}

	rollBackToTick(target: number) {
		if (target === this.tick) return;

		for (let [, graphHistory] of this.gameObjectGraphHistory) {
			let last = Util.last(graphHistory);
			while (last && last.tick > target) last = graphHistory.pop();
		}

		for (let [objectId, updateHistory] of this.stateHistory) {
			let changed = false;
			while (Util.last(updateHistory) && Util.last(updateHistory).tick > target) {
				updateHistory.pop();
				changed = true;
			}

			if (!changed) continue;

			let object = this.game.objects.find(x => x.id === objectId); // todo optimize

			let update = Util.last(updateHistory);
			let state = update?.state ?? object.getInitialState();

			object.loadState(state);
		}

		this.game.simulator.world.updateCollisions(); // Since positions might have changed, collisions probably have too

		this.tick = target;
		// todo: attemptTick
	}

	applyGameObjectUpdate(update: GameObjectUpdate): boolean {
		let object = this.game.objects.find(x => x.id === update.gameObjectId); // todo optimize
		if (!object) return false; // temp right?

		let node = this.getGameObjectGraphNode(object);
		let us = this.game.playerId;
		let shouldLoadState = (node.owner !== us || update.version > node.version) && update.originator !== us;

		node.version = update.version;

		if (update.owner === update.originator) {
			node.owner = null;
			this.clearGameObjectConnections(object);
		}

		if (shouldLoadState) {
			object.loadState(update.state);
			object.hasChangedState = true;

			return true; // Meaning the update has actually been applied
		}

		return false;
	}

	getGameObjectGraphNode(object: GameObject) {
		let history = this.gameObjectGraphHistory.get(object.id);
		let last = Util.last(history);
		if (last?.tick !== this.tick) history.push(last = {
			tick: this.tick,
			owner: last?.owner ?? null,
			version: last?.version ?? 0,
			adj: new Set(last?.adj)
		});

		return last;
	}

	recordGameObjectInteraction(o1: GameObject, o2: GameObject) {
		let node1 = this.getGameObjectGraphNode(o1);
		let node2 = this.getGameObjectGraphNode(o2);

		node1.adj.add(o2);
		node2.adj.add(o1);

		let us = this.game.playerId;

		if (node1.owner === us) this.setOwnership(o2, us);
		if (node2.owner === us) this.setOwnership(o1, us);
	}

	setOwnership(object: GameObject, owner: number) {
		let node = this.getGameObjectGraphNode(object);
		if (node.owner === owner) return;

		node.owner = owner;
		for (let neighbor of node.adj) this.setOwnership(neighbor, owner);
	}

	clearGameObjectConnections(object: GameObject) {
		let node = this.getGameObjectGraphNode(object);

		for (let neighbor of node.adj) {
			let neighborNode = this.getGameObjectGraphNode(neighbor);
			neighborNode.adj.delete(object);
		}
		node.adj.clear();
	}
}