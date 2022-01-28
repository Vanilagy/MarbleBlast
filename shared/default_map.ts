/** Works exactly like the regular Map, except that getting a non-stored key sets that key to a default value and returns that value instead. */
export class DefaultMap<T, U> {
	private map = new Map<T, U>();
	private createDefault: () => U;

	constructor(createDefault: () => U) {
		this.createDefault = createDefault;
	}

	get size() {
		return this.map.size;
	}

	clear() {
		this.map.clear();
	}

	delete(key: T) {
		this.map.delete(key);
	}

	get(key: T) {
		return this.map.get(key) ?? (this.map.set(key, this.createDefault()), this.map.get(key));
	}

	has(key: T) {
		return this.map.has(key);
	}

	set(key: T, value: U) {
		this.map.set(key, value);
	}

	[Symbol.iterator]() {
		return this.map[Symbol.iterator]();
	}

	keys() {
		return this.map.keys();
	}

	values() {
		return this.map.values();
	}

	entries() {
		return this.map.entries();
	}
}