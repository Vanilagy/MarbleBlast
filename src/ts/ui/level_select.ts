import { AudioManager } from "../audio";
import { ResourceManager, DirectoryStructure } from "../resources";
import { MisParser, MissionElementType, MissionElementScriptObject, MisFile } from "../parsing/mis_parser";
import { setupButton } from "./ui";
import { Util } from "../util";
import { homeScreenDiv } from "./home";
import { loadLevel } from "./loading";
import { StorageManager } from "../storage";
import { Mission, CLAEntry } from "../mission";
import { SerializedReplay, Replay } from "../replay";
import { executeOnWorker } from "../worker";
import { previousButtonState } from "../input";
import { getRandomId } from "../state";

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
const levelArtist = document.querySelector('#level-artist') as HTMLParagraphElement;
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
const searchBar = document.querySelector('#search-bar') as HTMLImageElement;
const searchInput = document.querySelector('#search-input') as HTMLInputElement;

/** The array of the current level group being shown. */
let currentLevelArray: Mission[];
/** The index of the currently selected level. */
let currentLevelIndex: number;

export const getCurrentLevelArray = () => currentLevelArray;
export const getCurrentLevelIndex = () => currentLevelIndex;

/** Selects a tab and shows the last-unlocked level in it. */
export const selectTab = (which: 'beginner' | 'intermediate' | 'advanced' | 'custom') => {
	for (let elem of [tabBeginner, tabIntermediate, tabAdvanced, tabCustom]) {
		elem.style.zIndex = "-1";
	}

	let index = ['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which);

	let elem = [tabBeginner, tabIntermediate, tabAdvanced, tabCustom][index];
	elem.style.zIndex = "0";

	let levelArray = [beginnerLevels, intermediateLevels, advancedLevels, customLevels][['beginner', 'intermediate', 'advanced', 'custom'].indexOf(which)];
	currentLevelArray = levelArray;
	currentLevelIndex = (StorageManager.data.unlockedLevels[['beginner', 'intermediate', 'advanced'].indexOf(which)] ?? 0) - 1;
	currentLevelIndex = Util.clamp(currentLevelIndex, 0, currentLevelArray.length - 1);
	if (which === 'custom') currentLevelIndex = customLevels.length - 1; // Select the last custom level
	selectBasedOnSearchQuery(false);
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

setupButton(prevButton, 'play/prev', () => cycleMission(-1), true, true);
setupButton(playButton, 'play/play', () => playCurrentLevel(), true);
setupButton(nextButton, 'play/next', () => cycleMission(1), true, true);
setupButton(homeButton, 'play/back', () => {
	// Close level select and return back to the home screen
	levelSelectDiv.classList.add('hidden');
	hiddenUnlocker.classList.add('hidden');
	homeScreenDiv.classList.remove('hidden');
});

export const playCurrentLevel = (replayData?: ArrayBuffer) => {
	let currentMission = currentLevelArray[currentLevelIndex];
	if (!currentMission) return;

	levelSelectDiv.classList.add('hidden');
	loadLevel(currentMission, replayData? () => Replay.fromSerialized(replayData) : undefined); // Initiate level loading
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

	let promises: Promise<MisFile>[] = [];
	for (let filename of missionFilenames) {
		// Load and read all missions
		promises.push(MisParser.loadFile("./assets/data/missions/" + filename));
	}

	// Get the list of all custom levels in the CLA
	let customLevelListPromise = ResourceManager.loadResource('./assets/cla_list.json');

	let misFiles = await Promise.all(promises);
	let misFileToFilename = new Map<MisFile, string>();
	for (let i = 0; i < missionFilenames.length; i++) {
		misFileToFilename.set(misFiles[i], missionFilenames[i]);
	}

	// Sort the missions by level index so they're in the right order
	misFiles.sort((a, b) => {
		let missionInfo1 = a.root.elements.find((element) => element._type === MissionElementType.ScriptObject && element._name === 'MissionInfo') as MissionElementScriptObject;
		let missionInfo2 = b.root.elements.find((element) => element._type === MissionElementType.ScriptObject && element._name === 'MissionInfo') as MissionElementScriptObject;

		return MisParser.parseNumber(missionInfo1.level) - MisParser.parseNumber(missionInfo2.level);
	});

	let missions: Mission[] = [];

	// Create the regular missions
	for (let misFile of misFiles) {
		let mission = Mission.fromMisFile(misFileToFilename.get(misFile), misFile);
		missions.push(mission);
	}

	// Read the custom level list and filter it
	let customLevelList = JSON.parse(await ResourceManager.readBlobAsText(await customLevelListPromise)) as CLAEntry[];
	customLevelList = customLevelList.filter(x => x.modification === 'gold' && x.gameType.toLowerCase() === 'single player');

	// Create all custom missions
	for (let custom of customLevelList) {
		let mission = Mission.fromCLAEntry(custom);
		missions.push(mission);
	}

	// Sort the missions into the correct array
	for (let mission of missions) {
		let missionType = mission.path.split('/')[0]; // We don't use the MissionInfo.type because some customs have that set up wrong
		if (missionType === 'beginner') beginnerLevels.push(mission);
		else if (missionType === 'intermediate') intermediateLevels.push(mission);
		else if (missionType === 'advanced') advancedLevels.push(mission);
		else customLevels.push(mission);
	}

	// Strange case, but these two levels are in opposite order in the original game.
	Util.swapInArray(intermediateLevels, 11, 12);

	// Sort all custom levels alphabetically
	customLevels.sort((a, b) => Util.normalizeString(a.title).localeCompare(Util.normalizeString(b.title), undefined, { numeric: true, sensitivity: 'base' }));

	// Initiate loading some images like this
	selectTab('custom');
	selectTab('advanced');
	selectTab('intermediate');
	selectTab('beginner');

	updateOnlineLeaderboard(true);

	for (let elem of [bestTime1.children[3], bestTime2.children[3], bestTime3.children[3]]) {
		let replayButton = elem as HTMLImageElement;
		replayButton.addEventListener('click', async (e) => {
			if (e.button !== 0) return;
			let mission = currentLevelArray[currentLevelIndex];
			if (!mission) return;

			let attr = replayButton.getAttribute('data-score-id');
			if (!attr) return;

			let replayData = await StorageManager.databaseGet('replays', attr);
			if (!replayData) return;

			if (!e.altKey) {
				playCurrentLevel(replayData);
			} else {
				downloadReplay(replayData, mission);
			}
		});

		replayButton.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		replayButton.addEventListener('mousedown', (e) => {
			if (e.button === 0) AudioManager.play('buttonpress.wav');
		});
	}
};

/** Displays the currently-selected mission. */
const displayMission = () => {
	let mission = currentLevelArray[currentLevelIndex];

	if (!mission) {
		// There is no mission (likely custom tab), so hide most information.

		notQualifiedOverlay.style.display = 'block';
		levelImage.style.display = 'none';
		levelTitle.innerHTML = '<br>';
		levelArtist.style.display = 'none';
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
		if (currentLevelArray === customLevels) unlockedLevels = Infinity;

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
	
		// Display metadata
		levelTitle.textContent = mission.title;
		levelArtist.textContent = 'by ' + mission.artist.trim();
		levelArtist.style.display = (mission.type === 'custom')? 'block' : 'none'; // Only show the artist for custom levels
		levelDescription.textContent = mission.description;
		let qualifyTime = (mission.qualifyTime !== 0)? mission.qualifyTime : Infinity;
		levelQualifyTime.textContent = isFinite(qualifyTime)? "Time to Qualify: " + Util.secondsToTimeString(qualifyTime / 1000) : '';

		// Display best times
		displayBestTimes();

		clearImageTimeout = setTimeout(() => levelImage.src = '', 50) as any as number;

		levelNumberElement.textContent = `${Util.uppercaseFirstLetter(mission.type)} Level ${currentLevelIndex + 1}`;
	}

	setImages();
	updateNextPrevButtons();
};

/** Returns true if there is a next level to advance to. */
const canGoNext = () => {
	let canGoNext = false;
	for (let i = currentLevelIndex + 1; i < currentLevelArray.length; i++) {
		if (currentLevelArray[i].matchesSearch(currentQueryWords)) {
			canGoNext = true;
			break;
		}
	}

	return canGoNext;
};

/** Returns true if there is a previous level to go back to. */
const canGoPrev = () => {
	let canGoPrev = false;
	for (let i = currentLevelIndex - 1; i >= 0; i--) {
		if (currentLevelArray[i].matchesSearch(currentQueryWords)) {
			canGoPrev = true;
			break;
		}
	}

	return canGoPrev;
};

const updateNextPrevButtons = () => {
	// Enable or disable the next button based on if there are still levels to come
	if (!canGoNext()) {
		nextButton.src = './assets/ui/play/next_i.png';
		nextButton.style.pointerEvents = 'none';
	} else {
		if (nextButton.src.endsWith('i.png')) nextButton.src = './assets/ui/play/next_n.png';
		nextButton.style.pointerEvents = '';
	}

	// Enable or disable the prev button based on if there are still levels to come
	if (!canGoPrev()) {
		prevButton.src = './assets/ui/play/prev_i.png';
		prevButton.style.pointerEvents = 'none';
	} else {
		if (prevButton.src.endsWith('i.png')) prevButton.src = './assets/ui/play/prev_n.png';
		prevButton.style.pointerEvents = '';
	}
};

let setImagesTimeout: number = null;
let clearImageTimeout: number = null;
/** Handles retrieving level thumbnails intelligently and showing them. */
const setImages = (fromTimeout = false) => {
	if (fromTimeout) {
		// We come from a timeout, so clear it
		clearTimeout(setImagesTimeout);	
		setImagesTimeout = null;
	}

	if (setImagesTimeout !== null) {
		// There is currently a timeout ongoing; reset the timer and return.
		clearTimeout(setImagesTimeout);
		setImagesTimeout = setTimeout(() => setImages(true), 75) as any as number;
		return;
	}

	// Preload the neighboring-level images for faster flicking between levels without having to wait for images to load.
	for (let i = 0; i <= 10; i++) {
		let index = getCycleMissionIndex(Math.ceil(i / 2) * ((i % 2)? 1 : -1)); // Go in an outward spiral pattern, but only visit the levels that match the current search
		let mission = currentLevelArray[index];
		if (!mission) continue;

		let imagePath = mission.getImagePath();

		let start = performance.now();
		ResourceManager.loadResource(imagePath).then(async blob => {
			if (!blob) return;

			if (index === currentLevelIndex) {
				// Show the thumbnail
				levelImage.src = await ResourceManager.readBlobAsDataUrl(blob);
				clearTimeout(clearImageTimeout);
			}

			let elapsed = performance.now() - start;
			if (elapsed > 75 && !setImagesTimeout) {
				// If the image took too long to load, set a timeout to prevent spamming requests.
				setImagesTimeout = setTimeout(() => setImages(true), 75) as any as number;
			}
		});
	}
};

let lastDisplayBestTimesId: string; // Used to prevent some async issues
const displayBestTimes = () => {
	let mission = currentLevelArray[currentLevelIndex];
	let goldTime = 0;
	let randomId = getRandomId();
	lastDisplayBestTimesId = randomId;

	if (mission) goldTime = mission.goldTime;

	const updateReplayButton = async (bestTimeIndex: number) => {
		let bestTime = bestTimes[bestTimeIndex];
		let element = [bestTime1, bestTime2, bestTime3][bestTimeIndex].children[3] as HTMLImageElement;
		element.style.display = 'none';
		element.removeAttribute('data-score-id');
		if (!bestTime[2]) return;

		let count = await StorageManager.databaseCount('replays', bestTime[2]);
		if (randomId === lastDisplayBestTimesId && count > 0) {
			element.style.display = 'block';
			element.setAttribute('data-score-id', bestTime[2]);
		}
	};

	let bestTimes = StorageManager.getBestTimesForMission(mission?.path);
	bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
	(bestTime1.children[1] as HTMLImageElement).style.opacity = (bestTimes[0][1] <= goldTime)? '' : '0';
	bestTime1.children[2].textContent = Util.secondsToTimeString(bestTimes[0][1] / 1000);
	updateReplayButton(0);
	bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
	(bestTime2.children[1] as HTMLImageElement).style.opacity = (bestTimes[1][1] <= goldTime)? '' : '0';
	bestTime2.children[2].textContent = Util.secondsToTimeString(bestTimes[1][1] / 1000);
	updateReplayButton(1);
	bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
	(bestTime3.children[1] as HTMLImageElement).style.opacity = (bestTimes[2][1] <= goldTime)? '' : '0';
	bestTime3.children[2].textContent = Util.secondsToTimeString(bestTimes[2][1] / 1000);
	updateReplayButton(2);

	leaderboardScores.innerHTML = '';
	let onlineScores = onlineLeaderboard[mission?.path];
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
			time.textContent = Util.secondsToTimeString(achievedTime / 1000, 3);
			element.appendChild(time);

			leaderboardScores.appendChild(element);

			i++;
		}
	}
};

