import { DefaultMap } from "../../shared/default_map";
import { GameServerConnection } from "../../shared/game_server_connection";
import { CommandToData, EntityUpdate } from "../../shared/game_server_format";
import { Util } from "./util";
import { GAME_UPDATE_RATE } from '../../shared/constants';
import { performance } from 'perf_hooks';

const UPDATE_BUFFER_SIZE = 4 + 1 + 10; // In frames

interface BaseStateRequest {
	entityId: number,
	sendTo: Set<Player>,

	sentFrom: Set<Player>,
	responseFrame: number,
	update: EntityUpdate,
	id: number
}

export class Game {
	missionPath: string;
	players: Player[] = [];

	startTime: number;
	lastAdvanceTime: number;
	frame = -1;

	queuedPlayerBundles: [Player, CommandToData<'clientStateBundle'>][] = [];
	pendingPings = new DefaultMap<Player, Map<number, number>>(() => new Map());

	queuedEntityUpdates: EntityUpdate[] = [];
	updateOriginator = new WeakMap<EntityUpdate, Player>();
	allEntityUpdates: EntityUpdate[] = [];
	affectionGraph: { id: number, from: number, to: number }[] = [];
	incrementalUpdateId = 0;
	baseStateRequestId = 0;

	baseStateRequests: BaseStateRequest[] = [];
	maxReceivedBaseStateFrame = -1;

	constructor(missionPath: string) {
		this.missionPath = missionPath;
		console.log(`GAME CREATED! ${missionPath}`);

		this.start();
	}

	start() {
		this.startTime = performance.now();
		this.lastAdvanceTime = this.startTime;
	}

	addPlayer(connection: GameServerConnection) {
		let playerId = -(1 + this.players.length * 2);
		let marbleId = -(1 + this.players.length * 2 + 1);

		let player = new Player(connection, this, playerId, marbleId);
		this.players.push(player);

		//connection.addedOneWayLatency = 25;

		connection.queueCommand({
			command: 'gameJoinInfo',
			serverFrame: this.frame,
			clientFrame: this.frame + UPDATE_BUFFER_SIZE, // No better guess yet
			players: this.players.map(x => ({
				id: x.id,
				marbleId: x.marbleId
			})),
			localPlayerId: player.id,
			entityStates: []/* ?? [...this.entities].map(([, entity]) => ({
				...entity.getTrueUpdate(),
				version: entity.versions.get(player.id)
			}))*/
		}, true);

		connection.on('clientStateBundle', data => {
			this.queuedPlayerBundles.push([player, data]);
		});

		connection.on('ping', ({ timestamp }) => {
			let now = performance.now();
			this.pendingPings.get(player).set(timestamp, now);
		});

		for (let otherPlayer of this.players) {
			if (otherPlayer === player) continue;

			otherPlayer.connection.queueCommand({
				command: 'playerJoin',
				id: player.id,
				marbleId: player.marbleId
			}, true);
		}
	}

	tryAdvanceGame() {
		let now = performance.now();
		while (now - this.lastAdvanceTime >= 1000 / GAME_UPDATE_RATE) {
			this.update();
			this.lastAdvanceTime += 1000 / GAME_UPDATE_RATE;
		}
	}

	update() {
		this.frame++;
	}

