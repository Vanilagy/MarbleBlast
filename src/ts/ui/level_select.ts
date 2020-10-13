import { AudioManager } from "../audio";
import { ResourceManager, DirectoryStructure } from "../resources";
import { MissionElementSimGroup, MisParser, MissionElementType, MissionElementScriptObject } from "../parsing/mis_parser";
import { setupButton } from "./ui";
import { Util } from "../util";
import { homeScreenDiv } from "./home";
import { loadLevel } from "./loading";
import { secondsToTimeString } from "./game";
import { StorageManager } from "../storage";
import { Replay } from "../replay";

interface Mission {
	path: string,
	simGroup: MissionElementSimGroup
}

export const beginnerLevels: Mission[] = [];
export const intermediateLevels: Mission[] = [];
export const advancedLevels: Mission[] = [];
export const customLevels: Mission[] = [];

export const levelSelectDiv = document.querySelector('#level-select') as HTMLDivElement;

const tabBeginner = document.querySelector('#tab-beginner') as HTMLImageElement;
const tabIntermediate = document.querySelector('#tab-intermediate') as HTMLImageElement;
const tabAdvanced = document.querySelector('#tab-advanced') as HTMLImageElement;
const tabCustom = document.querySelector('#tab-custom') as HTMLImageElement;
const levelTitle = document.querySelector('#level-title') as HTMLParagraphElement;
const levelDescription = document.querySelector('#level-description') as HTMLParagraphElement;
const levelQualifyTime = document.querySelector('#level-qualify-time') as HTMLParagraphElement;
const bestTime1 = document.querySelector('#level-select-best-time-1') as HTMLDivElement;
const bestTime2 = document.querySelector('#level-select-best-time-2') as HTMLDivElement;
const bestTime3 = document.querySelector('#level-select-best-time-3') as HTMLDivElement;
const leaderboardScores = document.querySelector('#leaderboard-scores') as HTMLDivElement;
const levelImage = document.querySelector('#level-image') as HTMLImageElement;
const notQualifiedOverlay = document.querySelector('#not-qualified-overlay') as HTMLDivElement;
const levelNumberElement = document.querySelector('#level-number') as HTMLParagraphElement;
const prevButton = document.querySelector('#level-select-prev') as HTMLImageElement;
const playButton = document.querySelector('#level-select-play') as HTMLImageElement;
const nextButton = document.querySelector('#level-select-next') as HTMLImageElement;
const homeButton = document.querySelector('#level-select-home-button') as HTMLImageElement;
export const hiddenUnlocker = document.querySelector('#hidden-level-unlocker') as HTMLDivElement;

/** The array of the current level group being shown. */
let currentLevelArray: Mission[];
/** The index of the currently selected level. */
let currentLevelIndex: number;

export const getCurrentLevelArray = () => currentLevelArray;
export const getCurrentLevelIndex = () => currentLevelIndex;

