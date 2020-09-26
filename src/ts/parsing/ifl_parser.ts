import { ResourceManager } from "../resources";

export type IflFile = string[]; // lol

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
			let repetitions = parts[1]? Number(parts[1]) : 1;

			for (let i = 0; i < repetitions; i++) {
				keyframes.push(parts[0]);
			}
		}

		return keyframes;
	}

	static cachedFiles = new Map<string, IflFile>();
	
	static async loadFile(path: string) {
		if (this.cachedFiles.get(path)) return this.cachedFiles.get(path);

		let blob = await ResourceManager.loadResource(path);
		let arrayBuffer = await blob.text();
		let parser = new IflParser(arrayBuffer);
		
		let result = parser.parse();
		this.cachedFiles.set(path, result);

		return result;
	}
}