/** Advance the current level index by the specified count while respecting the search query. That count can be negative. */
export const cycleMission = (direction: number) => {
	let index = getCycleMissionIndex(direction);
	if (index === null || index === currentLevelIndex) return;

	currentLevelIndex = index;
	displayMission();
};

/** Gets the level index you would get by skipping a certain amount forwards/backwards while respecting the search query. Returns null if the index would peek outside of the current level array. */
const getCycleMissionIndex = (direction: number) => {
	if (direction === 0) return currentLevelIndex;

	for (let i = currentLevelIndex + Math.sign(direction); i >= 0 && i < currentLevelArray.length; i += Math.sign(direction)) {
		if (currentLevelArray[i].matchesSearch(currentQueryWords)) direction = Math.sign(direction) * (Math.abs(direction) - 1);
		if (direction === 0) return i;
	}

	return null;
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
	if (index === -1) return;

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
export const updateOnlineLeaderboard = async (handleUpload = false, handleBestTimes = true) => {
	let postData = {
		randomId: StorageManager.data.randomId,
		bestTimes: {} as Record<string, [string, string]>,
		version: 1
	};

	// Add all personal best times to the payload
	for (let path in StorageManager.data.bestTimes) {
		let val = StorageManager.data.bestTimes[path];
		// If the best score for this level has a name and isn't timestamp 0
		if (val[0][0] && val[0][3] !== 0) postData.bestTimes[path] = [val[0][0], val[0][1].toString()]; // Convert the time to string to avoid precision loss in transfer
	}

	try {
		if (handleBestTimes) {
			let compressed = await executeOnWorker('compress', JSON.stringify(postData));

			let response = await fetch('./php/update_leaderboard.php', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
				},
				body: compressed
			});
			if (response.ok) {
				let text = await response.text();
				let json = JSON.parse(text);
				onlineLeaderboard = json;

				let localScoreRemoved = false;
				for (let path in StorageManager.data.bestTimes) {
					let firstLeaderboardScore = onlineLeaderboard[path]?.[0];
					if (!firstLeaderboardScore) continue;

					let bestTime = StorageManager.data.bestTimes[path][0];
					while (bestTime && bestTime[1] < Number(firstLeaderboardScore[1]) && bestTime[3] === 0) {
						// Splice all timestamp 0 times that are faster than the current WR on the leaderboard. We do this because the score is outdated.
						StorageManager.data.bestTimes[path].splice(0, 1);
						bestTime = StorageManager.data.bestTimes[path][0];
						localScoreRemoved = true;
					}

					if (StorageManager.data.bestTimes[path].length === 0) delete StorageManager.data.bestTimes[path];
				}
				if (localScoreRemoved) StorageManager.storeBestTimes();

				displayBestTimes(); // Refresh best times
			}
		}

		if (handleUpload) {
			// Handle upload of .wrecs to the server
			let response = await fetch('./php/get_stored_wrecs.php');
			if (response.ok) {
				let json = await response.json() as Record<string, [string, string, number]>;

				for (let missionPath in StorageManager.data.bestTimes) {
					if (missionPath.startsWith('custom')) continue; // We don't care about custom .wrecs for now
					let bestTime = StorageManager.data.bestTimes[missionPath][0];
					if (!bestTime[2]) continue; // No replay for this score

					// Check if the score is the top score on the leaderboard and it's also better than the scored .wrec score
					if (bestTime[1] === Number(onlineLeaderboard[missionPath]?.[0]?.[1]) && (!json[missionPath] || bestTime[1] < Number(json[missionPath][1]))) {
						// Then prepare the replay upload
						let replayData = await StorageManager.databaseGet('replays', bestTime[2]) as ArrayBuffer;
						if (!replayData) continue;
						replayData = await maybeUpdateReplay(replayData, missionPath);

						fetch(`./php/upload_wrec.php?mission=${decodeURIComponent(missionPath)}&name=${decodeURIComponent(bestTime[0])}&time=${decodeURIComponent(bestTime[1].toString())}`, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/octet-stream',
							},
							body: replayData
						});
					}
				}
			}
		}
	} catch (e) {
		console.error(e);
	}
};

