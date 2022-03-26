export abstract class Util {
	static findLast<T>(arr: T[], predicate: (elem: T) => boolean) {
		for (let i = arr.length-1; i >= 0; i--) {
			let item = arr[i];
			if (predicate(item)) return item;
		}
	}
}