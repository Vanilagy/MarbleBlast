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

	static areEqualDeep(o1: any, o2: any) {
		if (o1 === o2) return true;
		if (typeof o1 !== 'object' || typeof o2 !== 'object') return o1 === o2;
		if (Array.isArray(o1) !== Array.isArray(o2)) return false;
		if (Array.isArray(o1)) {
			if (o1.length !== o2.length) return false;
			for (let i = 0; i < o1.length; i++) if (!this.areEqualDeep(o1[i], o2[i])) return false;
		} else {
			for (let key in o2) if (!(key in o1)) return false;
			for (let key in o1) {
				if (!this.areEqualDeep(o1[key], o2[key])) return false;
			}
		}
		return true;
	}

	static percentile(arr: number[], p: number) {
		let sorted = arr.slice().sort((a, b) => a - b);
		return sorted[Math.floor(p * (arr.length - 1))];
	}
}