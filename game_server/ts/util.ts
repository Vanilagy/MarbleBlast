export abstract class Util {
	static last<T>(arr: T[]) {
		return arr[arr.length - 1];
	}

	static findLast<T>(arr: T[], predicate: (elem: T) => boolean) {
		for (let i = arr.length-1; i >= 0; i--) {
			let item = arr[i];
			if (predicate(item)) return item;
		}
		return undefined;
	}

	static findLastIndex<T>(arr: T[], predicate: (elem: T) => boolean) {
		for (let i = arr.length-1; i >= 0; i--) {
			let item = arr[i];
			if (predicate(item)) return i;
		}
		return -1;
	}

	static filterInPlace<T>(arr: T[], pred: (elem: T) => boolean) {
		for (let i = 0; i < arr.length; i++) {
			if (!pred(arr[i])) arr.splice(i--, 1);
		}

		return arr;
	}

	/** Removes an item from an array, or does nothing if it isn't contained in it. */
	static removeFromArray<T>(arr: T[], item: T) {
		let index = arr.indexOf(item);
		if (index !== -1) arr.splice(index, 1);
	}
}