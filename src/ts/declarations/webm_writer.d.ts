declare class WebMWriter {
	constructor(options: {
		fileWriter: FileSystemWritableFileStream,
		codec: string,
		width: number,
		height: number
	});

	addFrame(chunk: EncodedVideoChunk): void;
	complete(): Promise<void>;
}