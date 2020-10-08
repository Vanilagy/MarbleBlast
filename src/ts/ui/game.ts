import { Util } from "../util";
import { setupButton, menuDiv, startMenuMusic } from "./ui";
import { state } from "../state";
import { levelSelectDiv, cycleMission, beginnerLevels, intermediateLevels, advancedLevels, getCurrentLevelIndex } from "./level_select";
import { MissionElementScriptObject, MissionElementType } from "../parsing/mis_parser";
import { GO_TIME } from "../level";
import { StorageManager } from "../storage";
import { ResourceManager } from "../resources";

export const gameUiDiv = document.querySelector('#game-ui') as HTMLDivElement;
export const gemCountElement = document.querySelector('#gem-count') as HTMLDivElement;
const clockCanvas = document.querySelector('#clock') as HTMLCanvasElement;
const clockCtx = clockCanvas.getContext('2d');
const helpElement = document.querySelector('#help-text') as HTMLDivElement;
const alertElement = document.querySelector('#alert-text') as HTMLDivElement;
const centerElement = document.querySelector('#center-text') as HTMLImageElement;
const pauseScreenDiv = document.querySelector('#pause-screen') as HTMLDivElement;
const pauseYesButton = document.querySelector('#pause-yes') as HTMLImageElement;
const pauseNoButton = document.querySelector('#pause-no') as HTMLImageElement;
const pauseRestartButton = document.querySelector('#pause-restart') as HTMLImageElement;

export let numberSources = {
	"0": "0.png",
	"1": "1.png",
	"2": "2.png",
	"3": "3.png",
	"4": "4.png",
	"5": "5.png",
	"6": "6.png",
	"7": "7.png",
	"8": "8.png",
	"9": "9.png",
	":": "colon.png",
	".": "point.png",
	"/": "slash.png",
	"-": "dash.png"
};

/** Stops and destroys the current level and returns back to the menu. */
const stopAndExit = () => {
	state.currentLevel.stop();
	state.currentLevel = null;
	pauseScreenDiv.classList.add('hidden');
	gameUiDiv.classList.add('hidden');
	levelSelectDiv.classList.remove('hidden');
	menuDiv.classList.remove('hidden');
	finishScreenDiv.classList.add('hidden');
	cycleMission(0); // Make sure to reload the current level to potentially update best times having changed
	startMenuMusic();
};

setupButton(pauseYesButton, 'common/yes', () => {
	if (!state.currentLevel) return;
	stopAndExit();
});
setupButton(pauseNoButton, 'common/no', () => state.currentLevel.unpause());
setupButton(pauseRestartButton, 'common/restart', () => {
	state.currentLevel.unpause();
	state.currentLevel.restart();
});

document.addEventListener('pointerlockchange', () => {
	// When pointer lock is left, we pause.
	if (!document.pointerLockElement) tryPause();
});

window.addEventListener('keydown', (e) => {
	if (gameUiDiv.classList.contains('hidden')) return;

	if (state.currentLevel?.paused && e.key === 'Escape') {
		pauseNoButton.src = './assets/ui/common/no_d.png';
	}

	if (e.key === 'Enter') {
		if (!nameEntryScreenDiv.classList.contains('hidden')) {
			nameEntryButton.src = './assets/ui/common/ok_d.png';
		} else if (!finishScreenDiv.classList.contains('hidden')) {
			continueButton.src = './assets/ui/endgame/continue_d.png';
		}
	}
});

window.addEventListener('keyup', (e) => {
	if (gameUiDiv.classList.contains('hidden')) return;

	if (state.currentLevel?.paused && e.key === 'Escape' && pauseNoButton.src.endsWith('/assets/ui/common/no_d.png')) {
		pauseNoButton.src = './assets/ui/common/no_n.png';
		state.currentLevel.unpause();
	}

	if (e.key === 'Enter') {
		if (!nameEntryScreenDiv.classList.contains('hidden')) {
			nameEntryButton.click();
		} else if (!finishScreenDiv.classList.contains('hidden')) {
			continueButton.click();
		}
	}
});

const tryPause = () => {
	if (gameUiDiv.classList.contains('hidden') || !state.currentLevel || state.currentLevel.paused || state.currentLevel.finishTime) return;
	state.currentLevel.pause();
};

export const showPauseScreen = () => {
	pauseScreenDiv.classList.remove('hidden');
};

export const hidePauseScreen = () => {
	pauseScreenDiv.classList.add('hidden');
};

/** Converts seconds into a time string as seen in the game clock at the top, for example. */
export const secondsToTimeString = (seconds: number) => {
	let minutes = Math.floor(seconds / 60);
	let string = Util.leftPadZeroes(minutes.toString(), 2) + ':' + Util.leftPadZeroes(Math.floor(seconds % 60).toString(), 2) + '.' + Util.leftPadZeroes(Math.floor(seconds % 1 * 100).toString(), 2);

	return string;
}

