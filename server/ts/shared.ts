import * as Database from 'better-sqlite3';

/** A custom levels archive entry. */
interface CLAEntry {
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

export const shared: {
	/** The path to the served HTML directory. */
	directoryPath: string,
	config: {
		/** Port for the HTTP server */
		port: number,
		/** Whether or not to use the distribution folder as the directory path */
		useDist: boolean,
		/** The Discord webhook URL to send world record annoucements to */
		discordWebhookUrl: string,
		/** Make sure custom levels have at least this many scores before broadcasting an annoucement. */
		webhookCustomMinScoreThreshold: number
	},
	/** List of all custom levels */
	claList: CLAEntry[],
	/** Maps mission path to level name */
	levelNameMap: Record<string, string>,

	db: Database.Database,
	getScoresForMissionStatement: Database.Statement,
	getScoreByUserStatement: Database.Statement,
	deleteScoresStatement: Database.Statement,
	insertScoreStatement: Database.Statement,
	getTopScoreStatement: Database.Statement,
	getMissionScoreCount: Database.Statement,
	getChangedMissionsStatement: Database.Statement,
	getLatestTimestampStatement: Database.Statement
} = {} as any;