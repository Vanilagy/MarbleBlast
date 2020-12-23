import { Util } from "../util";
import { setupButton, menuDiv, startMenuMusic } from "./ui";
import { state } from "../state";
import { levelSelectDiv, cycleMission, beginnerLevels, intermediateLevels, advancedLevels, getCurrentLevelIndex, getCurrentLevelArray, updateOnlineLeaderboard, downloadReplay } from "./level_select";
import { GO_TIME } from "../level";
import { StorageManager } from "../storage";
import { ResourceManager } from "../resources";
import { AudioManager } from "../audio";
import { getPressedFlag, resetPressedFlag, isPressedByGamepad, previousButtonState } from "../input";

export const gameUiDiv = document.querySelector('#game-ui') as HTMLDivElement;
export const gemCountElement = document.querySelector('#gem-count') as HTMLDivElement;
const clockCanvas = document.querySelector('#clock') as HTMLCanvasElement;
const clockCtx = clockCanvas.getContext('2d');
export const helpElement = document.querySelector('#help-text') as HTMLDivElement;
export const alertElement = document.querySelector('#alert-text') as HTMLDivElement;
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
export const stopAndExit = () => {
	state.currentLevel.stop();
	state.currentLevel = null;
	pauseScreenDiv.classList.add('hidden');
	gameUiDiv.classList.add('hidden');
	levelSelectDiv.classList.remove('hidden');
	menuDiv.classList.remove('hidden');
	finishScreenDiv.classList.add('hidden');
	cycleMission(0); // Make sure to reload the current level to potentially update best times having changed
	startMenuMusic();
	updateOnlineLeaderboard();
	document.exitPointerLock();
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

	if (e.key === 'Escape') {
		if (state.currentLevel?.paused) {
			pauseNoButton.src = './assets/ui/common/no_d.png';
		} else {
			tryPause();
		}
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
	if (gameUiDiv.classList.contains('hidden') || !state.currentLevel || state.currentLevel.paused || (state.currentLevel.finishTime && state.currentLevel.replay.mode === 'record')) return;
	state.currentLevel.pause();
};

export const showPauseScreen = () => {
	pauseScreenDiv.classList.remove('hidden');
};

export const hidePauseScreen = () => {
	pauseScreenDiv.classList.add('hidden');
};

/** Updates the game clock canvas. */
export const displayTime = (seconds: number) => {
	let string = Util.secondsToTimeString(seconds);
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

	// Generate the appropriate number of image elements
	while (string.length > gemCountElement.children.length) {
		let newChild = document.createElement('img');
		gemCountElement.appendChild(newChild);
	}
	while (string.length < gemCountElement.children.length) {
		gemCountElement.removeChild(gemCountElement.lastChild);
	}

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
			"jump": "jump",
			"mousefire": "use",
			"panup": "cameraUp",
			"pandown": "cameraDown",
			"panleft": "cameraLeft",
			"panright": "cameraRight",
			"freelook": "freeLook"
		} as Record<string, string>)[match[1].toLowerCase()];
		if (!gameButton) continue;

		let keyName = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[gameButton as keyof typeof StorageManager.data.settings.gameButtonMapping]);
		message = message.slice(0, match.index) + keyName + message.slice(match.index + match[0].length);
	}

	// A few hardcoded messages from Marble Blast Mobile
	if (message === 'MSG_FINDALLTHEGEMS') message = "Find all the gems!";
	if (message === 'MSG_RACETOTHEFINISH') message = "Race to the finish!";

	helpElement.textContent = message;
	state.currentLevel.helpTextTimeState = Util.jsonClone(state.currentLevel.timeState);
};

