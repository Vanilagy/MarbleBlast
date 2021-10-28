import * as http from 'http';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as url from 'url';
import fetch from 'node-fetch';
import JSZip from 'jszip';

import { shared } from './shared';

/** Transmits a custom level resource, so either an image or an archive. */
export const getCustomLevelResource = async (res: http.ServerResponse, urlObject: url.URL) => {
	let pathComponents = urlObject.pathname.split('/').slice(1);
	let resourceName = pathComponents[2]; // The id and file type are encoded in the path (e.g. 1234.jpg or 1234.zip)
	let extension = resourceName.slice(resourceName.indexOf('.') + 1);
	let id = Number(resourceName.slice(0, resourceName.indexOf('.')));
	if (!Number.isInteger(id)) throw new Error("Invalid custom level ID.");

	if (extension === 'jpg') await getCustomLevelBitmap(res, id);
	else if (extension === 'zip') await getCustomLevelArchive(res, id);
	else throw new Error("Invalid custom level resource type.");
};

/** Transmits a custom level bitmap. */
const getCustomLevelBitmap = async (res: http.ServerResponse, id: number) => {
	let filePath = path.join(__dirname, 'storage', 'customs', `bitmap${id}.jpg`);
	let exists = await fs.pathExists(filePath); // See if the bitmap has already been downloaded and saved

	if (!exists) {
		// If it doesn't exist yet, fetch it from the Marbleland API
		let response = await fetch(`https://marbleland.vani.ga/api/level/${id}/image?width=258&height=194`);
		if (!response.ok) {
			res.writeHead(404);
			res.end();
			return;
		}

		let buffer = await response.buffer();
		await fs.writeFile(filePath, buffer); // Store the bitmap in a file
	}

	let stats = await fs.stat(filePath);
	let stream = fs.createReadStream(filePath);

	res.writeHead(200, {
		'Content-Type': 'image/jpeg',
		'Content-Length': stats.size,
		'Access-Control-Allow-Origin': '*'
	});
	stream.pipe(res);
};

/** Transmits a custom level archive. */
const getCustomLevelArchive = async (res: http.ServerResponse, id: number) => {
	let filePath = path.join(__dirname, 'storage', 'customs', `zip${id}.zip`);
	let exists = await fs.pathExists(filePath); // See if the archive has already been downloaded and saved

	if (!exists) {
		// If it doesn't exist yet, fetch it from the Marbleland API
		let response = await fetch(`https://marbleland.vani.ga/api/level/${id}/zip?assuming=none`);
		if (!response.ok) throw new Error("CLA archive request error.");

		let buffer = await response.buffer();
		let zip = await JSZip.loadAsync(buffer);
		let promises: Promise<void>[] = [];
		let modification = shared.claList.find(x => x.id === id).modification;

		// Clean up the archive a bit:
		zip.forEach((_, entry) => {
			promises.push(new Promise(async resolve => {
				delete zip.files[entry.name];

				if (!entry.name.includes('data/')) entry.name = 'data/' + entry.name; // Ensure they got data/ in 'em
				zip.files[entry.name] = entry;
			
				// Check if the asset is already part of the standard assets. If yes, remove it from the archive.
				let filePath = path.join(shared.directoryPath, 'assets', (modification === 'gold')? entry.name : entry.name.replace('data/', 'data_mbp/')).toLowerCase(); // Case-insensitive paths
				let exists = await fs.pathExists(filePath);
				if (exists) zip.remove(entry.name);

				resolve();
			}));
		});

		await Promise.all(promises);

		let newBuffer = await zip.generateAsync({ type: 'nodebuffer' });
		await fs.writeFile(filePath, newBuffer); // Store the modified archive into a file
	}
	
	let stats = await fs.stat(filePath);
	let stream = fs.createReadStream(filePath);

	res.writeHead(200, {
		'Content-Type': 'application/zip',
		'Content-Length': stats.size,
		'Access-Control-Allow-Origin': '*'
	});
	stream.pipe(res);
};