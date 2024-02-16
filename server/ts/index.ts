import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import * as Database from 'better-sqlite3';
import * as fs from 'fs-extra';
import * as serveStatic_ from 'serve-static';
import finalhandler from 'finalhandler';

// Do some hackery to satisfy rollup
const serveStatic = serveStatic_;

import { shared } from './shared';
import { getDirectoryStructure, getVersionHistory, logUserError, registerActivity, registerLevelStatistics } from './misc';
import { getLeaderboard, submitScores, getWorldRecordSheet, getWorldRecordReplay, getLeaderboardForMarbleland } from './leaderboard';
import { getCustomLevelList, getCustomLevelResource, periodicallyUpdateCustomLevelList } from './customs';

let db: Database.Database = null;
const doBackup = false;

/** Sets up the database and creates tables, indices and prepared statements. */
const setupDb = () => {
	db = new Database(path.join(__dirname, 'storage', 'main.db'));
	shared.db = db;

	db.exec(`
		CREATE TABLE IF NOT EXISTS score (
			mission VARCHAR(255),
			time DOUBLE,
			username VARCHAR(255),
			user_random_id VARCHAR(255),
			timestamp BIGINT,
			wrec BLOB
		);
		CREATE INDEX IF NOT EXISTS index_1 ON score(mission, username, time);
		CREATE INDEX IF NOT EXISTS index_2 ON score(mission, user_random_id, time);
		CREATE INDEX IF NOT EXISTS index_3 ON score(mission, time, username);
		CREATE INDEX IF NOT EXISTS index_4 ON score(timestamp);

		CREATE TABLE IF NOT EXISTS level_statistics (
			mission VARCHAR(255),
			start_time BIGINT,
			tries INTEGER,
			finishes INTEGER,
			out_of_bounds_count INTEGER,
			time_paused INTEGER,
			end_time BIGINT,
			user_random_id VARCHAR(255)
		);
	`);
	db.pragma('journal_mode = WAL'); // Significantly improves performance

	// Prepare the statements now for later use

	shared.getLeaderboardForMissionStatement = db.prepare(`
		SELECT s1.username, MIN(s1.time) as time, s1.wrec IS NOT NULL as has_wrec
		FROM score s1
		WHERE mission = ?
		AND s1.time = min(
			(
				SELECT MIN(s2.time)
				FROM score s2
				WHERE s2.mission = s1.mission AND s2.username = s1.username
			),
			(
				SELECT MIN(s2.time)
				FROM score s2
				WHERE s2.mission = s1.mission AND s2.user_random_id = s1.user_random_id
			)
		)
		GROUP BY s1.username
		ORDER BY s1.time ASC;
	`);
	shared.insertScoreStatement = db.prepare(`
		INSERT INTO score (mission, time, username, user_random_id, timestamp, wrec)
		VALUES (?, ?, ?, ?, ?, ?);
	`);
	shared.getTopScoreStatement = db.prepare(`
		SELECT time, username
		FROM score
		WHERE mission = ?
		ORDER BY time ASC, timestamp ASC
		LIMIT 1;
	`);
	shared.getTopScoreWrecStatement = db.prepare(`
		SELECT wrec
		FROM score
		WHERE mission = ?
		ORDER BY time ASC, timestamp ASC
		LIMIT 1;
	`);
	shared.getNewerTopScoresStatement = db.prepare(`
		SELECT s1.mission, MIN(s1.time) as time, s1.username, s1.wrec IS NOT NULL as has_wrec
		FROM score s1
		WHERE timestamp > ?
		AND s1.time = min(
			(
				SELECT MIN(s2.time)
				FROM score s2
				WHERE s2.mission = s1.mission AND s2.username = s1.username
			),
			(
				SELECT MIN(s2.time)
				FROM score s2
				WHERE s2.mission = s1.mission AND s2.user_random_id = s1.user_random_id
			)
		)
		GROUP BY s1.mission, s1.username;
	`);
	shared.getLatestTimestampStatement = db.prepare(`SELECT MAX(timestamp) FROM score;`);
	shared.insertLevelStatistics = db.prepare(`
		INSERT INTO level_statistics (mission, start_time, tries, finishes, out_of_bounds_count, time_paused, end_time, user_random_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?);
	`);

	if (doBackup) {
		setInterval(backupStuff, 3.5 * 24 * 60 * 60 * 1000); // Biweekly
		backupStuff();
	}
};

