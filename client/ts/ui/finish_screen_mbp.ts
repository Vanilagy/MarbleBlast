import { MissionLibrary } from "../mission_library";
import { G } from "../global";
import { BestTimes } from "../storage";
import { Util } from "../util";
import { FinishScreen } from "./finish_screen";
import { Menu } from "./menu";
import { GameMode } from "../game/game_mode";
import { BLUE_GEM_TEXT_COLOR, RED_GEM_TEXT_COLOR, YELLOW_GEM_TEXT_COLOR } from "../game/shapes/gem";

export const MBP_GOLD_COLOR = 'rgb(255, 204, 0)';
export const MBP_PLATINUM_COLOR = 'rgb(204, 204, 204)';
export const MBP_ULTIMATE_COLOR = 'rgb(255, 221, 34)';

export class MbpFinishScreen extends FinishScreen {
	background = document.querySelector('#mbp-finish-screen-background') as HTMLImageElement;
	timeHeading = document.querySelector('#mbp-finish-screen-time') as HTMLParagraphElement;
	scoreHeading = document.querySelector('#mbp-finish-screen-score') as HTMLDivElement;
	score = document.querySelector('#mbp-finish-screen-score-score') as HTMLDivElement;
	rank = document.querySelector('#mbp-finish-screen-rank') as HTMLParagraphElement;
	viewReplayButton = document.querySelector('#mbp-finish-view-replay') as HTMLImageElement;
	topTimesHeading = document.querySelector('#mbp-finish-screen-top-times-heading') as HTMLParagraphElement;
	timeRows = document.querySelector('#mbp-finish-time-rows') as HTMLDivElement;
	nextLevelImage = document.querySelector('#mbp-finish-next-level-image') as HTMLImageElement;
	nextLevelButton = document.querySelector('#mbp-finish-next-level') as HTMLImageElement;
	scoreboardContainer = document.querySelector('#mbp-finish-screen-scoreboard') as HTMLDivElement;

	qualifyTimeElement: HTMLElement;
	goldTimeElement: HTMLElement;
	platinumTimeElement: HTMLSpanElement;
	ultimateTimeElement: HTMLSpanElement;

	qualifyScoreElement: HTMLElement;
	goldScoreElement: HTMLElement;
	platinumScoreElement: HTMLSpanElement;
	ultimateScoreElement: HTMLSpanElement;

	elapsedTimeElement: HTMLElement;
	bonusTimeElement: HTMLElement;

	bestTimeCount = 5;
	scorePlaceholderName = "Matan W.";
	storeNotQualified = true;

	initProperties() {
		this.div = document.querySelector('#mbp-finish-screen');
		this.time = document.querySelector('#mbp-finish-screen-time-time');
		this.message = document.querySelector('#mbp-finish-message');
		this.replayButton = document.querySelector('#mbp-finish-replay');
		this.continueButton = document.querySelector('#mbp-finish-continue');
		this.bestTimeContainer = document.querySelector('#mbp-finish-screen-top-times');

		this.nameEntryScreenDiv = document.querySelector('#mbp-name-entry-screen');
		this.nameEntryText = document.querySelector('#mbp-name-entry-screen > p:nth-child(3)');
		this.nameEntryInput = document.querySelector('#mbp-name-entry-input');
		this.nameEntryButton = this.nameEntryScreenDiv.querySelector('#mbp-name-entry-confirm');
		this.nameEntryButtonSrc = 'endgame/ok';
	}