/** Updates the game clock canvas. */
export const displayTime = (seconds: number) => {
	let string = secondsToTimeString(seconds);
	const defaultWidth = 43;
	const defaultMarginRight = -19;
	let totalWidth = (string.length - 1) * (defaultWidth + defaultMarginRight) - (2 * (defaultWidth + defaultMarginRight - 10)) + defaultWidth;
	let baseOffset = Math.floor((clockCanvas.width - totalWidth) / 2);
	let currentX = 0;

	clockCtx.clearRect(0, 0, clockCanvas.width, clockCanvas.height);
	
	// Draw every symbol
	for (let i = 0; i < string.length; i++) {
		let char = string[i];
		let path = "./assets/ui/game/numbers/" + numberSources[char as keyof typeof numberSources];
		let image = ResourceManager.getImageFromCache(path);

		if (char === ':' || char === '.') currentX -= 3;
		clockCtx.drawImage(image, baseOffset + currentX, 0);
		currentX += defaultWidth + defaultMarginRight;
		if (char === ':' || char === '.') currentX -= 7;
	}
};

/** Updates the gem count display. */
export const displayGemCount = (count: number, total: number) => {
	let string = Util.leftPadZeroes(count.toString(), 2) + '/' + Util.leftPadZeroes(total.toString(), 2);

	for (let i = 0; i < string.length; i++) {
		let char = string[i];
		let node = gemCountElement.children[i] as HTMLImageElement;

		node.src = "./assets/ui/game/numbers/" + numberSources[char as keyof typeof numberSources];
	}
};

const keybindRegex = /<func:bind (\w+)>/g;
/** Displays a help message in the middle of the screen. */
export const displayHelp = async (message: string) => {
	keybindRegex.lastIndex = 0;
	let match: RegExpMatchArray;

	// Search the string for possible keybind references. If found, replace them with the key bound to that keybind.
	while ((match = keybindRegex.exec(message)) !== null) {
		let gameButton = ({
			"moveforward": "up",
			"movebackward": "down",
			"moveleft": "left",
			"moveright": "right",
			"jump": "jump"
		} as Record<string, string>)[match[1]];
		if (!gameButton) continue;

		let keyName = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[gameButton as keyof typeof StorageManager.data.settings.gameButtonMapping]);
		message = message.slice(0, match.index) + keyName + message.slice(match.index + match[0].length);
	}

	// Replace newlines with... newlines
	message = message.replace(/\\n/g, '\n');
	// Remove all backslashes
	message = message.replace(/\\/g, '');

	helpElement.textContent = message;

	helpElement.style.animation = '';
	Util.forceLayout(helpElement);
	helpElement.style.animation = 'gameplay-text-popup 4s forwards ease-in';
};

/** Displays an alert at the bottom of the screen. */
export const displayAlert = (message: string) => {
	alertElement.textContent = message;

	alertElement.style.animation = '';
	Util.forceLayout(alertElement);
	alertElement.style.animation = 'gameplay-text-popup 4s forwards ease-in';
};

export const setCenterText = (type: 'none' | 'ready' | 'set' | 'go' | 'outofbounds') => {
	if (type === 'none') centerElement.style.display = 'none';
	else centerElement.style.display = '';
	
	if (type === 'ready') centerElement.src = './assets/ui/game/ready.png';
	if (type === 'set') centerElement.src = './assets/ui/game/set.png';
	if (type === 'go') centerElement.src = './assets/ui/game/go.png';
	if (type === 'outofbounds') centerElement.src = './assets/ui/game/outofbounds.png';
}

export const finishScreenDiv = document.querySelector('#finish-screen') as HTMLDivElement;
const finishScreenTime = document.querySelector('#finish-screen-time-time') as HTMLParagraphElement;
const finishScreenMessage = document.querySelector('#finish-message') as HTMLParagraphElement;
const qualifyTimeElement = document.querySelector('#finish-qualify-time') as HTMLParagraphElement;
const goldTimeElement = document.querySelector('#finish-gold-time') as HTMLParagraphElement;
const elapsedTimeElement = document.querySelector('#finish-elapsed-time') as HTMLParagraphElement;
const bonusTimeElement = document.querySelector('#finish-bonus-time') as HTMLParagraphElement;
const bestTime1 = document.querySelector('#best-time-1') as HTMLParagraphElement;
const bestTime2 = document.querySelector('#best-time-2') as HTMLParagraphElement;
const bestTime3 = document.querySelector('#best-time-3') as HTMLParagraphElement;
const replayButton = document.querySelector('#finish-replay') as HTMLImageElement;
const continueButton = document.querySelector('#finish-continue') as HTMLImageElement;

setupButton(replayButton, 'endgame/replay', () => {
	// Restart the level
	finishScreenDiv.classList.add('hidden');
	state.currentLevel.restart();
	document.documentElement.requestPointerLock();
});
setupButton(continueButton, 'endgame/continue', () => stopAndExit());

