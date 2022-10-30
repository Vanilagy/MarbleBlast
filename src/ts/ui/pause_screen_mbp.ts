import { state } from "../state";
import { Util } from "../util";
import { Menu } from "./menu";
import { PauseScreen } from "./pause_screen";

export class MbpPauseScreen extends PauseScreen {
	jukeboxButton = document.querySelector('#mbp-pause-jukebox') as HTMLImageElement;
	jukebox: Jukebox;

	initProperties() {
		this.div = document.querySelector('#mbp-pause-screen');
		this.yesButton = document.querySelector('#mbp-pause-yes');
		this.noButton = document.querySelector('#mbp-pause-no');
		this.restartButton = document.querySelector('#mbp-pause-restart');
		this.replayButton = document.querySelector('#mbp-pause-replay');

		this.yesSrc = 'exit/yes';
		this.noSrc = 'exit/no';
		this.restartSrc = 'exit/restart';
	}

	constructor(menu: Menu) {
		super(menu);

		menu.setupButton(this.replayButton, 'play/replay', (e) => this.onReplayButtonClick(e.altKey));
		Util.onLongTouch(this.replayButton, () => this.onReplayButtonClick(true));

		this.jukebox = new Jukebox(menu);
		menu.setupButton(this.jukeboxButton, 'jukebox/jb_pausemenu', () => {
			this.jukebox.show();
		}, undefined, undefined, false);
	}
}

const SONGS = {
	'astrolabe.ogg': 'Astrolabe',
	'beach party.ogg': 'Beach Party',
	'challenge.ogg': 'Challenge',
	'classic vibe.ogg': 'Classic Vibe',
	'comforting mystery.ogg': 'Comforting Mystery',
	'endurance.ogg': 'Endurance',
	'flanked.ogg': 'Flanked',
	'groove police.ogg': 'Groove Police',
	'grudge.ogg': 'Grudge',
	'mbp old shell.ogg': 'MBP Old Shell',
	'metropolis.ogg': 'Metropolis',
	'pianoforte.ogg': 'Pianoforte',
	'quiet lab.ogg': 'Quiet Lab',
	'rising temper.ogg': 'Rising Temper',
	'seaside revisited.ogg': 'Seaside Revisited',
	'shell.ogg': 'Shell',
	'the race.ogg': 'The Race',
	'tim trance.ogg': 'Tim Trance',
	'xmas trance.ogg': 'Xmas Trance'
};

class Jukebox {
	menu: Menu;
	div = document.querySelector('#jukebox') as HTMLDivElement;
	songsContainer = document.querySelector('#jukebox-songs') as HTMLDivElement;
	textElement = document.querySelector('#jukebox-text') as HTMLParagraphElement;
	closeButton = document.querySelector('#jukebox-close') as HTMLImageElement;
	prevButton = document.querySelector('#jukebox-prev') as HTMLImageElement;
	playButton = document.querySelector('#jukebox-play') as HTMLImageElement;
	nextButton = document.querySelector('#jukebox-next') as HTMLImageElement;
	selectedIndex: number = null;
	_playing = true;

	get playing() {
		return this._playing;
	}
	set playing(state: boolean) {
		this._playing = state;
		this.menu.setButtonVariant(this.playButton, 1 - Number(state)); // Automagically✨ update the button too
	}

