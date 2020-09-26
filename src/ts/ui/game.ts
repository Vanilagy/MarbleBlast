import { Util } from "../util";

export const gemCountElement = document.querySelector('#gem-count') as HTMLDivElement;
const clockElement = document.querySelector('#clock') as HTMLDivElement;
const helpElement = document.querySelector('#help-text') as HTMLDivElement;
const alertElement = document.querySelector('#alert-text') as HTMLDivElement;

let numberSources = {
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

export const displayTime = (seconds: number) => {
	let minutes = Math.floor(seconds / 60);
	let string = Util.leftPadZeroes(minutes.toString(), 2) + ':' + Util.leftPadZeroes(Math.floor(seconds % 60).toString(), 2) + '.' + (seconds % 1).toFixed(2).slice(2);

	while (clockElement.children.length < string.length) {
		let img = document.createElement('img');
		clockElement.appendChild(img);
	}
	while (clockElement.children.length > string.length) {
		clockElement.removeChild(clockElement.lastChild);
	}

	for (let i = 0; i < string.length; i++) {
		let char = string[i];
		let node = clockElement.children[i] as HTMLImageElement;

		node.src = "./assets/ui/game/numbers/" + numberSources[char as keyof typeof numberSources];
	}
};

export const displayGemCount = (count: number, total: number) => {
	let string = Util.leftPadZeroes(count.toString(), 2) + '/' + Util.leftPadZeroes(total.toString(), 2);

	for (let i = 0; i < string.length; i++) {
		let char = string[i];
		let node = gemCountElement.children[i] as HTMLImageElement;

		node.src = "./assets/ui/game/numbers/" + numberSources[char as keyof typeof numberSources];
	}
};

export const displayHelp = (message: string) => {
	helpElement.textContent = message;

	helpElement.style.animation = '';
	Util.forceLayout(helpElement);
	helpElement.style.animation = 'gameplay-text-popup 4s forwards ease-in';
};

export const displayAlert = (message: string) => {
	alertElement.textContent = message;

	alertElement.style.animation = '';
	Util.forceLayout(alertElement);
	alertElement.style.animation = 'gameplay-text-popup 4s forwards ease-in';
};