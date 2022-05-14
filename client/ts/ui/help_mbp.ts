import { ResourceManager } from "../resources";
import { HelpScreen } from "./help";

/** The page files to load and show, ordered. */
const PAGES = ['webport', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];
const FORMAT_COMMAND_REGEX = /<.+?>/g; // Literally the cheapest thing ever
const ANCHOR_REGEX = /&lt;a:(.+?)&gt;(.+?)&lt;\/a&gt;/g; // Looks a bit shitty 'cuz of escaped HTML stuff

export class MbpHelpScreen extends HelpScreen {
	pagePicker = document.querySelector('#mbp-help-picker');
	pageElements: HTMLDivElement[] = [];

	initProperties() {
		this.div = document.querySelector('#mbp-help');
		this.homeButton = document.querySelector('#mbp-help-home');
		this.homeButtonSrc = 'manual/home';
	}

	/** Fetches all the pages for this help page. */
	async init() {
		let promises: Promise<Blob>[] = [];

		for (let page of PAGES) {
			let path = `./assets/ui_mbp/manual/pages/${page}.txt`;
			promises.push(ResourceManager.loadResource(path));
		}

		let blobs = await Promise.all(promises);
		let texts = await Promise.all(blobs.map(x => ResourceManager.readBlobAsText(x)));

		// For each text, create the necessary elements
		for (let text of texts) {
			let heading = text.slice(0, text.indexOf('\n')); // The title of each page is its first line
			let selector = document.createElement('div');
			selector.textContent = heading;
			selector.addEventListener('mousedown', () => this.selectPage(texts.indexOf(text)));
			this.pagePicker.appendChild(selector);

			let pageElement = document.createElement('div');
			pageElement.classList.add('_page', 'hidden');
			pageElement.innerHTML = this.generatePageHtml(text);

			this.pageElements.push(pageElement);
			this.div.appendChild(pageElement);
		}

		this.selectPage(0);
	}

	selectPage(index: number) {
		for (let child of this.pagePicker.children) child.classList.remove('selected');
		this.pagePicker.children[index].classList.add('selected');

		for (let page of this.pageElements) page.classList.add('hidden');
		this.pageElements[index].classList.remove('hidden');
		this.pageElements[index].scrollTop = 0;
	}

	/** Turns a subset of TorqueML into HTML. */
	generatePageHtml(text: string) {
		let currentStyle = ''; // The current style used for inserted text
		let styleStack: string[] = []; // Stores previous styles so they can be reverted to
		let html = '';

		let heading = text.slice(0, text.indexOf('\n'));
		let headingElement = document.createElement('h1');
		headingElement.textContent = heading;
		html += headingElement.outerHTML;
		text = text.slice(text.indexOf('\n') + 1);

		while (true) {
			FORMAT_COMMAND_REGEX.lastIndex = 0;
			let nextCommand: RegExpExecArray;
			while (nextCommand = FORMAT_COMMAND_REGEX.exec(text)) {
				// Check if the command is a supported one
				if (nextCommand[0].startsWith('<just') || nextCommand[0].startsWith('<font') || nextCommand[0] === '<spush>' || nextCommand[0] === '<spop>')
					break;
			}
			let div = document.createElement('div');
			if (currentStyle) div.setAttribute('style', currentStyle);

			if (!nextCommand) {
				// There is no more command found, so dump the remaining text
				div.textContent = text;
				if (div.innerHTML) html += div.outerHTML;
				break;
			}

			div.textContent = text.slice(0, nextCommand.index);
			if (div.innerHTML) html += div.outerHTML;

			// Update the text style based on the command
			if (nextCommand[0].startsWith('<just')) {
				// Add text align to the style
				currentStyle += 'text-align: ' + nextCommand[0].slice(6, -1) + ';';
			} else if (nextCommand[0].startsWith('<font')) {
				// Add a font family change to the style
				let font = nextCommand[0].slice(6, nextCommand[0].lastIndexOf(':'));
				let size = nextCommand[0].slice(nextCommand[0].lastIndexOf(':') + 1, -1);
				currentStyle += `font-family: ${font};font-size: ${size}px;`;
			} else if (nextCommand[0] === '<spush>') {
				// Push the current style to the stack
				styleStack.push(currentStyle);
			} else if (nextCommand[0] === '<spop>') {
				// Pop the last style from the stack into the current style
				currentStyle = styleStack.pop();
			}

			text = text.slice(nextCommand.index + nextCommand[0].length);
		}

		// Make links clickable
		html = html.replace(ANCHOR_REGEX, '<a href="http://$1" target="_blank">$2</a>');

		return html;
	}
}