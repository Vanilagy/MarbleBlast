import { AudioManager } from "../audio";
import { ResourceManager, DirectoryStructure } from "../resources";
import { MissionElementSimGroup, MisParser, MissionElementType, MissionElementScriptObject } from "../parsing/mis_parser";
import { setupButton } from "./ui";
import { Util } from "../util";
import { homeScreenDiv } from "./home";
import { loadLevel } from "./loading";

interface Mission {
	path: string,
	simGroup: MissionElementSimGroup
}

const beginnerLevels: Mission[] = [];
const intermediateLevels: Mission[] = [];
const advancedLevels: Mission[] = [];
const customLevels: Mission[] = [];

export const levelSelectDiv = document.querySelector('#level-select') as HTMLDivElement;

const tabBeginner = document.querySelector('#tab-beginner') as HTMLImageElement;
const tabIntermediate = document.querySelector('#tab-intermediate') as HTMLImageElement;
const tabAdvanced = document.querySelector('#tab-advanced') as HTMLImageElement;
const tabCustom = document.querySelector('#tab-custom') as HTMLImageElement;
const levelTitle = document.querySelector('#level-title') as HTMLParagraphElement;
const levelDescription = document.querySelector('#level-description') as HTMLParagraphElement;
const levelImage = document.querySelector('#level-image') as HTMLImageElement;
const notQualifiedOverlay = document.querySelector('#not-qualified-overlay') as HTMLDivElement;
const levelNumberElement = document.querySelector('#level-number') as HTMLParagraphElement;
const prevButton = document.querySelector('#level-select-prev') as HTMLImageElement;
const playButton = document.querySelector('#level-select-play') as HTMLImageElement;
const nextButton = document.querySelector('#level-select-next') as HTMLImageElement;
const homeButton = document.querySelector('#level-select-home-button') as HTMLImageElement;

let currentLevelArray: Mission[];
let currentLevelIndex: number;

