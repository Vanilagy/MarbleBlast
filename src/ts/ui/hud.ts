import { AudioManager } from "../audio";
import { actionButtonContainer, blastButton, blastEnabled, freeLookButton, JOYSTICK_HANDLE_SIZE_FACTOR, jumpButton, movementJoystick, movementJoystickHandle, pauseButton, restartButton, setBlastEnabled, setUseEnabled, useButton } from "../input";
import { FRAME_RATE_OPTIONS } from "../rendering";
import { ResourceManager } from "../resources";
import { state } from "../state";
import { StorageManager } from "../storage";
import { Util } from "../util";
import { Menu } from "./menu";

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
	gemCountElement: HTMLDivElement;
	clockCanvas: HTMLCanvasElement;
	clockCtx: CanvasRenderingContext2D;
	helpElement: HTMLDivElement;
	alertElement: HTMLDivElement;
	centerElement: HTMLImageElement;
	powerUpBorder: HTMLImageElement;
	clockBackground: HTMLImageElement;
	fpsMeter: HTMLDivElement;
	fpsMeterValue: HTMLDivElement;
	frameTimeStore: number[] = [];
	blastMeter: HTMLDivElement;
	blastMeterBody: HTMLImageElement;
	blastMeterFill: HTMLImageElement;

	abstract gemCountMinDigits: number;
	abstract showClockBackground: boolean;
	abstract supportNumberColors: boolean;
	abstract supportFpsMeter: boolean;

	constructor(menu: Menu) {
		this.menu = menu;
		this.gemCountElement = document.querySelector('#gem-count');
		this.clockCanvas = document.querySelector('#clock');
		this.clockCtx = this.clockCanvas.getContext('2d');
		this.helpElement = document.querySelector('#help-text');
		this.alertElement = document.querySelector('#alert-text');
		this.centerElement = document.querySelector('#center-text');
		this.powerUpBorder = document.querySelector('#powerup-border');
		this.clockBackground = document.querySelector('#clock-background');
		this.fpsMeter = document.querySelector('#fps-meter');
		this.fpsMeterValue = document.querySelector('#fps-meter-value');
		this.blastMeter = document.querySelector('#blast-meter');
		this.blastMeterBody = document.querySelector('#blast-meter-body');
		this.blastMeterFill = document.querySelector('#blast-meter-fill');
	}

	async load() {
		await ResourceManager.loadImages(Object.values(numberSources).map(x => {
			let files = [x];
			if (this.supportNumberColors && !x.includes('slash') && !x.includes('dash')) {
				// Also load the colored variants
				files.push(x.slice(0, x.lastIndexOf('.')) + '_red.png');
				files.push(x.slice(0, x.lastIndexOf('.')) + '_green.png');
			}
			return files.map(y => this.menu.uiAssetPath + "game/numbers/" + y);
		}).flat());
		await ResourceManager.loadImages(["ready.png", "set.png", "go.png", "outofbounds.png", "powerup.png"].map(x => this.menu.uiAssetPath + "game/" + x));
		this.powerUpBorder.src = this.menu.uiAssetPath + 'game/powerup.png';
		if (this.showClockBackground) this.clockBackground.classList.remove('hidden');
		else this.clockBackground.classList.add('hidden');

		this.menu.gameUiDiv.classList.remove('gold', 'platinum');
		this.menu.gameUiDiv.classList.add(state.modification);

		if (StorageManager.data.settings.showFrameRate && this.supportFpsMeter) {
			this.fpsMeter.classList.remove('hidden');
		} else {
			this.fpsMeter.classList.add('hidden');
		}

		this.setBlastMeterVisibility(state.level.mission.hasBlast);
		if (state.level.mission.hasBlast) {
			await ResourceManager.loadImages(["blastbar.png", "blastbar_charged.png", "blastbar_bargreen.png", "blastbar_bargray.png"].map(x => "./assets/ui_mbp/game/" + x));
		}

		if (Util.isTouchDevice) this.setupTouchControls();
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

		this.blastMeter.style.left = '20px'; // Same thing here
		this.blastMeter.style.bottom = '47px'; // Same thing here

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

	/** Updates the game clock canvas. */
	displayTime(seconds: number, specialColor?: 'red' | 'green') {
		if (!this.supportNumberColors) specialColor = undefined;

		let string = Util.secondsToTimeString(seconds);
		const defaultWidth = 43;
		const defaultMarginRight = -19;
		let totalWidth = (string.length - 1) * (defaultWidth + defaultMarginRight) - (2 * (defaultWidth + defaultMarginRight - 10)) + defaultWidth;
		let baseOffset = Math.floor((this.clockCanvas.width - totalWidth) / 2);
		let currentX = 0;

		this.clockCtx.clearRect(0, 0, this.clockCanvas.width, this.clockCanvas.height);
		
		// Draw every symbol
		for (let i = 0; i < string.length; i++) {
			let char = string[i];
			let path = this.menu.uiAssetPath + "game/numbers/" + numberSources[char as keyof typeof numberSources];
			if (this.supportNumberColors && specialColor) path = path.slice(0, path.lastIndexOf('.')) + '_' + specialColor + '.png';
			let image = ResourceManager.getImageFromCache(path);

			if (char === ':' || char === '.') currentX -= 3;
			this.clockCtx.drawImage(image, baseOffset + currentX, 0);
			currentX += defaultWidth + defaultMarginRight;
			if (char === ':' || char === '.') currentX -= 7;
		}
	}

	/** Makes the powerup button visible/invisible depending on state and forceUpdate, see code. */
	setPowerupButtonState(enabled: boolean, forceUpdate: boolean = false) {
		if (Util.isTouchDevice) {
			setUseEnabled(enabled);
			if (enabled || forceUpdate) 
				useButton.style.opacity = '0.5';
			if (!enabled && forceUpdate)
				useButton.style.opacity = '0.2';
		}
	}

	/** Updates the gem count display. */
	displayGemCount(count: number, total: number) {
		if (total === 0) return;

		let string = Util.leftPadZeroes(count.toString(), this.gemCountMinDigits) + '/' + Util.leftPadZeroes(total.toString(), this.gemCountMinDigits);

		// Generate the appropriate number of image elements
		while (string.length > this.gemCountElement.children.length) {
			let newChild = document.createElement('img');
			this.gemCountElement.appendChild(newChild);
		}
		while (string.length < this.gemCountElement.children.length) {
			this.gemCountElement.removeChild(this.gemCountElement.lastChild);
		}

		for (let i = 0; i < string.length; i++) {
			let char = string[i];
			let node = this.gemCountElement.children[i] as HTMLImageElement;

			node.src = this.menu.uiAssetPath + "game/numbers/" + numberSources[char as keyof typeof numberSources];
		}
	}

	setGemVisibility(state: boolean) {
		this.gemCountElement.style.display = state? '' : 'none';
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

		this.helpElement.textContent = message;
		state.level.helpTextTimeState = Util.jsonClone(state.level.timeState);
		if (playSound) AudioManager.play('infotutorial.wav');
	}

	/** Displays an alert at the bottom of the screen. */
	displayAlert(message: string) {
		this.alertElement.textContent = message;
		state.level.alertTextTimeState = Util.jsonClone(state.level.timeState);
	}

	setCenterText(type: 'none' | 'ready' | 'set' | 'go' | 'outofbounds') {
		if (type === 'none') this.centerElement.style.display = 'none';
		else this.centerElement.style.display = '';
		
		if (type === 'ready') this.centerElement.src = this.menu.uiAssetPath + 'game/ready.png';
		if (type === 'set') this.centerElement.src = this.menu.uiAssetPath + 'game/set.png';
		if (type === 'go') this.centerElement.src = this.menu.uiAssetPath + 'game/go.png';
		if (type === 'outofbounds') this.centerElement.src = this.menu.uiAssetPath + 'game/outofbounds.png';
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

	setBlastMeterVisibility(state: boolean) {
		if (state) this.blastMeter.classList.remove('hidden');
		else this.blastMeter.classList.add('hidden');
	}

	displayBlastMeterFullness(amount: number) {
		if (amount > 1) this.blastMeterBody.src = './assets/ui_mbp/game/blastbar_charged.png';
		else this.blastMeterBody.src = './assets/ui_mbp/game/blastbar.png';

		if (amount >= 0.2) {
			if (!blastEnabled)
				blastButton.style.opacity = '0.5';
			setBlastEnabled(true);
		} else {
			if (blastEnabled)
				blastButton.style.opacity = '0.2';
			setBlastEnabled(false);
		}

		this.blastMeterFill.style.width = Util.clamp(amount, 0, 1) * 109 + 'px';
		this.blastMeterFill.src = `./assets/ui_mbp/game/blastbar_bar${(amount >= 0.2)? 'green' : 'gray'}.png`;
	}
}