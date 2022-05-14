declare namespace pako {
	const deflate: (str: string) => Uint8Array;
	const inflate: (src: Uint8Array, options?: { to: string }) => string;
}