import * as fs from 'fs-extra';
import * as path from 'path';
import fetch from 'node-fetch';
import JSZip from 'jszip';

import { apiInits, shared } from './shared';

apiInits.push((app) => {
	// Transmits a custom level bitmap.
	app.get('/api/custom/:id.jpg', async (req, res) => {
		let filePath = path.join(__dirname, 'storage', 'customs', `bitmap${req.params.id}.jpg`);
		let exists = await fs.pathExists(filePath); // See if the bitmap has already been downloaded and saved

		if (!exists) {
			// If it doesn't exist yet, fetch it from the Marbleland API
			let response = await fetch(`https://marbleland.vani.ga/api/level/${req.params.id}/image?width=258&height=194`);
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

		res.set('Content-Type', 'image/jpeg');
		res.set('Access-Control-Allow-Origin', '*');
		res.set('Content-Length', stats.size.toString());
		stream.pipe(res);
	});

	// Transmits a custom level archive.
	app.get('/api/custom/:id.zip', async (req, res) => {
		let filePath = path.join(__dirname, 'storage', 'customs', `zip${req.params.id}.zip`);
		let exists = await fs.pathExists(filePath); // See if the archive has already been downloaded and saved

		if (!exists) {
		// If it doesn't exist yet, fetch it from the Marbleland API
			let response = await fetch(`https://marbleland.vani.ga/api/level/${req.params.id}/zip?assuming=none`);
			if (!response.ok) throw new Error("CLA archive request error.");

			let buffer = await response.buffer();
			let zip = await JSZip.loadAsync(buffer);
			let promises: Promise<void>[] = [];
			let modification = shared.claList.find(x => x.id === Number(req.params.id)).modification;

			// Clean up the archive a bit:
			zip.forEach((_, entry) => {
				promises.push(new Promise(async resolve => {
					delete zip.files[entry.name];

					if (!entry.name.includes('data/')) entry.name = 'data/' + entry.name; // Ensure they got data/ in 'em
					if (modification === 'gold') entry.name = entry.name.replace("interiors_mbg/", "interiors/"); // Clean up interior paths
					zip.files[entry.name] = entry;

					// Check if the asset is already part of the standard assets. If yes, remove it from the archive.
					let filePath = path.join(
						shared.directoryPath,
						'assets',
						(modification === 'gold')? entry.name : entry.name.replace('data/', 'data_mbp/')
					).toLowerCase(); // Case-insensitive paths
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

		res.set('Content-Type', 'application/zip');
		res.set('Access-Control-Allow-Origin', '*');
		res.set('Content-Length', stats.size.toString());
		stream.pipe(res);
	});
});