	constructor(menu: Menu) {
		super(menu);

		menu.setupButton(this.viewReplayButton, 'play/replay', (e) => this.onViewReplayButtonClick(e.altKey));
		Util.onLongTouch(this.viewReplayButton, () => this.onViewReplayButtonClick(true));

		this.qualifyTimeElement = this.createTimeRow('Par Time').children[0] as HTMLSpanElement;
		this.goldTimeElement = this.createTimeRow('Gold Time').children[0] as HTMLSpanElement;
		this.platinumTimeElement = this.createTimeRow('Platinum Time').children[0] as HTMLSpanElement;
		this.ultimateTimeElement = this.createTimeRow('Ultimate Time').children[0] as HTMLSpanElement;

		this.qualifyScoreElement = this.createTimeRow('Par Score').children[0] as HTMLSpanElement;
		this.goldScoreElement = this.createTimeRow('Gold Score').children[0] as HTMLSpanElement;
		this.platinumScoreElement = this.createTimeRow('Platinum Score').children[0] as HTMLSpanElement;
		this.ultimateScoreElement = this.createTimeRow('Ultimate Score').children[0] as HTMLSpanElement;

		this.elapsedTimeElement = this.createTimeRow('Time Passed').children[0] as HTMLSpanElement;
		this.bonusTimeElement = this.createTimeRow('Clock Bonuses').children[0] as HTMLSpanElement;

		this.goldTimeElement.parentElement.style.color = this.goldScoreElement.parentElement.style.color = 'rgb(255, 204, 0)';
		this.platinumTimeElement.parentElement.style.color = this.platinumScoreElement.parentElement.style.color = 'rgb(204, 204, 204)';
		this.ultimateTimeElement.parentElement.style.color = this.ultimateScoreElement.parentElement.style.color = 'rgb(255, 221, 34)';
		this.elapsedTimeElement.parentElement.style.marginTop = '20px';

		menu.setupButton(this.nextLevelButton, 'endgame/level_window', () => {
			let nextLevel = this.getNextLevel();
			let levelSelect = G.menu.levelSelect;

			// Exit to level select and immediately load the next level
			this.continueButton.click();
			levelSelect.setMissionArray(nextLevel.array);
			levelSelect.currentMissionIndex = nextLevel.index;
			levelSelect.playCurrentMission();
		}, undefined, undefined, false);
	}

	createTimeRow(label: string) {
		let row = document.createElement('p');
		row.innerHTML = label + ':<span></span>';
		this.timeRows.appendChild(row);

		return row;
	}

	show() {
		super.show();

		let game = G.game;
		let nextLevel = this.getNextLevel();
		let mission = nextLevel.array[nextLevel.index];

		if (game.type === 'multiplayer') {
			this.nextLevelImage.style.display = 'none';
			this.nextLevelButton.style.display = 'none';
			this.background.style.filter = 'hue-rotate(180deg) saturate(0.7)';
		} else {
			this.nextLevelImage.style.display = '';
			this.nextLevelButton.style.display = '';
			this.nextLevelImage.src = mission.getImagePath();
			this.background.style.filter = '';
		}

		if (game.mode === GameMode.Hunt) {
			this.timeHeading.style.display = 'none';
			this.scoreHeading.style.display = '';
			this.rank.style.display = '';

			this.qualifyTimeElement.parentElement.style.display = 'none';
			this.goldTimeElement.parentElement.style.display = 'none';
			this.platinumTimeElement.parentElement.style.display = 'none';
			this.ultimateTimeElement.parentElement.style.display = 'none';
			this.qualifyScoreElement.parentElement.style.display = '';
			this.goldScoreElement.parentElement.style.display = '';
			this.platinumScoreElement.parentElement.style.display = '';
			this.ultimateScoreElement.parentElement.style.display = '';

			this.topTimesHeading.textContent = "Final Scoreboard:";
			this.bestTimeContainer.style.display = 'none';
			this.scoreboardContainer.style.display = '';

			let points = game.finishState.huntPoints.get(game.localPlayer.controlledMarble);
			this.score.innerHTML = `
				${points.total}
				<br>
				<span>
					<span style="color: ${RED_GEM_TEXT_COLOR};">${points.reds}</span>
					<span style="color: ${YELLOW_GEM_TEXT_COLOR};">${points.yellows}</span>
					<span style="color: ${BLUE_GEM_TEXT_COLOR};">${points.blues}</span>
				</span>
			`;

			let rank = Util.count([...game.finishState.huntPoints], x => x[1].total > points.total) + 1;
			this.rank.textContent = `${rank}${Util.getOrdinalSuffix(rank)}`;
			if (rank === 1) this.rank.style.color = 'rgb(238, 200, 132)';
			else if (rank === 2) this.rank.style.color = 'rgb(205, 205, 205)';
			else if (rank === 3) this.rank.style.color = 'rgb(201, 175, 160)';
			else this.rank.style.color = '';

			if (points.total < game.mission.qualifyScore) {
				this.showHuntMessage('failed');
			} else if (points.total >= game.mission.ultimateScore) {
				this.showHuntMessage('ultimate');
			} else if (points.total >= game.mission.goldScore) {
				this.showHuntMessage('gold');
			} else {
				this.showHuntMessage('qualified');
			}

			this.updateScoreElements();
			this.updateScoreboard();
		} else {
			this.timeHeading.style.display = '';
			this.scoreHeading.style.display = 'none';
			this.rank.style.display = 'none';

			this.qualifyTimeElement.parentElement.style.display = '';
			this.goldTimeElement.parentElement.style.display = '';
			this.platinumTimeElement.parentElement.style.display = '';
			this.ultimateTimeElement.parentElement.style.display = '';
			this.qualifyScoreElement.parentElement.style.display = 'none';
			this.goldScoreElement.parentElement.style.display = 'none';
			this.platinumScoreElement.parentElement.style.display = 'none';
			this.ultimateScoreElement.parentElement.style.display = 'none';

			this.topTimesHeading.textContent = "Top 5 Local Times:";
			this.bestTimeContainer.style.display = '';
			this.scoreboardContainer.style.display = 'none';
		}
	}

