import * as Database from 'better-sqlite3';

/** A custom levels archive entry. */
interface CustomLevelInfo {
	id: number,
	baseName: string,
	gameType: 'single' | 'multi',
	modification: 'gold' | 'platinum' | 'fubar' | 'ultra' | 'platinumquest',
	name: string,
	artist: string,
	desc: string,
	addedAt: number,
	gameMode: string,
	editedAt: number,

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
	hasEasterEgg: boolean,

	downloads: number,
	lovedCount: number,

	hasCustomCode: boolean,
	datablockCompatibility: 'mbg' | 'mbw' | 'pq'
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
		/** The Discord webhook URL to send custom level world record annoucements to */
		discordWebhookUrlCustom: string,
		/** Make sure custom levels have at least this many scores before broadcasting an annoucement. */
		webhookCustomMinScoreThreshold: number,
		/** The origin in which the website runs. */
		origin: string
	},
	customLevelListPath: string,
	/** List of all custom levels */
	customLevelList: CustomLevelInfo[],
	/** Maps mission path to level name */
	levelNameMap: Record<string, string>,

	db: Database.Database,
	getLeaderboardForMissionStatement: Database.Statement,
	insertScoreStatement: Database.Statement,
	getTopScoreStatement: Database.Statement,
	getTopScoreWrecStatement: Database.Statement,
	getNewerTopScoresStatement: Database.Statement,
	getLatestTimestampStatement: Database.Statement,
	insertLevelStatistics: Database.Statement
} = {} as any;