/** Displays an alert at the bottom of the screen. */
export const displayAlert = (message: string) => {
	alertElement.textContent = message;
	state.currentLevel.alertTextTimeState = Util.jsonClone(state.currentLevel.timeState);
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
const viewReplayButton = document.querySelector('#finish-view-replay') as HTMLImageElement;

setupButton(replayButton, 'endgame/replay', () => {
	// Restart the level
	finishScreenDiv.classList.add('hidden');
	state.currentLevel.restart();
	document.documentElement.requestPointerLock();
});
setupButton(continueButton, 'endgame/continue', () => stopAndExit());

viewReplayButton.addEventListener('click', async (e) => {
	let level = state.currentLevel;

	if (e.altKey) {
		let serialized = await level.replay.serialize();
		downloadReplay(serialized, level.mission);
	} else {
		let confirmed = confirm("Do you want to start the replay for the last playthrough? This can be done only once if this isn't one of your top 3 local scores.");
		if (!confirmed) return;
	
		level.replay.mode = 'playback';
		replayButton.click();
	}
});
viewReplayButton.addEventListener('mouseenter', () => AudioManager.play('buttonover.wav'));
viewReplayButton.addEventListener('mousedown', () => AudioManager.play('buttonpress.wav'));

/** Shows the post-game finish screen. */
export const showFinishScreen = () => {
	let level = state.currentLevel;
	finishScreenDiv.classList.remove('hidden');

	let elapsedTime = Math.max(level.finishTime.currentAttemptTime - GO_TIME, 0);
	let bonusTime = Math.max(0, elapsedTime - level.finishTime.gameplayClock);
	let goldTime = level.mission.goldTime;
	let failedToQualify = false;

	// Change the message based on having achieve gold time, qualified time or not having qualified.
	finishScreenMessage.style.color = '';
	if (level.finishTime.gameplayClock <= goldTime) {
		finishScreenMessage.innerHTML = 'You beat the <span style="color: #fff700;">GOLD</span> time!';
	} else {
		if (level.finishTime.gameplayClock <= level.mission.qualifyTime) {
			finishScreenMessage.innerHTML = "You've qualified!";
		} else {
			finishScreenMessage.innerHTML = "You failed to qualify!";
			finishScreenMessage.style.color = 'red';
			failedToQualify = true;
		}
	}

	// Update the time elements
	finishScreenTime.textContent = Util.secondsToTimeString(level.finishTime.gameplayClock / 1000);
	qualifyTimeElement.textContent = isFinite(level.mission.qualifyTime)? Util.secondsToTimeString(level.mission.qualifyTime / 1000) : '99:59.999';
	qualifyTimeElement.style.color = failedToQualify? 'red' : '';
	qualifyTimeElement.style.textShadow = failedToQualify? '1px 1px 0px black' : '';
	
	goldTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
	goldTimeElement.parentElement.style.display = level.mission.hasGoldTime? '' : 'none';
	elapsedTimeElement.textContent = Util.secondsToTimeString(elapsedTime / 1000);
	bonusTimeElement.textContent = Util.secondsToTimeString(bonusTime / 1000);

	drawBestTimes();

	let bestTimes = StorageManager.getBestTimesForMission(level.mission.path);
	let place = bestTimes.filter((time) => time[1] <= level.finishTime.gameplayClock).length; // The place is determined by seeing how many scores there currently are faster than the achieved time.

	if (place <= 2 && !failedToQualify) {
		// Prompt the user to enter their name
		nameEntryScreenDiv.classList.remove('hidden');
		nameEntryText.textContent = `You got the ${['best', '2nd best', '3rd best'][place]} time!`;
		nameEntryInput.value = StorageManager.data.lastUsedName;
		//nameEntryInput.select(); // Don't select, since we want to avoid renames for leaderboard consistency
	} else {
		nameEntryScreenDiv.classList.add('hidden');
	}

	// Unlock the next level if qualified
	if (!failedToQualify && level.mission.type !== 'custom') {
		let typeIndex = ['beginner', 'intermediate', 'advanced'].indexOf(level.mission.type);
		let levelIndex = getCurrentLevelArray().indexOf(level.mission);
		let unlockedLevels = Math.min(Math.max(StorageManager.data.unlockedLevels[typeIndex], levelIndex + 1 + 1), [beginnerLevels, intermediateLevels, advancedLevels][typeIndex].length);
		
		StorageManager.data.unlockedLevels[typeIndex] = unlockedLevels;
		StorageManager.store();

		if (getCurrentLevelIndex() === levelIndex) cycleMission(1); // Cycle to that next level, but only if it isn't already selected
	}

	// Hide the replay button if the replay's invalid
	viewReplayButton.style.display = level.replay.isInvalid? 'none' : '';
};

/** Updates the best times. */
const drawBestTimes = () => {
	let level = state.currentLevel;
	let goldTime = level.mission.goldTime;

	let bestTimes = StorageManager.getBestTimesForMission(level.mission.path);
	bestTime1.children[0].textContent = '1. ' + bestTimes[0][0];
	bestTime1.children[1].textContent = Util.secondsToTimeString(bestTimes[0][1] / 1000);
	(bestTime1.children[1] as HTMLParagraphElement).style.color = (bestTimes[0][1] <= goldTime)? '#fff700' : '';
	(bestTime1.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[0][1] <= goldTime)? '1px 1px 0px black' : '';
	bestTime2.children[0].textContent = '2. ' + bestTimes[1][0];
	bestTime2.children[1].textContent = Util.secondsToTimeString(bestTimes[1][1] / 1000);
	(bestTime2.children[1] as HTMLParagraphElement).style.color = (bestTimes[1][1] <= goldTime)? '#fff700' : '';
	(bestTime2.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[1][1] <= goldTime)? '1px 1px 0px black' : '';
	bestTime3.children[0].textContent = '3. ' + bestTimes[2][0];
	bestTime3.children[1].textContent = Util.secondsToTimeString(bestTimes[2][1] / 1000);
	(bestTime3.children[1] as HTMLParagraphElement).style.color = (bestTimes[2][1] <= goldTime)? '#fff700' : '';
	(bestTime3.children[1] as HTMLParagraphElement).style.textShadow = (bestTimes[2][1] <= goldTime)? '1px 1px 0px black' : '';
};

export const nameEntryScreenDiv = document.querySelector('#name-entry-screen') as HTMLDivElement;
const nameEntryText = document.querySelector('#name-entry-screen > p:nth-child(3)') as HTMLParagraphElement;
const nameEntryInput = document.querySelector('#name-entry-input') as HTMLInputElement;
export const nameEntryButton = nameEntryScreenDiv.querySelector('#name-entry-confirm') as HTMLImageElement;

setupButton(nameEntryButton, 'common/ok', () => {
	let trimmed = nameEntryInput.value.trim();

	if (trimmed.length < 2) {
		alert("Please enter a proper name for usage in the online leaderboard.");
		return;
	}

	if (Util.isNaughty(trimmed)) {
		alert("The name you chose contains words deemed inappropriate. Please, do the right thing and choose a non-offensive name.");
		return;
	}

	// Store the time and close the dialog.
	let level = state.currentLevel;
	StorageManager.data.lastUsedName = trimmed;
	let newScoreId = StorageManager.insertNewTime(level.mission.path, trimmed, level.finishTime.gameplayClock);
	let uploadScoresPromise = updateOnlineLeaderboard();

	nameEntryScreenDiv.classList.add('hidden');
	drawBestTimes();

	// Store the replay
	if (level.replay.mode === 'record' && !level.replay.isInvalid) {
		level.replay.canStore = false;
		level.replay.serialize().then(async e => {
			await StorageManager.databasePut('replays', e, newScoreId);
			await uploadScoresPromise; // Make sure the scores have actually been uploaded before pushing the replay
			updateOnlineLeaderboard(true, false);
		});
	}
});

export const handlePauseScreenGamepadInput = (gamepad: Gamepad) => {
	// A button to exit
	if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
		stopAndExit();
		AudioManager.play('buttonpress.wav');
	}
	// B button or pause button to continue
	if (gamepad.buttons[1].value > 0.5 && !previousButtonState[1]) {
		state.currentLevel.unpause();
		AudioManager.play('buttonpress.wav');
	}
	if (gamepad.buttons[9].value > 0.5 && !previousButtonState[9]) {
		state.currentLevel.unpause();
		resetPressedFlag('pause');
		AudioManager.play('buttonpress.wav');
	}
	// Restart button to restart
	if (gamepad.buttons[8].value > 0.5 && !previousButtonState[8]) {
		state.currentLevel.unpause();
		state.currentLevel.restart();
		state.currentLevel.pressingRestart = true;
		AudioManager.play('buttonpress.wav');
	}
};

export const handleFinishScreenGamepadInput = () => {
	// If the finish screen is up, handle those buttons ...
	if (!nameEntryScreenDiv.classList.contains('hidden')) {
		if (isPressedByGamepad('jump') && getPressedFlag('jump')) {
			resetPressedFlag('jump');
			nameEntryButton.click();
			AudioManager.play('buttonpress.wav');
		}
	} else if (!finishScreenDiv.classList.contains('hidden')) {
		// Check for buttons
		if (isPressedByGamepad('use') && getPressedFlag('use')) {
			resetPressedFlag('use');
			viewReplayButton.click();
			AudioManager.play('buttonpress.wav');
		}
		if (isPressedByGamepad('jump') && getPressedFlag('jump')) {
			resetPressedFlag('jump');
			continueButton.click();
			AudioManager.play('buttonpress.wav');
			return;
		}
		if (isPressedByGamepad('restart') && getPressedFlag('restart')) {
			resetPressedFlag('restart');
			replayButton.click();
			AudioManager.play('buttonpress.wav');
		}
	}
};