/** Selects a tab and shows the last-unlocked level in it. */
const selectTab = (which: 'beginner' | 'intermediate' | 'advanced' | 'custom') => {
	for (let elem of [tabBeginner, tabIntermediate, tabAdvanced, tabCustom]) {
		elem.style.zIndex = "-1";
	}

	let index = ['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which);

	let elem = [tabBeginner, tabIntermediate, tabAdvanced, tabCustom][index];
	elem.style.zIndex = "0";

	let levelArray = [beginnerLevels, intermediateLevels, advancedLevels, customLevels][['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which)];
	currentLevelArray = levelArray;
	currentLevelIndex = (StorageManager.data.unlockedLevels[['beginner', 'intermediate', 'advanced'].indexOf(which)] ?? 0) - 1;
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

setupButton(prevButton, 'play/prev', () => cycleMission(-1), true);
setupButton(playButton, 'play/play', () => playCurrentLevel(), true);
setupButton(nextButton, 'play/next', () => cycleMission(1), true);
setupButton(homeButton, 'play/back', () => {
	// Close level select and return back to the home screen
	levelSelectDiv.classList.add('hidden');
	hiddenUnlocker.classList.add('hidden');
	homeScreenDiv.classList.remove('hidden');
});

const playCurrentLevel = (replayData?: ArrayBuffer) => {
	let currentMission = currentLevelArray[currentLevelIndex];
	if (!currentMission) return;

	levelSelectDiv.classList.add('hidden');
	loadLevel(currentMission.simGroup, currentMission.path, replayData); // Initiate level loading
};

/** Initiates level select by loading all missions.  */
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
	collectMissionFiles(missionDirectory, ''); // Find all mission files

	let promises: Promise<MissionElementSimGroup>[] = [];
	for (let filename of missionFilenames) {
		// Load and read all missions
		promises.push(MisParser.loadFile("./assets/data/missions/" + filename));
	}

	let missions = await Promise.all(promises);
	let missionToFilename = new Map<MissionElementSimGroup, string>();
	for (let i = 0; i < missionFilenames.length; i++) {
		missionToFilename.set(missions[i], missionFilenames[i]);
	}

	// Sort the missions by level index so they're in the right order
	missions.sort((a, b) => {
		let missionInfo1 = a.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		let missionInfo2 = b.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;

		return Number(missionInfo1.level) - Number(missionInfo2.level);
	});

	// Sort the missions into their correct array
	for (let mission of missions) {
		let filename = missionToFilename.get(mission);
		let missionInfo = mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		let missionObj: Mission = { path: filename, simGroup: mission };

		if (missionInfo.type.toLowerCase() === 'beginner') beginnerLevels.push(missionObj);
		else if (missionInfo.type.toLowerCase() === 'intermediate') intermediateLevels.push(missionObj);
		else if (missionInfo.type.toLowerCase() === 'advanced') advancedLevels.push(missionObj);
		else customLevels.push(missionObj);
	}

	// Strange case, but these two levels are in opposite order in the original game.
	Util.swapInArray(intermediateLevels, 11, 12);

	// Initiate loading some images like this
	selectTab('advanced');
	selectTab('intermediate');
	selectTab('beginner');

	updateOnlineLeaderboard();

	for (let elem of [bestTime1.children[3], bestTime2.children[3], bestTime3.children[3]]) {
		let replayButton = elem as HTMLImageElement;
		replayButton.addEventListener('click', async () => {
			let attr = replayButton.getAttribute('data-score-id');
			if (!attr) return;

			let replayData = await StorageManager.databaseGet('replays', attr);
			if (!replayData) return;

			playCurrentLevel(replayData);
		});

		replayButton.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		replayButton.addEventListener('mousedown', () => {
			AudioManager.play('buttonpress.wav');
		});
	}
};

/** Displays the currently-selected mission. */
const displayMission = () => {
	let missionObj = currentLevelArray[currentLevelIndex];

	if (!missionObj) {
		// There is no mission (likely custom tab), so hide most information.

		notQualifiedOverlay.style.display = 'block';
		levelImage.style.display = 'none';
		levelTitle.innerHTML = '<br>';
		levelDescription.innerHTML = '<br>';
		levelQualifyTime.innerHTML = '';
		levelNumberElement.textContent = `Level ${currentLevelIndex + 1}`;
		playButton.src = './assets/ui/play/play_i.png';
		playButton.style.pointerEvents = 'none';
		displayBestTimes();
	} else {
		// Reenable the play button if it was disabled
		if (playButton.style.pointerEvents === 'none') {
			playButton.src = './assets/ui/play/play_n.png';
			playButton.style.pointerEvents = '';
		}		

		let unlockedLevels = StorageManager.data.unlockedLevels[[beginnerLevels, intermediateLevels, advancedLevels].indexOf(currentLevelArray)];

		// Show or hide the "Not Qualified!" notice depending on the level unlocked state.
		if (unlockedLevels <= currentLevelIndex) {
			notQualifiedOverlay.style.display = 'block';
			playButton.src = './assets/ui/play/play_i.png';
			playButton.style.pointerEvents = 'none';
		} else {
			notQualifiedOverlay.style.display = 'none';
			playButton.src = './assets/ui/play/play_n.png';
			playButton.style.pointerEvents = '';
		}

		levelImage.style.display = '';
	
		let missionInfo = missionObj.simGroup.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
	
		// Display metadata
		levelTitle.textContent = missionInfo.name.replace(/\\n/g, '\n').replace(/\\/g, '');
		levelDescription.textContent = missionInfo.desc.replace(/\\n/g, '\n').replace(/\\/g, '');
		let qualifyTime = (missionInfo.time && missionInfo.time !== "0")? Number(missionInfo.time) : Infinity;
		levelQualifyTime.textContent = isFinite(qualifyTime)? "Time to Qualify: " + secondsToTimeString(qualifyTime / 1000) : '';

		// Display best times
		displayBestTimes();

		// Set the image
		levelImage.src = getImagePath(missionObj);

		levelNumberElement.textContent = `${Util.uppercaseFirstLetter(missionInfo.type)} Level ${currentLevelIndex + 1}`;
	}

	// Enable or disable the next button based on level index
	if (currentLevelIndex >= currentLevelArray.length-1) {
		nextButton.src = './assets/ui/play/next_i.png';
		nextButton.style.pointerEvents = 'none';
	} else {
		nextButton.src = './assets/ui/play/next_n.png';
		nextButton.style.pointerEvents = '';
	}

	// Enable or disable the prev button based on level index
	if (currentLevelIndex <= 0) {
		prevButton.src = './assets/ui/play/prev_i.png';
		prevButton.style.pointerEvents = 'none';
	} else {
		prevButton.src = './assets/ui/play/prev_n.png';
		prevButton.style.pointerEvents = '';
	}

	// Preload the neighboring-level images for faster flicking between levels without having to wait for images to load.
	for (let i = currentLevelIndex - 5; i <= currentLevelIndex + 5; i++) {
		let mission = currentLevelArray[i];
		if (!mission) continue;

		let imagePath = getImagePath(mission);
		if (ResourceManager.getImageFromCache(imagePath)) continue;

		ResourceManager.loadImage(imagePath);
	}
};

const displayBestTimes = () => {
	let missionObj = currentLevelArray[currentLevelIndex];
	let goldTime = 0;

	if (missionObj) {
		let missionInfo = missionObj.simGroup.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
		goldTime = Number(missionInfo.goldtime);
	}

	const updateReplayButton = async (bestTimeIndex: number) => {
		let bestTime = bestTimes[bestTimeIndex];
		let element = [bestTime1, bestTime2, bestTime3][bestTimeIndex].children[3] as HTMLImageElement;
		element.style.display = 'none';
		element.removeAttribute('data-score-id');
		if (!bestTime[2]) return;

		let count = await StorageManager.databaseCount('replays', bestTime[2]);
		if (count > 0) {
			element.style.display = 'block';
			element.setAttribute('data-score-id', bestTime[2]);
		}
	};

	let bestTimes = StorageManager.getBestTimesForMission(missionObj?.path);
	bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
	(bestTime1.children[1] as HTMLImageElement).style.opacity = (bestTimes[0][1] <= goldTime)? '' : '0';
	bestTime1.children[2].textContent = secondsToTimeString(bestTimes[0][1] / 1000);
	updateReplayButton(0);
	bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
	(bestTime2.children[1] as HTMLImageElement).style.opacity = (bestTimes[1][1] <= goldTime)? '' : '0';
	bestTime2.children[2].textContent = secondsToTimeString(bestTimes[1][1] / 1000);
	updateReplayButton(1);
	bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
	(bestTime3.children[1] as HTMLImageElement).style.opacity = (bestTimes[2][1] <= goldTime)? '' : '0';
	bestTime3.children[2].textContent = secondsToTimeString(bestTimes[2][1] / 1000);
	updateReplayButton(2);

	leaderboardScores.innerHTML = '';
	let onlineScores = onlineLeaderboard[missionObj?.path];
	if (onlineScores) {
		let i = 0;

		for (let score of onlineScores) {
			let achievedTime = Number(score[1]);

			let element = document.createElement('div');
			element.classList.add('level-select-best-time');

			let name = document.createElement('div');
			name.textContent = (i + 1) + '. ' + score[0];
			element.appendChild(name);

			let img = document.createElement('img');
			img.src = "./assets/ui/play/goldscore.png";
			img.style.opacity = (achievedTime <= goldTime)? '' : '0';
			element.appendChild(img);

			let time = document.createElement('div');
			time.textContent = secondsToTimeString(achievedTime / 1000, 3);
			element.appendChild(time);

			leaderboardScores.appendChild(element);

			i++;
		}
	}
};

/** Gets the path of the image of a mission. */
const getImagePath = (missionObj: Mission) => {
	let withoutExtension = "missions/" + missionObj.path.slice(0, -4);
	let imagePaths = ResourceManager.getFullNamesOf(withoutExtension);
	let imagePath: string;
	for (let path of imagePaths) {
		if (!path.endsWith('.mis')) {
			imagePath = path;
			break;
		}
	}

	return "./assets/data/missions/" + missionObj.path.slice(0, missionObj.path.lastIndexOf('/') + 1) + imagePath;
};

/** Advanced the current level index by the specified count. That count can be negative. */
export const cycleMission = (direction: number) => {
	currentLevelIndex += direction;
	if (currentLevelIndex < 0) currentLevelIndex = 0;
	if (currentLevelIndex >= currentLevelArray.length) currentLevelIndex = currentLevelArray.length - 1;

	displayMission();
};

window.addEventListener('keydown', (e) => {
	if (levelSelectDiv.classList.contains('hidden')) return;

	if (e.code === 'ArrowLeft') {
		cycleMission(-1);
		if (!prevButton.style.pointerEvents) prevButton.src = './assets/ui/play/prev_d.png';
	} else if (e.code === 'ArrowRight') {
		cycleMission(1);
		if (!nextButton.style.pointerEvents) nextButton.src = './assets/ui/play/next_d.png';
	} else if (e.code === 'Escape') {
		homeButton.src = './assets/ui/play/back_d.png';
	}
});

window.addEventListener('keyup', (e) => {
	if (levelSelectDiv.classList.contains('hidden')) return;

	if (e.code === 'ArrowLeft') {
		if (!prevButton.style.pointerEvents) prevButton.src = './assets/ui/play/prev_n.png';
	} else if (e.code === 'ArrowRight') {
		if (!nextButton.style.pointerEvents) nextButton.src = './assets/ui/play/next_n.png';
	} else if (e.code === 'Escape') {
		homeButton.click();
	}
});

hiddenUnlocker.addEventListener('mousedown', () => {
	// Unlock the current level if it is the first not-unlocked level in the selected level category
	let index = [beginnerLevels, intermediateLevels, advancedLevels].indexOf(currentLevelArray);
	let unlockedLevels = StorageManager.data.unlockedLevels[index];
	if (currentLevelIndex === unlockedLevels) {
		StorageManager.data.unlockedLevels[index]++;
		StorageManager.store();
		displayMission();
		AudioManager.play('buttonpress.wav');
	}
});

// The second value in the tuple can be number or string - number for legacy reasons.
let onlineLeaderboard: Record<string, [string, number | string][]> = {};
export const updateOnlineLeaderboard = async () => {
	let postData = {
		randomId: StorageManager.data.randomId,
		bestTimes: {} as Record<string, [string, string]>,
		version: 1
	};

	// Add all personal best times to the payload
	for (let path in StorageManager.data.bestTimes) {
		let val = StorageManager.data.bestTimes[path as keyof typeof StorageManager.data.bestTimes];
		if (val[0][0]) postData.bestTimes[path] = [val[0][0], val[0][1].toString()]; // Convert the time to string to avoid precision loss in transfer
	}

	try {
		let response = await fetch('./php/update_leaderboard.php', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(postData)
		});
		if (response.ok) {
			let json = await response.json();
			onlineLeaderboard = json;
			displayBestTimes(); // Refresh best times
		}
	} catch (e) {}
};