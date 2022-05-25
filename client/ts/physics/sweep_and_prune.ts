import { Util } from "../util";
import { BroadphaseObject } from "./world";

interface ObjectProxy {
	objectIndex: number,
	object: BroadphaseObject,
	min: boolean,
	value: number,
	intersections: BroadphaseObject[],
	index: number
}

export class SweepAndPruneBroadphase {
	lists: ObjectProxy[][] = [[], [], []];
	objectToProxies = new WeakMap<BroadphaseObject, ObjectProxy[]>();
	objectCount = 0;
	flags = new Uint8Array(0);
	anyFlagSet = false;
	needsSort = false;
	sortStarts = [Infinity, Infinity, Infinity];
	sortEnds = [-Infinity, -Infinity, -Infinity];

	insert(object: BroadphaseObject) {
		this.objectCount++;

		let box = object.boundingBox;
		let intersections: BroadphaseObject[] = [];
		let proxies: ObjectProxy[] = [];
		let objectIndex = this.objectCount - 1;

		for (let i = 0; i < 2; i++) {
			for (let dim = 0; dim < 3; dim++) {
				let min = i === 0;
				let proxy: ObjectProxy = {
					objectIndex: objectIndex,
					object: object,
					min: min,
					value: (min ? box.min : box.max).getComponent(dim),
					intersections: intersections,
					index: -1
				};

				proxies.push(proxy);
			}
		}
		this.objectToProxies.set(object, proxies);

		for (let i = 0; i < proxies.length; i++) {
			let proxy = proxies[i];
			let list = this.lists[i % 3];

			list.push(proxy);
			proxy.index = list.length - 1;
		}

		let oldFlags = this.flags;
		let n = this.objectCount - 1;
		this.flags = new Uint8Array((n*n + n) / 2);

		if (this.anyFlagSet) for (let o1 = 0; o1 < this.objectCount - 1; o1++) {
			for (let o2 = o1+1; o2 < this.objectCount - 2; o2++) {
				// https://stackoverflow.com/questions/27086195/linear-index-upper-triangular-matrix
				let oldN = n - 1;
				let oldIndex = (oldN*(oldN-1)/2) - (oldN-o2)*((oldN-o2)-1)/2 + o1 - o2 - 1;
				let newIndex = (n*(n-1)/2) - (n-o2)*((n-o2)-1)/2 + o1 - o2 - 1;

				this.flags[newIndex] = oldFlags[oldIndex];
			}
		}

		this.needsSort = true;
		this.sortStarts = [0, 0, 0];
		this.sortEnds = [this.lists[0].length - 1, this.lists[0].length - 1, this.lists[0].length - 1];
	}

	sort(dimension: number) {
		let list = this.lists[dimension];
		let start = this.sortStarts[dimension];
		let end = this.sortEnds[dimension];

		for (let i = start + 1; i <= end; i++) {
			let j = i;

			while (j > start && list[j-1].value > list[j].value) {
				let temp = list[j-1];
				list[j-1] = list[j];
				list[j] = temp;

				let a = list[j-1];
				let b = list[j];

				a.index = j-1;
				b.index = j;

				j--;

				let toggle = a.object !== b.object && a.min !== b.min;
				if (!toggle) continue;

				let o1 = a.objectIndex;
				let o2 = b.objectIndex;
				let n = this.objectCount;
				if (o2 > o1) {
					let temp = o1;
					o1 = o2;
					o2 = temp;
				}

				let flagIndex = (n*(n-1)/2) - (n-o2)*((n-o2)-1)/2 + o1 - o2 - 1;
				let flags = this.flags[flagIndex];

				if (flags & (1 << dimension)) {
					let needsDelete = flags === 7;
					flags &= ~(1 << dimension);
					this.flags[flagIndex] = flags;

					if (needsDelete) {
						Util.removeFromArray(a.intersections, b.object);
						Util.removeFromArray(b.intersections, a.object);
					}
				} else {
					flags |= 1 << dimension;
					this.flags[flagIndex] = flags;

					if (flags === 7) {
						a.intersections.push(b.object);
						b.intersections.push(a.object);
					}
				}

				this.anyFlagSet = true;
			}
		}

		this.sortStarts[dimension] = Infinity;
		this.sortEnds[dimension] = -Infinity;
	}

	update(object: BroadphaseObject) {
		let proxies = this.objectToProxies.get(object);
		if (!proxies) {
			this.insert(object);
			return;
		}

		for (let dim = 0; dim < 3; dim++) {
			let minProxy = proxies[dim + 0];
			let maxProxy = proxies[dim + 3];
			minProxy.value = object.boundingBox.min.getComponent(dim);
			maxProxy.value = object.boundingBox.max.getComponent(dim);

			let start = Math.min(this.sortStarts[dim], minProxy.index);
			let end = Math.max(this.sortEnds[dim], maxProxy.index);

			let list = this.lists[dim];
			while (start > 0 && list[start - 1].value > minProxy.value) start--;
			while (end < list.length - 2 && list[end + 1].value < maxProxy.value) end++;

			this.sortStarts[dim] = start;
			this.sortEnds[dim] = end;
		}

		this.needsSort = true;
	}

	getIntersections(object: BroadphaseObject) {
		if (this.needsSort) {
			for (let i = 0; i < 3; i++)
				this.sort(i);

			this.needsSort = false;
		}

		return this.objectToProxies.get(object)[0].intersections;
	}
}