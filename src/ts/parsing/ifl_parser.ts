export class IflParser {
	text: string;

	constructor(text: string) {
		this.text = text;
	}

	parse() {
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

	static async loadFile(path: string) {
		let response = await fetch(path);
		let text = await response.text();
		let parser = new IflParser(text);

		return parser.parse();
	}
}