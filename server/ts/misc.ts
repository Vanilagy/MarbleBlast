import * as http from 'http';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as url from 'url';

import { shared } from './shared';

/** Holds a directory structure. If the value is null, then the key is a file, otherwise the key is a directory and the value is another directory structure. */
type DirectoryStructure = {[name: string]: null | DirectoryStructure};

/** Sends the current asset directory structure. */
export const getDirectoryStructure = async (res: http.ServerResponse, mbp = false) => {
	/** Scans the directory recursively. */
	const scanDirectory = async (directoryPath: string) => {
		let files = await fs.readdir(directoryPath);
		let temp: DirectoryStructure = {};
		let promises: Promise<void>[] = [];

		for (let file of files) {
			promises.push(new Promise(async resolve => {
				let newPath = path.join(directoryPath, file);
				let stats = await fs.stat(newPath);
				if (stats.isDirectory()) temp[file] = await scanDirectory(newPath); // Recurse if necessary
				else temp[file] = null;

				resolve();
			}));
		}

		await Promise.all(promises);

		// Sort the keys to guarantee a deterministic outcome despite asynchronous nature of the function
		let keys = Object.keys(temp).sort((a, b) => a.localeCompare(b));
		let result: DirectoryStructure = {};
		for (let key of keys) result[key] = temp[key];
		return result;
	};

	let structure = await scanDirectory(path.join(shared.directoryPath, 'assets', mbp? 'data_mbp' : 'data'));

	res.writeHead(200, {
		'Content-Type': 'application/json'
	});
	res.end(JSON.stringify(structure));
};

/** Appends new user errors to a log file. */
export const logUserError = async (res: http.ServerResponse, body: string) => {
	let data: {
		userAgent: string,
		errors: {
			message: string,
			line: number,
			column: number,
			filename: string
		}[]
	} = JSON.parse(body);

	let str = "";

	// Add the date
	str += new Date().toISOString() + ' | ' + data.userAgent + '\n';
	for (let error of data.errors) {
		// Add all errors
		str += `${error.filename}:${error.line}:${error.column} ${error.message}\n`;
	}
	str += '\n';

	// Append at the end
	await fs.appendFile(path.join(__dirname, 'storage', 'logs', 'user_errors.log'), str);

	res.writeHead(200, {
		'Cache-Control': 'no-cache, no-store'
	});
	res.end();
};

/** Sends the version history file contents. */
export const getVersionHistory = async (res: http.ServerResponse) => {
	const contents = await fs.readFile(path.join(__dirname, '../version_history.md'));

	res.writeHead(200, {
		'Content-Type': 'text/markdown',
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end(contents);
};

const idActivityTimes = new Map<string, number>();

export const registerActivity = async (res: http.ServerResponse, urlObject: url.URL) => {
	let id = urlObject.searchParams.get('id');
	let has = idActivityTimes.has(id);
	idActivityTimes.set(id, Date.now());
	if (!has) appendToActivityFile();

	res.writeHead(200, {
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end();
};

setInterval(() => {
	let now = Date.now();
	let changed = false;

	for (let [id, timestamp] of idActivityTimes) {
		if (now - timestamp >= 60000) {
			idActivityTimes.delete(id);
			changed = true;
		}
	}

	if (changed) appendToActivityFile();
}, 1000);

const appendToActivityFile = () => {
	fs.appendFile(path.join(__dirname, 'storage/activity.txt'), new Date().toISOString() + ' - ' + idActivityTimes.size + '\n');
};

export const registerLevelStatistics = async (res: http.ServerResponse, body: string) => {
	let data: {
		missionPath: string,
		startTime: number,
		tries: number,
		finishes: number,
		outOfBoundsCount: number,
		timePaused: number,
		endTime: number,
		userRandomId: string
	} = JSON.parse(atob(body));

	shared.insertLevelStatistics.run(
		data.missionPath,
		data.startTime,
		data.tries,
		data.finishes,
		data.outOfBoundsCount,
		data.timePaused,
		data.endTime,
		data.userRandomId
	);

	res.writeHead(200, {
		'Cache-Control': 'no-cache, no-store' // Don't cache this
	});
	res.end();
};