/** The current words in the search query. Used for matching. */
let currentQueryWords: string[] = [];

searchInput.addEventListener('input', () => {
	onSearchInputChange();
});
searchInput.addEventListener('focus', () => {
	// Clear the search when focused
	searchInput.value = '';
	onSearchInputChange();
});

const onSearchInputChange = () => {
	// Normalize the search string and split it into words
	let str = Util.removeSpecialCharacters(Util.normalizeString(searchInput.value)).toLowerCase();
	currentQueryWords = str.split(' ');
	if (!str) currentQueryWords.length = 0;

	selectBasedOnSearchQuery();
	updateNextPrevButtons();
};

/** Selects a valid level based on the current search query. */
const selectBasedOnSearchQuery = (display = true) => {
	// Check if the current level already matches the search. In that case, don't do anything.
	if (currentLevelArray[currentLevelIndex]?.matchesSearch(currentQueryWords)) return;

	// Find the first matching level
	for (let i = 0; i < currentLevelArray.length; i++) {
		let mis = currentLevelArray[i];
		if (mis.matchesSearch(currentQueryWords)) {
			currentLevelIndex = i;
			if (display) displayMission();
			break;
		}
	}
};

/** Makes sure a replay fits some requirements. */
const maybeUpdateReplay = async (replayData: ArrayBuffer, missionPath: string) => {
	let uncompressed = pako.inflate(new Uint8Array(replayData), { to: 'string' });
	
	// This is a bit unfortunate, but we'd like to bundle the mission path with the replay, but the first replay version didn't include it. So we need to check if the replay actually includes the mission path, which we can check by checking if it includes the "version" field. We then upgrade the replay to verion 1.
	if (!uncompressed.includes('"version"')) {
		let json = JSON.parse(uncompressed) as SerializedReplay;
		// Upgrade to version 1
		json.missionPath = missionPath;
		json.timestamp = 0;
		json.version = 1;

		let compressed = await executeOnWorker('compress', JSON.stringify(json)) as ArrayBuffer;
		replayData = compressed;
	}

	return replayData;
};