	tick() {
		let now = performance.now();

		this.tryAdvanceGame();

		// First, churn through all the player bundles we recently received
		for (let [player, bundle] of this.queuedPlayerBundles)
			this.processPlayerBundle(player, bundle);
		this.queuedPlayerBundles.length = 0;

		let newUpdates = this.queuedEntityUpdates.filter(x => x.frame <= this.frame);
		Util.filterInPlace(this.queuedEntityUpdates, x => x.frame > this.frame);

		newUpdates.forEach(x => x.updateId = this.incrementalUpdateId++);
		this.allEntityUpdates.push(...newUpdates);

		// Send packets to all players
		for (let player of this.players) {
			// Filter out the updates the player themselves sent
			player.queuedEntityUpdates.push(...newUpdates.filter(x => this.updateOriginator.get(x) !== player));
			player.cleanUpQueuedUpdates();

			// If this is 0, then the player hasn't sent a bundle in a while. In that case, we also don't want to send anything to the player because we can make more informed decisions about what to send only if we have data from them.
			if (player.serverBundleBudget === 0) continue;
			player.serverBundleBudget--;

			// Compile a list of base states to be sent to the player
			let curatedBaseStateRequests: BaseStateRequest[] = [];
			for (let i = this.baseStateRequests.length-1; i >= 0; i--) {
				let request = this.baseStateRequests[i];
				if (!request.update || !request.sendTo.has(player)) continue;
				if (curatedBaseStateRequests.some(x => x.entityId === request.entityId)) continue;

				curatedBaseStateRequests.push(request);
			}

			// Queue the ting
			player.connection.queueCommand({
				command: 'serverStateBundle',
				serverFrame: this.frame,
				entityUpdates: player.queuedEntityUpdates,
				baseStateRequests: [...new Set(this.baseStateRequests.map(x => x.entityId))],
				baseState: curatedBaseStateRequests,
				maxReceivedClientUpdateFrame: player.maxReceivedClientUpdateFrame
			}, false);
		}

		for (let player of this.players) {
			for (let [timestamp, receiveTime] of this.pendingPings.get(player)) {
				let elapsed = now - receiveTime;
				player.connection.queueCommand({
					command: 'pong',
					timestamp,
					subtract: elapsed
				}, false);
			}
			this.pendingPings.get(player).clear();

			player.connection.queueCommand({
				command: 'timeState',
				serverFrame: this.frame,
				targetFrame: this.frame + player.lastEstimatedRtt + UPDATE_BUFFER_SIZE
			}, false);

			player.connection.tick();
		}

		// Remove past updates / edges if we know all players are past their ID to not explode memory
		let minMaxUpdateId = Math.min(...this.players.map(x => x.maxReceivedServerUpdateId));
		Util.filterInPlace(this.allEntityUpdates, x => x.updateId > minMaxUpdateId);
		Util.filterInPlace(this.affectionGraph, x => x.id > minMaxUpdateId);
	}