	showMessage(type: 'failed' | 'qualified' | 'gold' | 'ultimate') {
		if (G.game.mode === GameMode.Hunt) return;

		this.message.style.color = '';

		if (type === 'ultimate') {
			this.message.innerHTML = `You beat the <span style="color: ${MBP_ULTIMATE_COLOR};">Ultimate</span> Time!`;
		} else if (type === 'gold') {
			if (G.game.mission.modification === 'gold') this.message.innerHTML = `You beat the <span style="color: ${MBP_GOLD_COLOR};">Gold</span> Time!`;
			else this.message.innerHTML = `You beat the <span style="color: ${MBP_PLATINUM_COLOR};">Platinum</span> Time!`;
		} else if (type === 'qualified') {
			this.message.innerHTML = "You beat the Par Time!";
		} else {
			this.message.innerHTML = "You didn't pass the Par Time!";
			this.message.style.color = 'rgb(245, 85, 85)';
		}
	}

	showHuntMessage(type: 'failed' | 'qualified' | 'gold' | 'ultimate') {
		this.message.style.color = '';

		if (type === 'ultimate') {
			this.message.innerHTML = `You beat the <span style="color: ${MBP_ULTIMATE_COLOR};">Ultimate</span> Score!`;
		} else if (type === 'gold') {
			if (G.game.mission.modification === 'gold') this.message.innerHTML = `You beat the <span style="color: ${MBP_GOLD_COLOR};">Gold</span> Score!`;
			else this.message.innerHTML = `You beat the <span style="color: ${MBP_PLATINUM_COLOR};">Platinum</span> Score!`;
		} else if (type === 'qualified') {
			this.message.innerHTML = "You beat the Par Score!";
		} else {
			this.message.innerHTML = "You didn't pass the Par Score!";
			this.message.style.color = 'rgb(245, 85, 85)';
		}
	}

	updateTimeElements(elapsedTime: number, bonusTime: number) {
		let game = G.game;

		this.elapsedTimeElement.textContent = Util.secondsToTimeString(elapsedTime);
		this.bonusTimeElement.textContent = Util.secondsToTimeString(bonusTime);
		Util.monospaceNumbers(this.elapsedTimeElement);
		Util.monospaceNumbers(this.bonusTimeElement);

		if (game.mode === GameMode.Hunt) return;

		this.time.textContent = Util.secondsToTimeString(game.finishState.time);
		this.qualifyTimeElement.textContent = isFinite(game.mission.qualifyTime)? Util.secondsToTimeString(game.mission.qualifyTime / 1000) : Util.secondsToTimeString(5999.999);
		Util.monospaceNumbers(this.qualifyTimeElement);

		let goldTime = game.mission.goldTime;
		this.goldTimeElement.parentElement.style.display = 'none';
		this.platinumTimeElement.parentElement.style.display = 'none';

		if (isFinite(goldTime)) {
			if (game.mission.modification === 'gold') {
				this.goldTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
				this.goldTimeElement.parentElement.style.display = '';
				Util.monospaceNumbers(this.goldTimeElement);
			} else {
				this.platinumTimeElement.textContent = Util.secondsToTimeString(goldTime / 1000);
				this.platinumTimeElement.parentElement.style.display = '';
				Util.monospaceNumbers(this.platinumTimeElement);
			}
		}

		let ultimateTime = game.mission.ultimateTime;
		this.ultimateTimeElement.parentElement.style.display = 'none';

		if (isFinite(ultimateTime)) {
			this.ultimateTimeElement.textContent = Util.secondsToTimeString(ultimateTime / 1000);
			this.ultimateTimeElement.parentElement.style.display = '';
			Util.monospaceNumbers(this.ultimateTimeElement);
		}
	}

