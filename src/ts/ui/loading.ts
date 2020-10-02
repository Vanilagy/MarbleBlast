import { setupButton, menuDiv, stopMenuMusic } from "./ui";
import { MissionElementSimGroup, MissionElementScriptObject, MissionElementType } from "../parsing/mis_parser";
import { levelSelectDiv } from "./level_select";
import { state } from "../state";
import { Level } from "../level";
import { gameUiDiv } from "./game";
import { Util } from "../util";

const loadingDiv = document.querySelector('#loading') as HTMLDivElement;
const levelNameElement = document.querySelector('#loading-level-name') as HTMLParagraphElement;
const cancelButton = document.querySelector('#loading-cancel') as HTMLImageElement;
const progressBar = document.querySelector('#loading-progress') as HTMLDivElement;
const maxProgressBarWidth = 252;

setupButton(cancelButton, 'loading/cancel', () => {
	loadingDiv.classList.add('hidden');
	levelSelectDiv.classList.remove('hidden');
});

export const loadLevel = async (mission: MissionElementSimGroup) => {
	loadingDiv.classList.remove('hidden');

	let missionInfo = mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === 'MissionInfo') as MissionElementScriptObject;
	levelNameElement.textContent = missionInfo.name.replace(/\\n/g, '\n').replace(/\\/g, '');

	progressBar.style.width = '0px';

	await Util.wait(50);

	let refresher = setInterval(() => {
		let completion = level.getLoadingCompletion();
		progressBar.style.width = (completion * maxProgressBarWidth) + 'px';
	}) as unknown as number;

	let level = new Level(mission);
	level.init().then(async () => {
		clearInterval(refresher);

		// Fake some second loading pass
		let start = performance.now();
		refresher = setInterval(() => {
			let completion = Util.clamp((performance.now() - start) / 100, 0, 1);
			progressBar.style.width = (completion * maxProgressBarWidth) + 'px';
		});

		await Util.wait(150);
		clearInterval(refresher);

		stopMenuMusic();
		state.currentLevel = level;
		level.start();

		loadingDiv.classList.add('hidden');
		menuDiv.classList.add('hidden');
		gameUiDiv.classList.remove('hidden');
	});
};