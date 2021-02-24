import * as Database from 'better-sqlite3';

/** A custom levels archive entry. */
interface CLAEntry {
	addTime: string,
	artist: string,
	baseName: string,
	bitmap: string,
	desc: string,
	difficulty: string,
	egg: boolean,
	gameType: string,
	gems: number,
	goldTime: number,
	id: number,
	modification: string,
	name: string,
	rating: number,
	time: number,
	weight: number
}

export const shared: {
	/** The path to the served HTML directory. */
	directoryPath: string,
	/** The main database. */
	db: Database.Database,
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

	getScoresForMissionStatement: Database.Statement,
	getScoreByUserStatement: Database.Statement,
	updateScoreStatement: Database.Statement,
	insertScoreStatement: Database.Statement,
	getTopScoreStatement: Database.Statement,
	getMissionScoreCount: Database.Statement,
	getNewerScoresStatement: Database.Statement,
	getLatestTimestampStatement: Database.Statement
} = {} as any;