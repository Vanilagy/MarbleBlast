export interface OfficialMissionDescription {
	path: string,
	misPath: string,
	type: string,
	index: number,

	name: string,
	artist: string,
	desc: string,
	gameMode: string,

	qualifyingTime: number,
	goldTime: number,
	platinumTime: number,
	ultimateTime: number,

	hasEasterEgg: boolean
}

/** A custom levels archive entry. */
export interface CLAEntry {
	id: number,
	baseName: string,
	gameType: string,
	modification: string,
	name: string,
	artist: string,
	desc: string,
	addedAt: number,
	gameMode: string,

	qualifyingTime: number,
	goldTime: number,
	platinumTime: number,
	ultimateTime: number,
	awesomeTime: number,

	qualifyingScore: number,
	goldScore: number,
	platinumScore: number,
	ultimateScore: number,
	awesomeScore: number,

	gems: number,
	hasEasterEgg: boolean
}

export interface LobbySettings {
	missionPath: string,
	mode: 'coop' | 'hunt',
	gameServer: string
}