/** Downloads a replay as a .wrec file. */
const downloadReplay = async (replayData: ArrayBuffer, mission: Mission) => {
	replayData = await maybeUpdateReplay(replayData, mission.path); // Normalize the replay first

	// Create the blob and download it
	let blob = new Blob([replayData], {
		type: 'application/octet-stream'
	});
	let url = URL.createObjectURL(blob);
	let filename = Util.removeSpecialChars(mission.title.toLowerCase().split(' ').map(x => Util.uppercaseFirstLetter(x)).join(''));
	for (let i = 0; i < 6; i++) filename += Math.floor(Math.random() * 10); // Add a random string of numbers to the end
	filename += '.wrec';
	Util.download(url, filename);
	URL.revokeObjectURL(url);
};

const loadReplayButton = document.querySelector('#load-replay-button') as HTMLImageElement;
loadReplayButton.addEventListener('click', async (e) => {
	// Show a file picker
	let fileInput = document.createElement('input');
	fileInput.setAttribute('type', 'file');
	fileInput.setAttribute('accept', ".wrec");

	fileInput.onchange = async (e) => {
		try {
			let file = fileInput.files[0];
			let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(file);
			let replay = Replay.fromSerialized(arrayBuffer);

			let mission = [...beginnerLevels, ...intermediateLevels, ...advancedLevels, ...customLevels].find(x => x.path === replay.missionPath);
			if (!mission) throw new Error("Mission not found.");

			levelSelectDiv.classList.add('hidden');
			loadLevel(mission, () => replay);
		} catch (e) {
			alert("There was an error loading the replay.");
			console.error(e);
		}
	};
	fileInput.click();
});