const backupStuff = () => {
	let yyyymmdd = new Date().toISOString().split('T')[0];
	let fileName = `main_backup_${yyyymmdd}.db`;

	db.pragma('wal_checkpoint(RESTART)'); // First, checkpoint the WAL to the database so that its changes get backed up too
	db.backup(path.join(__dirname, 'storage', 'backups', fileName))
		.then(() => console.log(`Successfully created database backup file ${fileName}.`))
		.catch((err) => console.error("Backup failed: ", err));
};

/** Starts the HTTP server. */
const initServer = (port: number) => {
	const serve = serveStatic(shared.directoryPath, {
		index: ['index.html']
	});

	http.createServer((req, res) => {
		let urlObject = new url.URL(req.url, 'http://localhost/');
		let pathComponents = urlObject.pathname.split('/').slice(1);
		let body: string = null;
		let bodyBuffer: Buffer = null;

		const handleRequest = async () => {
			try {
				// Determine the type of request
				outer:
				if (pathComponents[0] === 'api') {
					// We're handling a special API request
					switch (pathComponents[1]) {
						case 'directory_structure': await getDirectoryStructure(res); break;
						case 'directory_structure_mbp': await getDirectoryStructure(res, true); break;
						case 'scores': await getLeaderboard(res, body); break;
						case 'marbleland_scores': await getLeaderboardForMarbleland(res, urlObject); break;
						case 'submit': await submitScores(res, body); break;
						case 'customs': await getCustomLevelList(res); break;
						case 'custom': await getCustomLevelResource(res, urlObject); break;
						case 'sheet': await getWorldRecordSheet(res); break;
						case 'error': await logUserError(res, body); break;
						case 'version_history': await getVersionHistory(res); break;
						case 'activity': await registerActivity(res, urlObject); break;
						case 'world_record_replay': await getWorldRecordReplay(res, urlObject); break;
						case 'statistics': await registerLevelStatistics(res, body); break;
						default: break outer; // Incorrect API function
					}

					return;
				}

				// Just serve the file normally
				serve(req, res, finalhandler(req, res) as any);
			} catch (e) {
				// If we encounter any error, return a 500
				console.error(e);
				res.writeHead(500);
				res.end();
			}
		};

		if (req.method === 'POST') {
			// Get the body
			let chunks: Buffer[] = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				bodyBuffer = Buffer.concat(chunks);
				body = bodyBuffer.toString();
				handleRequest();
			});
		} else {
			handleRequest();
		}
	}).listen(port);

	console.log(`Started server on port ${port}.`);
};

/** Initializes the server. */
const init = () => {
	console.log("Starting...");

	// Ensure certain directories and files exist
	fs.ensureDirSync(path.join(__dirname, 'storage'));
	fs.ensureDirSync(path.join(__dirname, 'storage', 'customs'));
	fs.ensureDirSync(path.join(__dirname, 'storage', 'backups'));
	fs.ensureFileSync(path.join(__dirname, 'storage', 'logs', 'user_errors.log'));

	shared.customLevelListPath = path.join(__dirname, 'storage', 'customs.json');
	if (!fs.existsSync(shared.customLevelListPath)) fs.writeFileSync(shared.customLevelListPath, '[]');

	shared.config = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'config.json')).toString());
	shared.directoryPath = path.join(__dirname, '..', shared.config.useDist? 'dist' : 'src');
	shared.levelNameMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'level_name_map.json')).toString());
	shared.customLevelList = JSON.parse(fs.readFileSync(shared.customLevelListPath).toString());

	let port = Number(shared.config.port);

	setupDb();
	initServer(port);
	periodicallyUpdateCustomLevelList();
};
init();

process.on('exit', () => {
	console.log("Stopping...");
	db?.close(); // Gracefully shutdown the SQLite connection
});
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));