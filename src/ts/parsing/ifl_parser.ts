import { ResourceManager } from "../resources";

/** The file simply is an array of material names, each index corresponding to one keyframe of the animation. */
export type IflFile = string[]; // lol

/** A parser for .ifl files, used to describe an animated sequence of materials. */
export class IflParser {
	text: string;

	constructor(text: string) {
		this.text = text;
	}

	parse(): IflFile {
		let lines = this.text.split('\n');
		let keyframes: string[] = [];

		for (let line of lines) {
			line = line.trim();
			if (line.startsWith('//')) continue;
			if (!line) continue;

			let parts = line.split(' ');
			let count = parts[1]? Number(parts[1]) : 1; // If no count is listed, is appears for exactly one keyframe.

			for (let i = 0; i < count; i++) {
				keyframes.push(parts[0]);
			}
		}

		return keyframes;
	}

	static cachedFiles = new Map<string, IflFile>();

	/** Loads and parses an .ifl file. Returns a cached version if already loaded. */
	static async loadFile(path: string) {
		if (this.cachedFiles.get(path)) return this.cachedFiles.get(path);

		let blob = await ResourceManager.loadResource(path);
		let text = await ResourceManager.readBlobAsText(blob, 'ISO-8859-1');
		let parser = new IflParser(text);

		let result = parser.parse();
		this.cachedFiles.set(path, result);

		return result;
	}
}