	updateScoreElements() {
		let game = G.game;

		this.qualifyScoreElement.textContent = isFinite(game.mission.qualifyScore)? game.mission.qualifyScore.toString() : '0';

		this.goldScoreElement.parentElement.style.display = 'none';
		this.platinumScoreElement.parentElement.style.display = 'none';

		if (isFinite(game.mission.goldScore)) {
			if (game.mission.modification === 'gold') {
				this.goldScoreElement.textContent = game.mission.goldScore.toString();
				this.goldScoreElement.parentElement.style.display = '';
			} else {
				this.platinumScoreElement.textContent = game.mission.goldScore.toString();
				this.platinumScoreElement.parentElement.style.display = '';
			}
		}

		this.ultimateScoreElement.parentElement.style.display = 'none';

		if (isFinite(game.mission.ultimateScore)) {
			this.ultimateScoreElement.textContent = game.mission.ultimateScore.toString();
			this.ultimateScoreElement.parentElement.style.display = '';
		}
	}

	createBestTimeElement() {
		let div = document.createElement('div');
		return div;
	}

	updateBestTimeElement(element: HTMLDivElement, score: BestTimes[number], rank: number) {
		let goldTime = G.game.mission.goldTime;
		let ultimateTime = G.game.mission.ultimateTime;

		let tmp = document.createElement('div');
		tmp.textContent = Util.secondsToTimeString(score[1] / 1000);
		Util.monospaceNumbers(tmp);
		element.innerHTML = `<div><span>${rank}. </span>${Util.htmlEscape(score[0])}</div><div>${tmp.innerHTML}</div>`;

		element.style.color = '';
		if (score[1] <= goldTime) element.style.color = (G.game.mission.modification === 'gold')? MBP_GOLD_COLOR : MBP_PLATINUM_COLOR;
		if (score[1] <= ultimateTime) element.style.color = MBP_ULTIMATE_COLOR;
	}

	updateScoreboard() {
		this.scoreboardContainer.innerHTML = '';

		let sortedPlayers = G.game.players.slice().sort((a, b) => {
			let huntPoints = G.game.finishState.huntPoints;
			return huntPoints.get(b.controlledMarble).total - huntPoints.get(a.controlledMarble).total;
		});

		for (let player of sortedPlayers) {
			let div = document.createElement('div');
			let points = G.game.finishState.huntPoints.get(player.controlledMarble);
			let rank = Util.count([...G.game.finishState.huntPoints], x => x[1].total > points.total) + 1;
			let session = G.lobby.sockets.find(x => x.id === player.sessionId); // todo not clean

			let rankColor = '#dfdfdf';
			if (rank === 1) rankColor = 'rgb(238, 200, 132)';
			else if (rank === 2) rankColor = 'rgb(205, 205, 205)';
			else if (rank === 3) rankColor = 'rgb(201, 175, 160)';

			div.innerHTML = `
				<div>
					<span style="color: ${rankColor};">${rank}. </span>
					${Util.htmlEscape(session.name)}
				</div>
				<div>
					<span>
						<span style="color: ${RED_GEM_TEXT_COLOR};">${points.reds}</span>
						<span style="color: ${YELLOW_GEM_TEXT_COLOR};">${points.yellows}</span>
						<span style="color: ${BLUE_GEM_TEXT_COLOR};">${points.blues}</span>
					</span>
					${points.total}
				</div>
			`;

			this.scoreboardContainer.appendChild(div);
		}
	}

	generateNameEntryText(place: number) {
		return `You have the ${['top', 'second top', 'third top', 'fourth top', 'fifth top'][place]} time!`;
	}

	/** Figures out what the next level after this one should be. */
	getNextLevel() {
		let levelSelect = G.menu.levelSelect;
		let currIndex = levelSelect.currentMissionArray.indexOf(G.game.mission); // Get it like this because the index might have already changed

		if (currIndex < levelSelect.currentMissionArray.length-1) {
			// Just the next level in the current array
			return {
				index: currIndex + 1,
				array: levelSelect.currentMissionArray
			};
		} else {
			if (levelSelect.currentMission.type === 'custom') {
				return {
					// We stay at the last custom level
					index: currIndex,
					array: levelSelect.currentMissionArray
				};
			} else {
				// Move on to the next mission array
				let order = MissionLibrary.allMissionArrays; // TODO THIS WITH HUNT AND SHIT, BAD
				let next = order[order.indexOf(levelSelect.currentMissionArray) + 1];

				return {
					index: 0,
					array: next
				};
			}
		}
	}
}