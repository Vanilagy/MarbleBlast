import OIMO from "./declarations/oimo";
import * as THREE from "three";

export interface RGBAColor {
	r: number,
	g: number,
	b: number,
	a: number
}

export type MaterialGeometry = {
	vertices: number[],
	normals: number[],
	uvs: number[],
	indices: number[]
}[];

export abstract class Util {
	static keyboardMap: Map<string, string>;

	static async init() {
		this.keyboardMap = await (navigator as any).keyboard?.getLayoutMap();
	}

	static degToRad(deg: number) {
		return deg / 180 * Math.PI;
	}

	static randomFromArray<T>(arr: T[]) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	static modifyImageWithCanvas(image: HTMLImageElement | HTMLCanvasElement, rotate: number, flip = false) {
		let canvas = document.createElement('canvas');
		canvas.setAttribute('width', image.width.toString());
		canvas.setAttribute('height', image.height.toString());

		let ctx = canvas.getContext('2d');

		ctx.translate(image.width / 2, image.height / 2);
		if (flip) ctx.scale(1, -1);
		ctx.rotate(rotate);
		ctx.translate(-image.width / 2, -image.height / 2);
		ctx.drawImage(image, 0, 0, image.width, image.height);

		return canvas;
	}

	static removeAlphaChannel(image: HTMLImageElement) {
		let canvas = document.createElement('canvas');
		canvas.setAttribute('width', image.width.toString());
		canvas.setAttribute('height', image.height.toString());

		let ctx = canvas.getContext('2d');
		ctx.drawImage(image, 0, 0);

		let imageData = ctx.getImageData(0, 0, image.width, image.height);
		for (let i = 0; i < imageData.data.length; i += 4) {
			imageData.data[i + 3] = 255;
		}
		ctx.putImageData(imageData, 0, 0);

		return canvas;
	}

	static clamp(value: number, min: number, max: number) {
		if (value < min) return min;
		if (value > max) return max;
		return value;
	}

	static lerp(a: number, b: number, t: number) {
		return (1 - t) * a + t * b;
	}
	
	static avg(a: number, b: number) {
		return (a + b) / 2;
	}

	static vecOimoToThree(oimoVec: OIMO.Vec3) {
		return new THREE.Vector3(oimoVec.x, oimoVec.y, oimoVec.z);
	}
	
	static vecThreeToOimo(threeVec: THREE.Vector3) {
		return new OIMO.Vec3(threeVec.x, threeVec.y, threeVec.z);
	}

	static isSameVector(v1: {x: number, y: number, z: number}, v2: {x: number, y: number, z: number}) {
		return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z;
	}

	static addToVectorCapped(target: OIMO.Vec3, add: OIMO.Vec3, magnitudeCap: number) {
		let direction = add.clone().normalize();
		let dot = Math.max(0, target.dot(direction));

		if (dot + add.length() > magnitudeCap) {
			let newLength = Math.max(0, magnitudeCap - dot);
			add = add.normalize().scale(newLength);
		}

		return target.add(add);
	}

	static leftPadZeroes(str: string, amount: number) {
		return "000000000000000000".slice(0, Math.max(0, amount - str.length)) + str;
	}

	static forceLayout(element: Element) {
		element.clientWidth;
	}

	static getKeyForButtonCode(code: string) {
		outer:
		if (this.keyboardMap) {
			let value = this.keyboardMap.get(code);
			if (!value) break outer;

			// Use the value from the keyboard map. This maps things like KeyZ to Y for German keyboards, for example.
			return (value.toUpperCase().length > 1)? value : value.toUpperCase(); // This special handling here is for characters that turn into more than one letter when capitalized (like ß).
		}

		if (code.startsWith("Key")) return code.slice(3);
		if (code.startsWith("Digit")) return code.slice(5);
		if (code.startsWith('Arrow')) return code.slice(5);
		if (code === "Space") return "Space Bar";
		if (code === "LMB") return "the Left Mouse Button";
		if (code === "MMB") return "the Middle Mouse Button";
		if (code === "RMB") return "the Right Mouse Button";
		return code;
	}

	static setsHaveOverlap<T>(a: Set<T>, b: Set<T>) {
		for (let val of a) {
			if (b.has(val)) return true;
		}
		return false;
	}

	static catmullRom(t: number, p0: number, p1: number, p2: number, p3: number) {
		let point = t*t*t*((-1) * p0 + 3 * p1 - 3 * p2 + p3) / 2;
		point += t*t*(2*p0 - 5 * p1+ 4 * p2 - p3) / 2;
		point += t*((-1) * p0 + p2) / 2;
		point += p1;

		return point;
	}

	static jsonClone<T>(obj: T) {
		return JSON.parse(JSON.stringify(obj));
	}

