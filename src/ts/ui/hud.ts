import { actionButtonContainer, blastButton, freeLookButton, JOYSTICK_HANDLE_SIZE_FACTOR, jumpButton, movementJoystick, movementJoystickHandle, pauseButton, restartButton, setUseEnabled, useButton } from "../input";
import { GO_TIME, MAX_TIME, PHYSICS_TICK_RATE, TimeState } from "../level";
import { Vector2 } from "../math/vector2";
import { ResourceManager } from "../resources";
import { state } from "../state";
import { StorageManager } from "../storage";
import { RGBAColor, Util } from "../util";
import { Menu } from "./menu";
import { computeUiScalingRatio, mainRenderer } from "./misc";
import { FRAME_RATE_OPTIONS } from "./options_mbp";

const numberSources = {
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
const keybindRegex = /<func:bind (\w+)>/g;

export abstract class Hud {
	menu: Menu;

	hudCanvas: HTMLCanvasElement;
	hudCtx: CanvasRenderingContext2D;
	/** The functional width of the HUD canvas. Due to pixel ratio scalings, this might not match the actual canvas width. */
	width: number;
	/** The functional height of the HUD canvas. Due to pixel ratio scalings, this might not match the actual canvas height. */
	height: number;

	fpsMeter: HTMLDivElement;
	fpsMeterValue: HTMLDivElement;
	frameTimeStore: number[] = [];

	centerText: 'none' | 'ready' | 'set' | 'go' | 'outofbounds' = 'none';
	helpText = '';
	/** The time state at the last point the help text was updated. */
	helpTextTimeState: TimeState = null;
	alertText = '';
	/** The time state at the last point the alert text was updated. */
	alertTextTimeState: TimeState = null;

	abstract gemCountMinDigits: number;
	abstract showClockBackground: boolean;
	abstract supportNumberColors: boolean;
	abstract supportFpsMeter: boolean;

	constructor(menu: Menu) {
		this.menu = menu;
		this.hudCanvas = document.querySelector('#hud-canvas');
		this.hudCtx = this.hudCanvas.getContext('2d', {
			desynchronized: false // There is weird, buggy Chromium behavior when this is true in the MBG HUD. No clue why, yet.
		});

		this.fpsMeter = document.querySelector('#fps-meter');
		this.fpsMeterValue = document.querySelector('#fps-meter-value');
	}

	async load() {
		let imagePathsToLoad: string[] = [];

		imagePathsToLoad.push(...Object.values(numberSources).map(x => {
			let files = [x];
			if (this.supportNumberColors && !x.includes('slash') && !x.includes('dash')) {
				// Also load the colored variants
				files.push(x.slice(0, x.lastIndexOf('.')) + '_red.png');
				files.push(x.slice(0, x.lastIndexOf('.')) + '_green.png');
			}
			return files.map(y => this.menu.uiAssetPath + "game/numbers/" + y);
		}).flat());
		imagePathsToLoad.push(...["ready.png", "set.png", "go.png", "outofbounds.png", "powerup.png"].map(x => this.menu.uiAssetPath + "game/" + x));

		if (StorageManager.data.settings.showFrameRate && this.supportFpsMeter) {
			this.fpsMeter.classList.remove('hidden');
		} else {
			this.fpsMeter.classList.add('hidden');
		}

		if (state.level.mission.hasBlast) {
			imagePathsToLoad.push(...["blastbar.png", "blastbar_charged.png", "blastbar_bargreen.png", "blastbar_bargray.png"].map(x => "./assets/ui_mbp/game/" + x));
		}

		imagePathsToLoad.push(...["./assets/ui_mbp/game/transparency.png"]);

		await ResourceManager.loadImages(imagePathsToLoad);

		if (Util.isTouchDevice) this.setupTouchControls();

		this.helpTextTimeState = null;
		this.alertTextTimeState = null;
	}

	setupTouchControls() {
		// Change the offset based on whether or not there's a gem counter
		pauseButton.style.top = state.level.totalGems? '60px' : '';
		restartButton.style.top = state.level.totalGems? '60px' : '';
		freeLookButton.style.top = state.level.totalGems? '60px' : '';

		// Kinda hacky here, don't wanna clean up: (Yes there's a good reason we don't set display)
		blastButton.style.visibility = state.level.mission.hasBlast? '' : 'hidden';
		blastButton.style.pointerEvents = state.level.mission.hasBlast? '' : 'none';
		freeLookButton.style.visibility = StorageManager.data.settings.alwaysFreeLook? 'hidden' : '';
		freeLookButton.style.pointerEvents = StorageManager.data.settings.alwaysFreeLook? 'none' : '';

		this.fpsMeter.style.transform = 'scale(0.5)';
		this.fpsMeter.querySelector('img').style.borderRight = '50px solid #ffffff4d'; // To make it visible with rounded corners
		this.fpsMeterValue.style.marginRight = '50px';

		// Adjust layout based on user settings:

		let joystickSize = StorageManager.data.settings.joystickSize;
		let joystickHandleSize = JOYSTICK_HANDLE_SIZE_FACTOR * joystickSize;

		movementJoystick.style.width = joystickSize + 'px';
		movementJoystick.style.height = joystickSize + 'px';
		movementJoystick.style.borderRadius = joystickHandleSize / 2 + 'px';
		movementJoystickHandle.style.width = joystickHandleSize + 'px';
		movementJoystickHandle.style.height = joystickHandleSize + 'px';

		let scale = StorageManager.data.settings.actionButtonSize / 120;
		actionButtonContainer.style.right = StorageManager.data.settings.actionButtonRightOffset/scale + 'px';
		actionButtonContainer.style.bottom = StorageManager.data.settings.actionButtonBottomOffset/scale + 'px';
		actionButtonContainer.style.transform = `scale(${scale})`;

		// Reorder the action buttons as needed
		let offsets = [{ right: 0, bottom: 135 }, { right: 0, bottom: 0 }, { right: 135, bottom: 0 }];
		let arr = Util.getPermutations([blastButton, jumpButton, useButton])[StorageManager.data.settings.actionButtonOrder];
		for (let button of arr) {
			button.style.right = offsets[arr.indexOf(button)].right + 'px';
			button.style.bottom = offsets[arr.indexOf(button)].bottom + 'px';
		}
	}

	setSize(width: number, height: number, pixelRatio: number) {
		let canvasWidth = Math.ceil(width * pixelRatio);
		let canvasHeight = Math.ceil(height * pixelRatio);

		this.hudCanvas.setAttribute("width", canvasWidth.toString());
		this.hudCanvas.setAttribute("height", canvasHeight.toString());

		let scalingRatio = computeUiScalingRatio(width, height);
		this.width = Math.ceil(width * scalingRatio);
		this.height = Math.ceil(height * scalingRatio);
	}

	/** Renders the entire HUD onto a canvas. */
	renderHud(timeState: TimeState) {
		const ctx = this.hudCtx;
		const level = state.level;
		const { width, height } = this;

		// Scale the context so that it spans the entire, actual width of the canvas
		let scale = this.hudCanvas.width / this.width;
		ctx.resetTransform();
		ctx.scale(scale, scale);

		ctx.clearRect(0, 0, width, height);

		// Draw the clock background
		if (this.showClockBackground) {
			let clockBackground = ResourceManager.getImageFromCache('./assets/ui_mbp/game/transparency.png');
			ctx.drawImage(clockBackground, Math.floor(width/2 - 220/2 + 3), -10, 220, 79);
		}

		// This might seem a bit strange, but the time we display is actually a few milliseconds in the PAST (unless the user is currently in TT or has finished), for the reason that time was able to go backwards upon finishing or collecting TTs due to CCD time correction. That felt wrong, so we accept this inaccuracy in displaying time for now.
		let timeToDisplay = timeState.gameplayClock;
		if (level.finishTime) timeToDisplay = level.finishTime.gameplayClock;
		if (level.currentTimeTravelBonus === 0 && !level.finishTime) timeToDisplay = Math.max(timeToDisplay - 1000 / PHYSICS_TICK_RATE, 0);
		level.maxDisplayedTime = Math.max(timeToDisplay, level.maxDisplayedTime);
		if (level.currentTimeTravelBonus === 0 && !level.finishTime) timeToDisplay = level.maxDisplayedTime;

		timeToDisplay = Math.min(timeToDisplay, MAX_TIME);

		// Draw the clock
		this.drawNumbers(Util.secondsToTimeString(timeToDisplay / 1000), width/2, 0, true, this.determineClockColor(timeToDisplay));

		// Draw the gem count
		if (level.totalGems > 0) {
			let string = Util.leftPadZeroes(level.gemCount.toString(), this.gemCountMinDigits) + '/' + Util.leftPadZeroes(level.totalGems.toString(), this.gemCountMinDigits);
			this.drawNumbers(string, 30, 0, false);
		}

		// Draw the power-up border (always there)
		let powerUpBorder = ResourceManager.getImageFromCache(this.menu.uiAssetPath + "game/powerup.png");
		ctx.drawImage(powerUpBorder, width - powerUpBorder.width - 5, 5);

		// Draw the center text
		if (this.centerText !== 'none') {
			let image = ResourceManager.getImageFromCache(this.menu.uiAssetPath + 'game/' + this.centerText + '.png');
			ctx.drawImage(image, Math.floor((width - image.width) / 2), Math.floor(height * 0.3));
		}

		let helpTextTime = this.helpTextTimeState?.timeSinceLoad ?? -Infinity;
		let alertTextTime = this.alertTextTimeState?.timeSinceLoad ?? -Infinity;
		let helpTextCompletion = Util.clamp((timeState.timeSinceLoad - helpTextTime - 3000) / 1000, 0, 1) ** 2;
		let alertTextCompletion = Util.clamp((timeState.timeSinceLoad - alertTextTime - 3000) / 1000, 0, 1) ** 2;

		// Draw the help text
		if (helpTextCompletion < 1) {
			let white: RGBAColor = { r: 255, g: 255, b: 255, a: 255 };
			let black: RGBAColor = { r: 0, g: 0, b: 0, a: 255 };
			let color = Util.lerpColors(white, black, Util.lerp(0, 0.5, helpTextCompletion));

			ctx.font = '24px DomCasualRegular';
			ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.shadowColor = state.modification === 'gold' ? 'black' : '#777777';
			ctx.shadowOffsetX = 1;
			ctx.shadowOffsetY = 1;
			ctx.globalAlpha = 1 - helpTextCompletion;

			let lines = this.breakTextIntoLines(this.helpText, width);
			for (let i = 0; i < lines.length; i++) {
				ctx.fillText(lines[i], Math.floor(width / 2), Math.floor(height * 0.45) + 24*1.2*i);
			}

			ctx.shadowColor = 'transparent';
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.globalAlpha = 1;
		}

		// Draw the alert text
		if (alertTextCompletion < 1) {
			let yellow: RGBAColor = state.modification === 'gold' ? { r: 255, g: 226, b: 64, a: 255 } : { r: 228, g: 211, b: 64, a: 129 };
			let black: RGBAColor = { r: 0, g: 0, b: 0, a: 255 };
			let color = Util.lerpColors(yellow, black, Util.lerp(0, 0.5, alertTextCompletion));

			ctx.font = '24px DomCasualRegular';
			ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			ctx.shadowColor = state.modification === 'gold' ? 'black' : 'rgb(119, 102, 34)';
			ctx.shadowOffsetX = 1;
			ctx.shadowOffsetY = 1;
			ctx.globalAlpha = 1 - alertTextCompletion;

			let lines = this.breakTextIntoLines(this.alertText, width);
			for (let i = 0; i < lines.length; i++) {
				ctx.fillText(lines[i], Math.floor(width / 2), height - 30 - 24*1.2*(lines.length - i - 1));
			}

			ctx.shadowColor = 'transparent';
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.globalAlpha = 1;
		}

		// Draw debug mode text
		if (mainRenderer.debugMode !== 0) {
			ctx.font = '24px DomCasualRegular';
			ctx.fillStyle = 'white';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			ctx.shadowColor = 'black';
			ctx.shadowOffsetX = 1;
			ctx.shadowOffsetY = 1;
			ctx.globalAlpha = 1;

			let debugText = "Debug Rendering: ";
			switch (mainRenderer.debugMode) {
				case 1: debugText += "UV"; break;
				case 2: debugText += "Normal (World)"; break;
				case 3: debugText += "Normal (Map)"; break;
				case 4: debugText += "Normal (Multiplied)"; break;
				case 5: debugText += "Tangent"; break;
				case 6: debugText += "Tangent A"; break;
				case 7: debugText += "TBN[T]"; break;
				case 8: debugText += "TBN[B]"; break;
				case 9: debugText += "TBN[N]"; break;
				default:
					debugText = "";
					break;
			}

			ctx.fillText(debugText, Math.floor(width / 2), 100);

			ctx.shadowColor = 'transparent';
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.globalAlpha = 1;
		}

		// Draw the blast meter
		if (level.mission.hasBlast) {
			let amount = level.blastAmount;

			let offset = new Vector2(7, 34);
			if (Util.isTouchDevice) offset.set(20, 47); // To make it visible with rounded corners

			let blastMeterFillSrc = `./assets/ui_mbp/game/blastbar_bar${(amount >= 0.2)? 'green' : 'gray'}.png`;
			let fillImage = ResourceManager.getImageFromCache(blastMeterFillSrc);
			ctx.drawImage(fillImage, offset.x + 5, height - offset.y + 5, Util.clamp(amount, 0, 1) * 109, 17);

			let bodyImage = ResourceManager.getImageFromCache((amount > 1)? './assets/ui_mbp/game/blastbar_charged.png' : './assets/ui_mbp/game/blastbar.png');
			ctx.drawImage(bodyImage, offset.x, height - offset.y);
		}
	}

	determineClockColor(timeToDisplay: number) {
		if (state.modification === 'gold') return;
		const level = state.level;

		if (level.finishTime) return 'green'; // Even if not qualified
		if (level.timeState.currentAttemptTime < GO_TIME || level.currentTimeTravelBonus > 0) return 'green';
		if (timeToDisplay >= level.mission.qualifyTime) return 'red';

		if (level.timeState.currentAttemptTime >= GO_TIME && isFinite(level.mission.qualifyTime) && state.modification === 'platinum') {
			// Create the flashing effect
			let alarmStart = level.mission.computeAlarmStartTime();
			let elapsed = timeToDisplay - alarmStart;
			if (elapsed < 0) return;
			if (Math.floor(elapsed / 1000) % 2 === 0) return 'red';
		}

		return; // Default yellow
	}

	drawNumbers(string: string, x: number, y: number, isClock: boolean, specialColor?: 'red' | 'green') {
		const defaultWidth = 43;
		const defaultMarginRight = -19;
		let currentX = 0;

		if (isClock) {
			let totalWidth = (string.length - 1) * (defaultWidth + defaultMarginRight) - (2 * (defaultWidth + defaultMarginRight - 10)) + defaultWidth;
			x = Math.floor(x - totalWidth/2);
		}

		// Draw every symbol
		for (let i = 0; i < string.length; i++) {
			let char = string[i];
			let path = this.menu.uiAssetPath + "game/numbers/" + numberSources[char as keyof typeof numberSources];
			if (this.supportNumberColors && specialColor) path = path.slice(0, path.lastIndexOf('.')) + '_' + specialColor + '.png';
			let image = ResourceManager.getImageFromCache(path);

			if (char === ':' || char === '.') currentX -= 3;
			this.hudCtx.drawImage(image, x + currentX, 0);
			currentX += defaultWidth + defaultMarginRight;
			if (char === ':' || char === '.') currentX -= 7;
		}
	}

	/** Breaks a text into a list of lines that together make up that text. Lines are created by regular line break characters or by lines being broken up because they're too wide. */
	breakTextIntoLines(text: string, maxWidth: number) {
		let lines = text.split('\n');

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			let metrics = this.hudCtx.measureText(line);

			// Check if the line is too wide
			if (metrics.width > maxWidth) {
				let words = line.split(' ');
				let low = 0;
				let high = words.length-1;
				let ans = 0;

				// Do a binary search on how many words we can include in the line before it becomes too wide
				while (low <= high) {
					let mid = Math.floor(low + (high - low + 1) / 2);
					let text = words.slice(0, mid + 1).join(' ');
					let width = this.hudCtx.measureText(text).width;

					if (width <= maxWidth) {
						low = mid + 1;
						ans = mid;
					} else {
						high = mid - 1;
					}
				}

				// Create two new lines, the updated shorter one and the remaining text as the following line.
				let updatedLine = words.slice(0, ans + 1).join(' ');
				let nextLine = words.slice(ans + 1).join(' ');

				lines[i] = updatedLine;
				lines.splice(i+1, 0, nextLine);
			}
		}

		return lines;
	}

	/** Makes the powerup button visible/invisible depending on state and forceUpdate, see code. */
	setPowerupButtonState(enabled: boolean, forceUpdate = false) {
		if (Util.isTouchDevice) {
			setUseEnabled(enabled);
			if (enabled || forceUpdate)
				useButton.style.opacity = '0.5';
			if (!enabled && forceUpdate)
				useButton.style.opacity = '0.2';
		}
	}

	/** Displays a help message in the middle of the screen. */
	displayHelp(message: string, playSound = false) {
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
				"turnup": "cameraUp",
				"turndown": "cameraDown",
				"turnleft": "cameraLeft",
				"turnright": "cameraRight",
				"freelook": "freeLook",
				"useblast": "blast"
			} as Record<string, string>)[match[1].toLowerCase()];
			if (!gameButton) continue;

			let keyName = Util.getKeyForButtonCode(StorageManager.data.settings.gameButtonMapping[gameButton as keyof typeof StorageManager.data.settings.gameButtonMapping]);
			message = message.slice(0, match.index) + keyName + message.slice(match.index + match[0].length);

			keybindRegex.lastIndex -= match[0].length;
		}

		// A few hardcoded messages from Marble Blast Mobile
		if (message === 'MSG_FINDALLTHEGEMS') message = "Find all the gems!";
		if (message === 'MSG_RACETOTHEFINISH') message = "Race to the finish!";

		this.helpText = message;
		this.helpTextTimeState = Util.jsonClone(state.level.timeState);
		if (playSound) state.level.audio.play('infotutorial.wav');
	}

	/** Displays an alert at the bottom of the screen. */
	displayAlert(message: string) {
		this.alertText = message;
		this.alertTextTimeState = Util.jsonClone(state.level.timeState);
	}

	setCenterText(type: 'none' | 'ready' | 'set' | 'go' | 'outofbounds') {
		this.centerText = type;
	}

	displayFps() {
		if (!(StorageManager.data.settings.showFrameRate && this.supportFpsMeter)) return;

		let now = performance.now();
		this.frameTimeStore.push(now);

		// Remove all frame times that were over a second ago
		while (this.frameTimeStore.length && this.frameTimeStore[0] + 1000 <= now) this.frameTimeStore.shift();

		let value = this.frameTimeStore.length;
		value /= Math.min(1, state.level.timeState.timeSinceLoad / 1000 ?? 1); // Hack to make it reach the final frame rate faster
		value = Math.floor(value);
		let settingsTarget = FRAME_RATE_OPTIONS[StorageManager.data.settings.frameRateCap];
		if (value === 59 || value === 119 || value === 143 || value === 239 || value === settingsTarget-1) value++; // Snap to the most common frame rates
		if (value === 61 || value === 121 || value === 145 || value === 241 || value === settingsTarget+1) value--;

		this.fpsMeterValue.textContent = 'FPS: ' + value;
	}
}