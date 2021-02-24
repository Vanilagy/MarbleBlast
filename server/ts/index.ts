import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import * as Database from 'better-sqlite3';
import * as fs from 'fs-extra';
import * as serveStatic_ from 'serve-static';
import * as finalhandler_ from 'finalhandler';

// Do some hackery to satisfy rollup
const serveStatic = serveStatic_;
const finalhandler = finalhandler_;

import { shared } from './shared';
import { getDirectoryStructure, logUserError } from './misc';
import { getLeaderboard, submitScores, getWorldRecordSheet } from './leaderboard';
import { getCustomLevelResource } from './customs';

/** Sets up the database and creates tables, indices and prepared statements. */
const setupDb = () => {
	shared.db = new Database(path.join(__dirname, 'storage', 'main.db'));
	shared.db.exec(`
		CREATE TABLE IF NOT EXISTS score (
			mission VARCHAR(255),
			time DOUBLE,
			username VARCHAR(255),
			user_random_id VARCHAR(255),
			timestamp BIGINT
		);
		CREATE INDEX IF NOT EXISTS mission_index ON score (mission);
		CREATE INDEX IF NOT EXISTS timestamp_index ON score (timestamp);
	`);
	shared.db.pragma('journal_mode = WAL'); // Significantly improves performance

	// Prepare the statements now for later use
	shared.getScoresForMissionStatement = shared.db.prepare(`SELECT time, username FROM score WHERE mission=? ORDER BY time ASC, timestamp ASC;`);
	shared.getScoreByUserStatement = shared.db.prepare(`SELECT rowid, time FROM score WHERE mission=? AND (username=? OR user_random_id=?);`);
	shared.updateScoreStatement = shared.db.prepare(`UPDATE score SET time=?, username=?, user_random_id=?, timestamp=? WHERE rowid=?;`);
	shared.insertScoreStatement = shared.db.prepare(`INSERT INTO score VALUES (?, ?, ?, ?, ?);`);
	shared.getTopScoreStatement = shared.db.prepare(`SELECT time, username FROM score WHERE mission=? ORDER BY time ASC, timestamp ASC LIMIT 1;`);
	shared.getMissionScoreCount = shared.db.prepare(`SELECT COUNT(*) FROM score WHERE mission=?;`);
	shared.getNewerScoresStatement = shared.db.prepare(`SELECT mission FROM score WHERE timestamp>?;`);
	shared.getLatestTimestampStatement = shared.db.prepare(`SELECT MAX(timestamp) FROM score;`);
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
						case 'scores': await getLeaderboard(res, body); break;
						case 'submit': await submitScores(res, body); break;
						case 'custom': await getCustomLevelResource(res, urlObject); break;
						case 'sheet': await getWorldRecordSheet(res); break;
						case 'error': await logUserError(res, body); break;
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

	shared.config = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'config.json')).toString());
	shared.directoryPath = path.join(__dirname, '..', shared.config.useDist? 'dist' : 'src');
	shared.levelNameMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'level_name_map.json')).toString());
	shared.claList = JSON.parse(fs.readFileSync(path.join(shared.directoryPath, 'assets', 'cla_list.json')).toString());
	let port = Number(shared.config.port);

	// Ensure certain directories and files exist
	fs.ensureDirSync(path.join(__dirname, 'storage'));
	fs.ensureDirSync(path.join(__dirname, 'storage', 'wrecs'));
	fs.ensureDirSync(path.join(__dirname, 'storage', 'customs'));
	fs.ensureFileSync(path.join(__dirname, 'storage', 'logs', 'user_errors.log'));
	
	setupDb();
	initServer(port);
};
init();