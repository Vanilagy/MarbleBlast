import * as fs from 'fs-extra';
import * as path from 'path';
import { Response } from 'express';

import { apiInits, shared } from './shared';

/** Holds a directory structure. If the value is null, then the key is a file, otherwise the key is a directory and the value is another directory structure. */
type DirectoryStructure = {[name: string]: null | DirectoryStructure};

const idActivityTimes = new Map<string, number>();

apiInits.push((app) => {
	app.get('/api/directory_structure', (req, res) => {
		getDirectoryStructure(res, false);
	});

	app.get('/api/directory_structure_mbp', (req, res) => {
		getDirectoryStructure(res, true);
	});

	// Appends new user errors to a log file.
	app.post('/api/error', async (req, res) => {
		let data: {
			userAgent: string,
			errors: {
				message: string,
				line: number,
				column: number,
				filename: string
			}[]
		} = req.body;

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

		res.set('Cache-Control', 'no-cache, no-store');
		res.end();
	});

	// Sends the version history file contents.
	app.get('/api/version_history', async (req, res) => {
		const contents = await fs.readFile(path.join(__dirname, '../version_history.md'));

		res.set('Content-Type', 'text/markdown');
		res.set('Cache-Control', 'no-cache, no-store'); // Don't cache this
		res.send(contents);
	});

	app.get('/api/activity', async (req, res) => {
		let id = req.query.id as string;
		let has = idActivityTimes.has(id);
		idActivityTimes.set(id, Date.now());
		if (!has) appendToActivityFile();

		res.set('Cache-Control', 'no-cache, no-store'); // Don't cache this
		res.end();
	});
});

/** Sends the current asset directory structure. */
export const getDirectoryStructure = async (res: Response, mbp = false) => {
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

	res.send(structure);
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