const selectTab = (which: 'beginner' | 'intermediate' | 'advanced' | 'custom') => {
	for (let elem of [tabBeginner, tabIntermediate, tabAdvanced, tabCustom]) {
		elem.style.zIndex = "-1";
	}

	let index = ['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which);

	let elem = [tabBeginner, tabIntermediate, tabAdvanced, tabCustom][index];
	elem.style.zIndex = "0";

	let levelArray = [beginnerLevels, intermediateLevels, advancedLevels, customLevels][['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which)];
	currentLevelArray = levelArray;
	currentLevelIndex = currentLevelArray.length - 1;
	displayMission();
};

const setupTab = (element: HTMLImageElement, which: 'beginner' | 'intermediate' | 'advanced' | 'custom') => {
	element.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		AudioManager.play('buttonpress.wav');
	});
	element.addEventListener('click', (e) => e.button === 0 && selectTab(which));
};
setupTab(tabBeginner, 'beginner');
setupTab(tabIntermediate, 'intermediate');
setupTab(tabAdvanced, 'advanced');
setupTab(tabCustom, 'custom');

setupButton(prevButton, 'play/prev', () => cycleMission(-1));
setupButton(playButton, 'play/play', () => {
	let currentMission = currentLevelArray[currentLevelIndex]?.simGroup;
	if (!currentMission) return;

	levelSelectDiv.classList.add('hidden');
	loadLevel(currentMission);
});
setupButton(nextButton, 'play/next', () => cycleMission(1));
setupButton(homeButton, 'play/back', () => {
	levelSelectDiv.classList.add('hidden');
	homeScreenDiv.classList.remove('hidden');
});

export const initLevelSelect = async () => {
	let missionDirectory = ResourceManager.dataDirectoryStructure['missions'];
	let missionFilenames: string[] = [];
	
	const collectMissionFiles = (directory: DirectoryStructure, path: string) => {
		for (let name in directory) {
			if (directory[name]) {
				collectMissionFiles(directory[name], path + name + '/');
			} else if (name.endsWith('.mis')) {
				missionFilenames.push(path + name);
			}
		}
	};
	collectMissionFiles(missionDirectory, '');

	let promises: Promise<MissionElementSimGroup>[] = [];
	for (let filename of missionFilenames) {
		promises.push(MisParser.loadFile("./assets/data/missions/" + filename));
	}

	let missions = await Promise.all(promises);
	let missionToFilename = new Map<MissionElementSimGroup, string>();
	for (let i = 0; i < missionFilenames.length; i++) {
		missionToFilename.set(missions[i], missionFilenames[i]);
	}

	missions.sort((a, b) => {
		let missionInfo1 = a.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		let missionInfo2 = b.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;

		return Number(missionInfo1.level) - Number(missionInfo2.level);
	});
	for (let mission of missions) {
		let filename = missionToFilename.get(mission);
		let missionInfo = mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		let missionObj: Mission = { path: filename, simGroup: mission };

		if (missionInfo.type.toLowerCase() === 'beginner') beginnerLevels.push(missionObj);
		else if (missionInfo.type.toLowerCase() === 'intermediate') intermediateLevels.push(missionObj);
		else if (missionInfo.type.toLowerCase() === 'advanced') advancedLevels.push(missionObj);
		else customLevels.push(missionObj);
	}

	selectTab('beginner');
};

const displayMission = () => {
	let missionObj = currentLevelArray[currentLevelIndex];

	if (!missionObj) {
		notQualifiedOverlay.style.display = 'block';
		levelImage.style.display = 'none';
		levelTitle.innerHTML = '<br>';
		levelDescription.innerHTML = '<br>';
		levelNumberElement.textContent = `Level ${currentLevelIndex + 1}`;
	} else {
		notQualifiedOverlay.style.display = 'none';
		levelImage.style.display = '';
	
		let missionInfo = missionObj.simGroup.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
	
		levelTitle.textContent = missionInfo.name.replace(/\\n/g, '\n').replace(/\\/g, '');
		levelDescription.textContent = missionInfo.desc.replace(/\\n/g, '\n').replace(/\\/g, '');
	
		let withoutExtension = "missions/" + missionObj.path.slice(0, -4);
		let imagePaths = ResourceManager.getFullNameOf(withoutExtension);
		let imagePath: string;
		for (let path of imagePaths) {
			if (!path.endsWith('.mis')) {
				imagePath = path;
				break;
			}
		}
		levelImage.src = "./assets/data/missions/" + missionObj.path.slice(0, missionObj.path.lastIndexOf('/') + 1) + imagePath;

		levelNumberElement.textContent = `${Util.uppercaseFirstLetter(missionInfo.type)} Level ${currentLevelIndex + 1}`;
	}

	if (currentLevelIndex >= currentLevelArray.length-1) {
		nextButton.src = './assets/ui/play/next_i.png';
		nextButton.style.pointerEvents = 'none';
	} else {
		nextButton.src = './assets/ui/play/next_n.png';
		nextButton.style.pointerEvents = '';
	}

	if (currentLevelIndex <= 0) {
		prevButton.src = './assets/ui/play/prev_i.png';
		prevButton.style.pointerEvents = 'none';
	} else {
		prevButton.src = './assets/ui/play/prev_n.png';
		prevButton.style.pointerEvents = '';
	}
};

const cycleMission = (direction: number) => {
	currentLevelIndex += direction;
	if (currentLevelIndex < 0) currentLevelIndex = 0;
	if (currentLevelIndex >= currentLevelArray.length) currentLevelIndex = currentLevelArray.length - 1;

	displayMission();
};

window.addEventListener('keydown', (e) => {
	if (levelSelectDiv.classList.contains('hidden')) return;

	if (e.code === 'ArrowLeft') {
		cycleMission(-1);
		prevButton.src = './assets/ui/play/prev_d.png';
	} else if (e.code === 'ArrowRight') {
		cycleMission(1);
		nextButton.src = './assets/ui/play/next_d.png';
	} else if (e.code === 'Escape') {
		homeButton.src = './assets/ui/play/back_d.png';
	}
});

window.addEventListener('keyup', (e) => {
	if (levelSelectDiv.classList.contains('hidden')) return;

	if (e.code === 'ArrowLeft') {
		prevButton.src = './assets/ui/play/prev_n.png';
	} else if (e.code === 'ArrowRight') {
		nextButton.src = './assets/ui/play/next_n.png';
	} else if (e.code === 'Escape') {
		homeButton.click();
	}
});