/** Shows the post-game finish screen. */
export const showFinishScreen = () => {
	let level = state.currentLevel;
	finishScreenDiv.classList.remove('hidden');

	let missionInfo = level.mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
	let elapsedTime = level.finishTime.currentAttemptTime - GO_TIME;
	let bonusTime = Math.max(0, elapsedTime - level.finishTime.gameplayClock);
	let goldTime = Number(missionInfo.goldTime);
	let failedToQualify = false;

	// Change the message based on having achieve gold time, qualified time or not having qualified.
	finishScreenMessage.style.color = '';
	if (level.finishTime.gameplayClock <= goldTime) {
		finishScreenMessage.innerHTML = 'You beat the <span style="color: #fff700;">GOLD</span> time!';
	} else {
		let qualifyTime = (missionInfo.time && missionInfo.time !== "0")? Number(missionInfo.time) : Infinity;
		if (level.finishTime.gameplayClock <= qualifyTime) {
			finishScreenMessage.innerHTML = "You've qualified!";
		} else {
			finishScreenMessage.innerHTML = "You failed to qualify!";
			finishScreenMessage.style.color = 'red';
			failedToQualify = true;
		}
	}

	// Update the time elements
	finishScreenTime.textContent = secondsToTimeString(level.finishTime.gameplayClock / 1000);
	qualifyTimeElement.textContent = (missionInfo.time && missionInfo.time !== "0")? secondsToTimeString(Number(missionInfo.time) / 1000) : '99:59.99';
	qualifyTimeElement.style.color = failedToQualify? 'red' : '';
	qualifyTimeElement.style.textShadow = failedToQualify? '1px 1px 0px black' : '';
	
	goldTimeElement.textContent = secondsToTimeString(goldTime / 1000);
	elapsedTimeElement.textContent = secondsToTimeString(elapsedTime / 1000);
	bonusTimeElement.textContent = secondsToTimeString(bonusTime / 1000);

	drawBestTimes();

	let bestTimes = StorageManager.getBestTimesForMission(level.missionPath);
	let place = bestTimes.filter((time) => time[1] <= level.finishTime.gameplayClock).length; // The place is determined by seeing how many scores there currently are faster than the achieved time.

	if (place <= 2 && !failedToQualify) {
		// Prompt the user to enter their name
		nameEntryScreenDiv.classList.remove('hidden');
		nameEntryText.textContent = `You got the ${['best', '2nd best', '3rd best'][place]} time!`;
		nameEntryInput.value = StorageManager.data.lastUsedName;
		nameEntryInput.select();
	} else {
		nameEntryScreenDiv.classList.add('hidden');
	}

	// Unlock the next level if qualified
	if (!failedToQualify) {
		let typeIndex = ['beginner', 'intermediate', 'advanced'].indexOf(missionInfo.type.toLowerCase());
		let unlockedLevels = Math.min(Math.max(StorageManager.data.unlockedLevels[typeIndex], Number(missionInfo.level) + 1), [beginnerLevels, intermediateLevels, advancedLevels][typeIndex].length);
		
		StorageManager.data.unlockedLevels[typeIndex] = unlockedLevels;
		StorageManager.store();

		if (getCurrentLevelIndex() === Number(missionInfo.level) - 1) cycleMission(1); // Cycle to that next level, but only if it isn't already selected
	}
};

/** Updates the best times. */
const drawBestTimes = () => {
	let level = state.currentLevel;
	let missionInfo = level.mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
	let goldTime = Number(missionInfo.goldTime);

	let bestTimes = StorageManager.getBestTimesForMission(level.missionPath);
	bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
	bestTime1.children[1].textContent = secondsToTimeString(bestTimes[0][1] / 1000);
	(bestTime1.children[1] as HTMLParagraphElement).style.color = (bestTimes[0][1] <= goldTime)? '#fff700' : '';
	(bestTime1.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[0][1] <= goldTime)? '1px 1px 0px black' : '';
	bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
	bestTime2.children[1].textContent = secondsToTimeString(bestTimes[1][1] / 1000);
	(bestTime2.children[1] as HTMLParagraphElement).style.color = (bestTimes[1][1] <= goldTime)? '#fff700' : '';
	(bestTime2.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[1][1] <= goldTime)? '1px 1px 0px black' : '';
	bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
	bestTime3.children[1].textContent = secondsToTimeString(bestTimes[2][1] / 1000);
	(bestTime3.children[1] as HTMLParagraphElement).style.color = (bestTimes[2][1] <= goldTime)? '#fff700' : '';
	(bestTime3.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[2][1] <= goldTime)? '1px 1px 0px black' : '';
};

const nameEntryScreenDiv = document.querySelector('#name-entry-screen') as HTMLDivElement;
const nameEntryText = document.querySelector('#name-entry-screen > p:nth-child(3)') as HTMLParagraphElement;
const nameEntryInput = document.querySelector('#name-entry-input') as HTMLInputElement;
const nameEntryButton = nameEntryScreenDiv.querySelector('#name-entry-confirm') as HTMLImageElement;

setupButton(nameEntryButton, 'common/ok', () => {
	// Store the time and close the dialog.
	let level = state.currentLevel;
	StorageManager.data.lastUsedName = nameEntryInput.value.trim();
	StorageManager.insertNewTime(level.missionPath, nameEntryInput.value.trim(), level.finishTime.gameplayClock);

	nameEntryScreenDiv.classList.add('hidden');
	drawBestTimes();
});