	processPlayerBundle(player: Player, bundle: CommandToData<'clientStateBundle'>) {
		player.lastEstimatedRtt = Math.max(this.frame - bundle.serverFrame, 0);
		player.maxReceivedServerUpdateId = bundle.maxReceivedServerUpdateId;

		// Remove the updates the player has already received
		Util.filterInPlace(player.queuedEntityUpdates, x => x.updateId > bundle.maxReceivedServerUpdateId);

		// Mark the base states the player has already received
		for (let request of this.baseStateRequests) {
			if (request.update && request.sendTo.has(player) && request.id <= bundle.maxReceivedBaseStateId)
				request.sendTo.delete(player);
		}
		Util.filterInPlace(this.baseStateRequests, x => x.sendTo.size > 0);

		if (bundle.clientFrame < this.frame) return; // You better be on time

		player.serverBundleBudget = 2; // The player can receive server bundle messages again

		if (bundle.baseState) this.processBaseState(bundle, player);

		// Add the client's local affection graph to the shared affection graph
		this.affectionGraph.push(...bundle.affectionGraph.map(x => ({ from: x.from, to: x.to, id: this.incrementalUpdateId })));

		// Remove the updates we've already processed before
		Util.filterInPlace(bundle.entityUpdates, x => x.frame > player.maxReceivedClientUpdateFrame);

		// Now, we compile a list of entities that are conflicting, i.e. need a base state verification.
		let conflictingEntities = new Set<number>();
		// First, add the entities the client concluded are conflicting.
		for (let id of bundle.possibleConflictingEntities) conflictingEntities.add(id);
		// Then, also add all the entities that both this and another player have sent updates about.
		this.allEntityUpdates.filter(x =>
			x.updateId > bundle.maxReceivedServerUpdateId &&
			this.updateOriginator.get(x) !== player &&
			bundle.entityUpdates.some(y => y.entityId === x.entityId)
		).forEach(x => conflictingEntities.add(x.entityId));

		let relevantEdges = this.affectionGraph.filter(edge => edge.id > bundle.maxReceivedServerUpdateId);

		for (let id of conflictingEntities) {
			// Entities conflicts propagate along affection graph edges
			for (let edge of relevantEdges) {
				if (edge.from === id) conflictingEntities.add(edge.to);
				// Because of JavaScript Set logic, this loop will automatically iterate over the newly added elements too. Awesome!
			}

			let request: BaseStateRequest = {
				entityId: id,
				responseFrame: null,
				sendTo: new Set(this.players),
				sentFrom: new Set(),
				update: null,
				id: null
			};
			this.baseStateRequests.push(request);
		}

		if (bundle.entityUpdates.length === 0) return;

		bundle.entityUpdates.sort((a, b) => a.frame - b.frame);
		player.maxReceivedClientUpdateFrame = Util.last(bundle.entityUpdates).frame;

		// See which updates we cannot apply because there's a pending base state request for them.
		let disallowedEntities = new Set<number>();
		for (let update of bundle.entityUpdates) {
			if (!this.baseStateRequests.some(x => x.entityId === update.entityId && x.sendTo.has(player))) continue;

			const disallow = (e: number) => {
				if (disallowedEntities.has(e)) return;
				disallowedEntities.add(e);
				for (let edge of relevantEdges) if (edge.from === e) disallow(edge.to);
			};
			disallow(update.entityId);
		}

		Util.filterInPlace(bundle.entityUpdates, x => !disallowedEntities.has(x.entityId));

		this.queuedEntityUpdates.push(...bundle.entityUpdates);
		this.queuedEntityUpdates.sort((a, b) => a.frame - b.frame); // Guarantee global order. Lol that sounds like some right-wing party slogan ngl

		// Remember which player these updates came from
		for (let update of bundle.entityUpdates) this.updateOriginator.set(update, player);
	}

	processBaseState(msg: CommandToData<'clientStateBundle'>, player: Player) {
		// Base states have to be fresh!
		if (this.maxReceivedBaseStateFrame >= msg.baseState.frame) return;
		this.maxReceivedBaseStateFrame = msg.baseState.frame;

		// If there's still a pending base state that the player has not acknowledged, we don't allow them to send in any base states. The (intended) result of this is that usually, the lowest-ping player will be the one that sends the first base state and will then continue being the base state authority because all the other clients are busy applying its base states before they can contribute one themselves.
		if (this.baseStateRequests.some(x => x.update && x.sendTo.has(player) && !x.sentFrom.has(player))) return;

		for (let update of msg.baseState.updates) {
			for (let request of this.baseStateRequests) {
				if (request.entityId !== update.entityId) continue;

				if (request.id === null) request.id = this.baseStateRequestId++;
				request.update = update;
				request.sentFrom.add(player);
				request.responseFrame = msg.baseState.frame;
			}
		}
	}
}

class Player {
	connection: GameServerConnection;
	game: Game;
	id: number;
	marbleId: number;

	lastEstimatedRtt = 0;
	maxReceivedClientUpdateFrame = -1;
	maxReceivedServerUpdateId = -1;
	queuedEntityUpdates: EntityUpdate[] = [];
	serverBundleBudget = 0;

	constructor(connection: GameServerConnection, game: Game, id: number, marbleId: number) {
		this.connection = connection;
		this.game = game;
		this.id = id;
		this.marbleId = marbleId;
	}

	cleanUpQueuedUpdates() {
		let count = new DefaultMap<number, number>(() => 0);

		for (let i = this.queuedEntityUpdates.length-1; i >= 0; i--) {
			let update = this.queuedEntityUpdates[i];
			count.set(update.entityId, count.get(update.entityId) + 1);
			let newCount = count.get(update.entityId);
			let maxCount = update.state?.entityType === 'player' ? 8 : 1; // Dirty hardcode 😬

			if (newCount > maxCount) this.queuedEntityUpdates.splice(i, 1);
		}
	}
}