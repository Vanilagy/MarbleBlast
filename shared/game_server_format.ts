import { FixedFormatBinarySerializer, FormatToType, nullable, union } from "./fixed_format_binary_serializer";

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

export const entityUpdateFormat = {
	updateId: 'varint',
	entityId: 'f64', // todo make this varint
	frame: 'varint',
	owned: 'boolean',
	challengeable: 'boolean',
	originator: 'varint',
	version: 'varint',
	state: [nullable, gameObjectStateFormat]
} as const;

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
	command: 'clientStateBundle',
	currentClientFrame: 's32',
	entityUpdates: [entityUpdateFormat],
	affectionGraph: [{ from: 'f64', to: 'f64' }], // todo make this varint
	lastReceivedServerUpdateId: 's32'
}, {
	command: 'serverStateBundle',
	entityUpdates: [entityUpdateFormat],
	lastReceivedClientUpdateId: 's32',
	lastReceivedClientFrame: 's32',
	rewindToFrameCap: 's32'
}, {
	command: 'timeState',
	serverTick: 's32',
	clientTick: 's32'
}, {
	command: 'gameInfo',
	playerId: 'varint',
	serverTick: 's32',
	clientTick: 's32'
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