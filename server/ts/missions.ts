import fs from 'fs-extra';
import path from 'path';
import { MisParser, MissionElement, MissionElementScriptObject, MissionElementSimGroup, MissionElementType } from "../../shared/mis_parser";
import { CLAEntry, OfficialMissionDescription } from '../../shared/types';
import { apiInits, shared } from './shared';

const missionDescriptions: OfficialMissionDescription[] = [];
const goldCustoms: CLAEntry[] = [];
const platinumCustoms: CLAEntry[] = [];
const ultraCustoms: CLAEntry[] = [];

export const initMissionList = () => {
	const collectMissionFiles = (directoryPath: string, missionPathPrefix: string, relativePath = '') => {
		let entries = fs.readdirSync(path.posix.join(directoryPath, relativePath));

		for (let entry of entries) {
			let joinedPath = path.posix.join(directoryPath, relativePath, entry);
			let type = fs.statSync(joinedPath);

			if (type.isDirectory()) {
				collectMissionFiles(directoryPath, missionPathPrefix, path.posix.join(relativePath, entry));
			} else if (entry.endsWith('.mis')) {
				let text = fs.readFileSync(joinedPath).toString();
				let misFile = new MisParser(text).parse();

				let allElements: MissionElement[] = [];

				const traverse = (simGroup: MissionElementSimGroup) => {
					for (let element of simGroup.elements) {
						allElements.push(element);
						if (element._type === MissionElementType.SimGroup) traverse(element);
					}
				};
				traverse(misFile.root);

				let missionInfo = allElements.find(element => element._type === MissionElementType.ScriptObject && element._name === 'MissionInfo') as MissionElementScriptObject;

				let description: OfficialMissionDescription = {
					path: missionPathPrefix + path.posix.join(relativePath, entry),
					misPath: path.posix.join(directoryPath.slice(directoryPath.indexOf('data')), relativePath, entry),
					type: missionInfo.type.toLowerCase(),
					index: MisParser.parseNumber(missionInfo.level),

					name: missionInfo.name,
					artist: missionInfo.artist,
					desc: missionInfo.desc,
					gameMode: missionInfo.gamemode,

					qualifyingTime: missionInfo.time && MisParser.parseNumber(missionInfo.time),
					goldTime: missionInfo.goldtime && MisParser.parseNumber(missionInfo.goldtime),
					platinumTime: missionInfo.platinumtime && MisParser.parseNumber(missionInfo.platinumtime),
					ultimateTime: missionInfo.ultimatetime && MisParser.parseNumber(missionInfo.ultimatetime),

					hasEasterEgg: allElements.some(element => element._type === MissionElementType.Item && element.datablock?.toLowerCase() === 'easteregg')
				};
				missionDescriptions.push(description);
			}
		}
	};

	collectMissionFiles(path.posix.join(shared.directoryPath, 'assets', 'data', 'missions'), '');
	collectMissionFiles(path.posix.join(shared.directoryPath, 'assets', 'data_mbp', 'missions_mbp'), 'mbp/');
	collectMissionFiles(path.posix.join(shared.directoryPath, 'assets', 'data_mbp', 'missions_mbu'), 'mbu/');
	collectMissionFiles(path.posix.join(shared.directoryPath, 'assets', 'data_mbp', 'multiplayer', 'hunt'), 'mbp/multiplayer/');

	goldCustoms.push(...JSON.parse(fs.readFileSync(path.join(shared.directoryPath, 'assets', 'customs_gold.json')).toString()));
	platinumCustoms.push(...JSON.parse(fs.readFileSync(path.join(shared.directoryPath, 'assets', 'customs_platinum.json')).toString()));
	ultraCustoms.push(...JSON.parse(fs.readFileSync(path.join(shared.directoryPath, 'assets', 'customs_ultra.json')).toString()));
};

apiInits.push(app => {
	app.get('/api/missions', (req, res) => {
		res.json({
			officialMissions: missionDescriptions,
			goldCustoms,
			platinumCustoms,
			ultraCustoms
		});
	});
});