loadReplayButton.addEventListener('mouseenter', () => {
	AudioManager.play('buttonover.wav');
});
loadReplayButton.addEventListener('mousedown', (e) => {
	if (e.button === 0) AudioManager.play('buttonpress.wav');
});

export const handleLevelSelectControllerInput = (gamepad: Gamepad) => {
	// A button to play
	if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
		playCurrentLevel();
		AudioManager.play('buttonpress.wav');
	}
	// LT, RT to change category
	if (gamepad.buttons[6].value > 0.5 && !previousButtonState[6]) {
		// Should probably have a function for this tbh
		if (getCurrentLevelArray() === intermediateLevels)
			selectTab('beginner');
		else if (getCurrentLevelArray() === advancedLevels)
			selectTab('intermediate');
		else if (getCurrentLevelArray() === customLevels)
			selectTab('advanced');
		AudioManager.play('buttonpress.wav');
	}
	if (gamepad.buttons[7].value > 0.5 && !previousButtonState[7]) {
		// Should probably have a function for this tbh
		if (getCurrentLevelArray() === beginnerLevels)
			selectTab('intermediate');
		else if (getCurrentLevelArray() === intermediateLevels)
			selectTab('advanced');
		else if (getCurrentLevelArray() === advancedLevels)
			selectTab('custom');
		AudioManager.play('buttonpress.wav');
	}
	// D-pad left+right to change levels
	if (gamepad.buttons[14].value > 0.5 && !previousButtonState[14]) {
		cycleMission(-1);
		AudioManager.play('buttonpress.wav');
	}
	if (gamepad.buttons[15].value > 0.5 && !previousButtonState[15]) {
		cycleMission(1);
		AudioManager.play('buttonpress.wav');
	}
};