	constructor(menu: Menu) {
		this.menu = menu;
		menu.setupButton(this.closeButton, 'jukebox/close', () => this.hide());
		menu.setupButton(this.prevButton, 'play/prev', () => this.select(Object.keys(SONGS)[this.selectedIndex - 1]), true);
		menu.setupVaryingButton(this.playButton, ['jukebox/stop', 'jukebox/play'], () => {
			if (this.playing) { state.level.music?.stop(); this.playing = false; }
			else {
				if (this.selectedIndex !== null) this.select(Object.keys(SONGS)[this.selectedIndex]);
				else {
					// Restart the default song
					state.level.music?.play();
					this.playing = true;
				}
			}

			this.updateText();
		});
		menu.setupButton(this.nextButton, 'play/next', () => this.select(Object.keys(SONGS)[this.selectedIndex + 1]), true);

		window.addEventListener('keydown', (e) => {
			if (!this.div.classList.contains('hidden') && e.key === 'Escape') {
				this.closeButton.src = menu.uiAssetPath + 'jukebox/close_d.png';
			}
		});

		window.addEventListener('keyup', (e) => {
			if (!this.div.classList.contains('hidden') && e.key === 'Escape') {
				this.closeButton.src = menu.uiAssetPath + 'jukebox/close_n.png';
				this.hide();
			}
		});

		// Create all the elements for the songs
		for (let key in SONGS) {
			let element = document.createElement('div');
			element.textContent = SONGS[key as keyof typeof SONGS];
			this.songsContainer.appendChild(element);

			element.addEventListener('mousedown', () => this.select(key));
		}
	}

	/** Selects a given song and plays it. */
	select(song: string) {
		if (!SONGS[song as keyof typeof SONGS]) return;

		let index = Object.keys(SONGS).indexOf(song);
		this.selectedIndex = index;
		for (let i = 0; i < this.songsContainer.children.length; i++) {
			this.songsContainer.children[i].classList.remove('selected');
			if (i === index) this.songsContainer.children[i].classList.add('selected');
		}

		let level = state.level;

		if (level.music) level.music.stop();
		level.music = level.audio.createAudioSource('music/' + song, level.audio.musicGain, undefined, true);
		level.music.setLoop(true);
		level.music.play();

		this.playing = true;
		this.updateNextPrevButtons();
		this.updateText();
	}

	updateNextPrevButtons() {
		// Enable or disable the next button based on if there are still songs to come
		if (this.selectedIndex === null || this.selectedIndex === Object.keys(SONGS).length - 1) {
			this.nextButton.src = this.menu.uiAssetPath + 'play/next_i.png';
			this.nextButton.style.pointerEvents = 'none';
		} else {
			if (this.nextButton.src.endsWith('i.png')) this.nextButton.src = this.menu.uiAssetPath + 'play/next_n.png';
			this.nextButton.style.pointerEvents = '';
		}

		// Enable or disable the prev button based on if there are still songs to come
		if (this.selectedIndex === null || this.selectedIndex === 0) {
			this.prevButton.src = this.menu.uiAssetPath + 'play/prev_i.png';
			this.prevButton.style.pointerEvents = 'none';
		} else {
			if (this.prevButton.src.endsWith('i.png')) this.prevButton.src = this.menu.uiAssetPath + 'play/prev_n.png';
			this.prevButton.style.pointerEvents = '';
		}
	}

	updateText() {
		if (this.selectedIndex === null) this.textElement.innerHTML = '';
		else this.textElement.innerHTML = `Title: ${SONGS[Object.keys(SONGS)[this.selectedIndex] as keyof typeof SONGS]}<br>${this.playing? 'Playing' : 'Stopped'}`;
	}

	show() {
		this.div.classList.remove('hidden');
		state.menu.pauseScreen.preventClose = true;

		if (this.selectedIndex === null) {
			// This runs if this was the first time in the current level that the jukebox was opened.

			for (let child of this.songsContainer.children) child.classList.remove('selected');

			let index = Object.keys(SONGS).indexOf(state.level.originalMusicName);
			if (index >= 0) {
				this.songsContainer.children[index].classList.add('selected');
				this.selectedIndex = index;
			} else {
				// The song that's playing is not part of the ones in the jukebox
			}

			this.playing = true;
			this.updateNextPrevButtons();
			this.updateText();
		}

		// Scroll the current song into view
		let selectedElem = [...this.songsContainer.children].find(x => x.classList.contains('selected'));
		if (selectedElem) selectedElem.scrollIntoView({ block: "nearest", inline: "nearest" });
	}

	hide() {
		this.div.classList.add('hidden');
		state.menu.pauseScreen.preventClose = false;
	}

	reset() {
		this.selectedIndex = null;
	}
}