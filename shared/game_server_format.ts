import { FixedFormatBinarySerializer, FormatToType, union } from "./fixed_format_binary_serializer";

const vector2Format = { x: 'f32', y: 'f32' } as const;
const vector3Format = { x: 'f32', y: 'f32', z: 'f32' } as const;
const quaternionFormat = { x: 'f32', y: 'f32', z: 'f32', w: 'f32' } as const;

export const marbleControlStateFormat = {
	movement: vector2Format,
	yaw: 'f32',
	pitch: 'f32',
	jumping: 'boolean',
	using: 'boolean',
	blasting: 'boolean'
} as const;

export const gameObjectStateFormat = [union, 'objectType', {
	objectType: 'marble',
	position: vector3Format,
	orientation: quaternionFormat,
	linearVelocity: vector3Format,
	angularVelocity: vector3Format,
	controlState: marbleControlStateFormat
}] as const;

export type GameObjectState = FormatToType<typeof gameObjectStateFormat>;

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
	command: 'stateUpdate',
	gameStateId: 'varint',
	gameObjectId: 'f64', // todo Make this varint
	tick: 'varint',
	precedence: 'f32',
	state: gameObjectStateFormat
}, {
	command: 'timeState',
	serverTick: 'varint',
	clientTick: 'varint'
}, {
	command: 'reconciliationInfo',
	rewindTo: 'varint'
}] as const;

export const gameServerMessageFormat = FixedFormatBinarySerializer.format({
	packetId: 'varint',
	ack: 's32',
	commands: [gameServerCommandFormat]
} as const);

export type GameServerMessage = FormatToType<typeof gameServerMessageFormat>;
export type GameServerCommands = GameServerMessage['commands'][number]['command'];