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

	constructor(menu: Menu) {
		this.menu = menu;
		this.gemCountElement = document.querySelector('#gem-count');
		this.clockCanvas = document.querySelector('#clock');
		this.clockCtx = this.clockCanvas.getContext('2d');
		this.helpElement = document.querySelector('#help-text');
		this.alertElement = document.querySelector('#alert-text');
		this.centerElement = document.querySelector('#center-text');
	}

	async load() {
		await ResourceManager.loadImages(Object.values(numberSources).map(x => this.menu.uiAssetPath + "game/numbers/" + x));
		await ResourceManager.loadImages(["ready.png", "set.png", "go.png", "outofbounds.png", "powerup.png"].map(x => this.menu.uiAssetPath + "game/" + x));
	}

	/** Updates the game clock canvas. */
	displayTime(seconds: number) {
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
			let image = ResourceManager.getImageFromCache(path);

			if (char === ':' || char === '.') currentX -= 3;
			this.clockCtx.drawImage(image, baseOffset + currentX, 0);
			currentX += defaultWidth + defaultMarginRight;
			if (char === ':' || char === '.') currentX -= 7;
		}
	}

	/** Updates the gem count display. */
	displayGemCount(count: number, total: number) {
		let string = Util.leftPadZeroes(count.toString(), 2) + '/' + Util.leftPadZeroes(total.toString(), 2);

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
	displayHelp(message: string) {
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

		this.helpElement.textContent = message;
		state.level.helpTextTimeState = Util.jsonClone(state.level.timeState);
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
}