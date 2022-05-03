import { FixedFormatBinarySerializer, FormatToType, nullable, partial, union } from "./fixed_format_binary_serializer";

const vector2Format = { x: 'f32', y: 'f32' } as const;
const vector3Format = { x: 'f32', y: 'f32', z: 'f32' } as const;
const quaternionFormat = { x: 'f32', y: 'f32', z: 'f32', w: 'f32' } as const;

export const entityStateFormat = [union, 'entityType', {
	entityType: 'marble',
	position: vector3Format,
	orientation: quaternionFormat,
	linearVelocity: vector3Format,
	angularVelocity: vector3Format,
	extras: [partial, {
		heldPowerUp: 'varint',
		helicopterEnableFrame: 'varint',
		superBounceEnableFrame: 'varint',
		shockAbsorberEnableFrame: 'varint',
		orientationQuat: quaternionFormat,
		respawnFrame: 'varint',
		outOfBoundsFrame: 'varint',
		teleportStates: [{
			trigger: 'varint',
			entryFrame: [nullable, 'varint'],
			exitFrame: [nullable, 'varint']
		}],
		teleportEnableTime: 'f32',
		teleportDisableTime: 'f32'
	}]
}, {
	entityType: 'player',
	controlState: {
		movement: vector2Format,
		yaw: 'f32',
		pitch: 'f32',
		jumping: 'boolean',
		using: 'boolean',
		blasting: 'boolean'
	}
}, {
	entityType: 'clock',
	time: 'f64',
	timeTravelBonus: 'f64'
}, {
	entityType: 'pathedInterior',
	currentTime: 'f64',
	targetTime: 'f64',
	changeTime: 'f64'
}, {
	entityType: 'gem',
	pickedUpBy: [nullable, 'varint']
}, {
	entityType: 'powerUp',
	lastPickUpTime: [nullable, 'f64'],
	pickedUpBy: [nullable, 'varint']
}, {
	entityType: 'bumper',
	lastContactTime: 'f64'
}, {
	entityType: 'trapDoor',
	lastContactTime: 'f64'
}, {
	entityType: 'explosive',
	disappearTime: 'f64'
}, {
	entityType: 'helpTrigger',
	entered: ['varint'],
	enteredFrame: 'varint'
}, {
	entityType: 'pushButton',
	lastContactTime: 'f64'
}, {
	entityType: 'balloon',
	position: vector3Format,
	orientation: quaternionFormat,
	linearVelocity: vector3Format,
	angularVelocity: vector3Format
}, {
	entityType: 'checkpointState',
	currentCheckpoint: [nullable, 'varint'],
	currentCheckpointTrigger: [nullable, 'varint'],
	checkpointCollectedGems: ['varint'],
	checkpointHeldPowerUp: [nullable, 'varint'],
	checkpointUp: [nullable, vector3Format],
	checkpointBlast: [nullable, 'f32']
}] as const;

export const entityUpdateFormat = {
	updateId: 'varint',
	entityId: 'varint',
	frame: 'varint',
	state: [nullable, entityStateFormat]
} as const;

export type EntityState = FormatToType<typeof entityStateFormat>;

export const playerFormat = {
	id: 'varint',
	marbleId: 'varint',
	checkpointStateId: 'varint'
} as const;

export const gameServerCommandFormat = [union, 'command', {
	command: 'ping',
	timestamp: 'f32'
}, {
	command: 'pong',
	timestamp: 'f32',
	subtract: 'f32'
}, {
	command: 'joinMission',
	missionPath: 'string'
}, {
	command: 'clientStateBundle',
	serverFrame: 'varint',
	clientFrame: 'varint',
	entityUpdates: [entityUpdateFormat],
	affectionGraph: [{
		from: 'varint',
		to: 'varint'
	}],
	possibleConflictingEntities: ['varint'],
	baseState: [nullable, {
		frame: 'varint',
		updates: [entityUpdateFormat]
	}],
	maxReceivedServerUpdateId: 'varint',
	maxReceivedBaseStateId: 'varint'
}, {
	command: 'serverStateBundle',
	serverFrame: 'varint',
	entityUpdates: [entityUpdateFormat],
	baseStateRequests: ['varint'],
	baseState: [{
		id: 'varint',
		responseFrame: 'varint',
		update: entityUpdateFormat
	}],
	maxReceivedClientUpdateFrame: 'varint'
}, {
	command: 'timeState',
	serverFrame: 'varint',
	targetFrame: 'varint'
}, {
	command: 'gameJoinInfo',
	serverFrame: 'varint',
	clientFrame: 'varint',
	players: [playerFormat],
	localPlayerId: 'varint',
	entityStates: [entityUpdateFormat]
}, {
	command: 'playerJoin',
	...playerFormat
}] as const;

export const gameServerMessageFormat = FixedFormatBinarySerializer.format({
	packetId: 'varint',
	ack: 's32',
	commands: [gameServerCommandFormat]
} as const);

export type GameServerMessage = FormatToType<typeof gameServerMessageFormat>;
export type GameServerCommands = GameServerMessage['commands'][number]['command'];

export type CommandToData<K extends GameServerCommands> = DistributeyThing<GameServerMessage['commands'][number], K>;
type DistributeyThing<U, K> = U extends { command: K } ? U : never;

export type EntityUpdate = Omit<FormatToType<typeof entityUpdateFormat>, 'command'>;