import * as http from 'http';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as url from 'url';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

import { shared } from './shared';

/** Transmits a custom level resource, so either an image or an archive. */
export const getCustomLevelResource = async (res: http.ServerResponse, urlObject: url.URL) => {
	let pathComponents = urlObject.pathname.split('/').slice(1);
	let resourceName = pathComponents[2]; // The id and file type are encoded in the path (e.g. 1234.jpg or 1234.zip)
	let extension = resourceName.slice(resourceName.indexOf('.') + 1);
	let id = Number(resourceName.slice(0, resourceName.indexOf('.')));
	if (!isFinite(id)) throw new Error("Invalid custom level ID.");

	if (extension === 'jpg') await getCustomLevelBitmap(res, id);
	else if (extension === 'zip') await getCustomLevelArchive(res, id);
	else throw new Error("Invalid custom level resource type.");
};

/** Transmits a custom level bitmap. */
const getCustomLevelBitmap = async (res: http.ServerResponse, id: number) => {
	let filePath = path.join(__dirname, 'storage', 'customs', `bitmap${id}.jpg`);
	let exists = await fs.pathExists(filePath); // See if the bitmap has already been downloaded and saved

	if (!exists) {
		// If it doesn't exist yet, fetch it from the CLA API
		let response = await fetch(`https://cla.higuy.me/api/v1/missions/${id}/bitmap?width=258&height=194`);
		if (!response.ok) throw new Error("CLA bitmap request error.");

		let arrayBuffer = await response.arrayBuffer();
		await fs.writeFile(filePath, Buffer.from(arrayBuffer)); // Store the bitmap in a file
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
		// If it doesn't exist yet, fetch it from the CLA API
		let response = await fetch(`https://cla.higuy.me/api/v1/missions/${id}/zip?official=true`);
		if (!response.ok) throw new Error("CLA archive request error.");

		let buffer = await response.buffer();
		let zip = new AdmZip(buffer);
		let promises: Promise<void>[] = [];

		// Clean up the archive a bit:
		zip.getEntries().forEach(entry => {
			promises.push(new Promise(async resolve => {
				entry.entryName.replace("interiors_mbg/", "interiors/"); // Clean up interior paths
			
				// Check if the asset is already part of the standard MBG assets. If yes, remove it from the archive.
				let filePath = path.join(shared.directoryPath, 'assets', entry.entryName);
				let exists = await fs.pathExists(filePath);
				if (exists) zip.deleteFile(entry);

				resolve();
			}));
		});

		await Promise.all(promises);
		await new Promise(resolve => zip.writeZip(filePath, resolve)); // Store the modified archive into a file
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