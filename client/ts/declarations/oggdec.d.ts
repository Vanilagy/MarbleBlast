declare function OggdecModule(): {
	decodeOggData(buffer: ArrayBuffer): Promise<AudioBuffer>
};