	static lerpColors(c1: RGBAColor, c2: RGBAColor, t: number) {
		return {
			r: Util.lerp(c1.r, c2.r, t),
			g: Util.lerp(c1.g, c2.g, t),
			b: Util.lerp(c1.b, c2.b, t),
			a: Util.lerp(c1.a, c2.a, t)
		} as RGBAColor;
	}

	static randomPointInUnitCircle() {
		let r = Math.sqrt(Math.random());
		let theta = Math.random() * Math.PI * 2;
		
		return new THREE.Vector2(r * Math.cos(theta), r * Math.sin(theta));
	}

	static removeFromArray<T>(arr: T[], item: T) {
		let index = arr.indexOf(item);
		if (index !== -1) arr.splice(index, 1);
	}

	/** Shamelessly copied from Torque's source code. */
	static m_matF_x_vectorF(matrix: THREE.Matrix4, v: THREE.Vector3) {
		let m = matrix.transpose().elements;

		let v0 = v.x, v1 = v.y, v2 = v.z;
		let m0 = m[0], m1 = m[1], m2 = m[2];
		let m4 = m[4], m5 = m[5], m6 = m[6];
		let m8 = m[8], m9 = m[9], m10 = m[10];

		matrix.transpose();
		
		let vresult_0 = m0*v0 + m1*v1 + m2*v2;
		let vresult_1 = m4*v0 + m5*v1 + m6*v2;
		let vresult_2 = m8*v0 + m9*v1 + m10*v2;

		v.set(vresult_0, vresult_1, vresult_2);
	}

	static createCylinderConvexHull(radius: number, halfHeight: number, radialSegments = 32) {
		let vertices: OIMO.Vec3[] = [];

		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < radialSegments; j++) {
				let angle = j/radialSegments * Math.PI * 2;
				let x = Math.cos(angle);
				let z = Math.sin(angle);

				vertices.push(new OIMO.Vec3(x * radius, i? halfHeight : -halfHeight, z * radius));
			}
		}

		return new OIMO.ConvexHullGeometry(vertices);
	}

	static lerpOimoVectors(v1: OIMO.Vec3, v2: OIMO.Vec3, t: number) {
		return new OIMO.Vec3(Util.lerp(v1.x, v2.x, t), Util.lerp(v1.y, v2.y, t), Util.lerp(v1.z, v2.z, t));
	}

	static lerpThreeVectors(v1: THREE.Vector3, v2: THREE.Vector3, t: number) {
		return new THREE.Vector3(Util.lerp(v1.x, v2.x, t), Util.lerp(v1.y, v2.y, t), Util.lerp(v1.z, v2.z, t));
	}

	static uppercaseFirstLetter(str: string) {
		return str[0].toUpperCase() + str.slice(1);
	}

	static wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	static adjustedMod(a: number, n: number) {
		return ((a % n) + n) % n;
	}

	static concatArrays<T>(arrays: T[][]) {
		return arrays.reduce((prev, next) => (prev.push(...next), prev), []);
	}

	static createGeometryFromMaterialGeometry(materialGeometry: MaterialGeometry) {
		let geometry = new THREE.BufferGeometry();

		geometry.setAttribute('position', new THREE.Float32BufferAttribute(Util.concatArrays(materialGeometry.map((x) => x.vertices)), 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Util.concatArrays(materialGeometry.map((x) => x.normals)), 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Util.concatArrays(materialGeometry.map((x) => x.uvs)), 2));

		let current = 0;
		for (let i = 0; i < materialGeometry.length; i++) {
			if (materialGeometry[i].vertices.length === 0) continue;

			geometry.addGroup(current, materialGeometry[i].vertices.length / 3, i);
			current += materialGeometry[i].vertices.length / 3;
		}

		return geometry;
	}

	static mergeMaterialGeometries(materialGeometries: MaterialGeometry[]) {
		let merged = materialGeometries[0].map(() => {
			return {
				vertices: [] as number[],
				normals: [] as number[],
				uvs: [] as number[],
				indices: [] as number[]
			};
		});

		for (let matGeom of materialGeometries) {
			for (let i = 0; i < matGeom.length; i++) {
				merged[i].vertices.push(...matGeom[i].vertices);
				merged[i].normals.push(...matGeom[i].normals);
				merged[i].uvs.push(...matGeom[i].uvs);
				merged[i].indices.push(...matGeom[i].indices);
			}
		}

		return merged;
	}
}

export abstract class Scheduler {
	scheduled: {
		time: number,
		callback: () => any
	}[] = [];

	tickSchedule(time: number) {
		for (let item of this.scheduled.slice()) {
			if (time >= item.time) {
				Util.removeFromArray(this.scheduled, item);
				item.callback();
			}
		}
	}

	schedule(time: number, callback: () => any) {
		this.scheduled.push({ time, callback });
	}

	clearSchedule() {
		this.scheduled.length = 0;
	}
}