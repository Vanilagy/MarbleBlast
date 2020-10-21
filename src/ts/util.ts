import OIMO from "./declarations/oimo";
import * as THREE from "three";

export interface RGBAColor {
	r: number,
	g: number,
	b: number,
	a: number
}

/** An array of objects, one object per material. Each object stores vertex, normal, uv and index data that will be put into a WebGL buffer. */
export type MaterialGeometry = {
	vertices: number[],
	normals: number[],
	uvs: number[],
	indices: number[]
}[];

export abstract class Util {
	static keyboardMap: Map<string, string>;

	static async init() {
		// Fetch the keyboard map for instant access later
		this.keyboardMap = await (navigator as any).keyboard?.getLayoutMap();
	}

	static degToRad(deg: number) {
		return deg / 180 * Math.PI;
	}

	static randomFromArray<T>(arr: T[]) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	/** Rotates and/or flips an image with a canvas and returns the canvas. */
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

	/** Removes the alpha channel from an image (sets all alpha values to 1) */
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

	/** Add a vector to another vector while making sure not to exceed a certain magnitude. */
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

	/** Forces an element's layout to be recalculated. */
	static forceLayout(element: Element) {
		element.clientWidth; // It's hacky, but simply accessing this forces it.
	}

	/** Get the value of a key for the corresponding button code. For example, KeyA -> A. Respects the user's keyboard layout. */
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

	/** Compute the value of a 1D Catmull-Rom spline. */
	static catmullRom(t: number, p0: number, p1: number, p2: number, p3: number) {
		let point = t*t*t*((-1) * p0 + 3 * p1 - 3 * p2 + p3) / 2;
		point += t*t*(2*p0 - 5 * p1+ 4 * p2 - p3) / 2;
		point += t*((-1) * p0 + p2) / 2;
		point += p1;

		return point;
	}

	/** Clones an object using JSON. */
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

	/** Returns a random point within the unit circle, distributed uniformly. */
	static randomPointInUnitCircle() {
		let r = Math.sqrt(Math.random());
		let theta = Math.random() * Math.PI * 2;
		
		return new THREE.Vector2(r * Math.cos(theta), r * Math.sin(theta));
	}

	/** Removes an item from an array, or does nothing if it isn't contained in it. */
	static removeFromArray<T>(arr: T[], item: T) {
		let index = arr.indexOf(item);
		if (index !== -1) arr.splice(index, 1);
	}

	/** Used to transform normal vectors. Shamelessly copied from Torque's source code. */
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

	/** Creates a cylinder-shaped convex hull geometry, aligned with the y-axis. */
	static createCylinderConvexHull(radius: number, halfHeight: number, radialSegments = 32, scale = new OIMO.Vec3(1, 1, 1)) {
		let vertices: OIMO.Vec3[] = [];

		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < radialSegments; j++) {
				let angle = j/radialSegments * Math.PI * 2;
				let x = Math.cos(angle);
				let z = Math.sin(angle);

				vertices.push(new OIMO.Vec3(x * radius * scale.x, (i? halfHeight : -halfHeight) * scale.y, z * radius * scale.z));
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

	/** Returns a promise that resolves after ms seconds. */
	static wait(ms: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	/** Modulo, but works as expected for negative numbers too. */
	static adjustedMod(a: number, n: number) {
		return ((a % n) + n) % n;
	}

	static concatArrays<T>(arrays: T[][]) {
		return arrays.reduce((prev, next) => (prev.push(...next), prev), []);
	}

	/** Creates a BufferGeometry from a MaterialGeometry by setting all the buffer attributes and group accordingly. */
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

	/** Merges multiple materialGeometries of the same material count into one. */
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

	static isInFullscreen() {
		return window.innerWidth === screen.width && window.innerHeight === screen.height;
	}

	static swapInArray<T>(arr: T[], i1: number, i2: number) {
		let temp = arr[i1];
		arr[i1] = arr[i2];
		arr[i2] = temp;
	}

	/** Makes the camera look at a point directly, meaning with the shortest rotation change possible and while ignoring the camera's up vector. */
	static cameraLookAtDirect(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
		let lookVector = new THREE.Vector3(0, 0, -1);
		lookVector.applyQuaternion(camera.quaternion);

		let quat = new THREE.Quaternion();
		quat.setFromUnitVectors(lookVector, target.clone().sub(camera.position).normalize());

		camera.quaternion.copy(quat.multiply(camera.quaternion));
	}

	static arrayBufferToString(buf: ArrayBuffer) {
		let str = "";
		let view = new Uint8Array(buf);

		for (let i = 0; i < buf.byteLength; i++) {
			str += String.fromCharCode(view[i]);
		}

		return str;
	}

	static stringToArrayBuffer(str: string) {
		let view = new Uint8Array(str.length);

		for (let i = 0; i < str.length; i++) {
			view[i] = str.charCodeAt(i);
		}

		return view.buffer;
	}

	static stringIsOnlyWhitespace(str: string) {
		return str.trim().length === 0;
	}

	/** Creates an axis-aligned bounding box around a point cloud. */
	static createAabbFromVectors(vecs: THREE.Vector3[]) {
		let min = new THREE.Vector3(Infinity, Infinity, Infinity);
		let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

		for (let vec of vecs) {
			min.set(Math.min(min.x, vec.x), Math.min(min.y, vec.y), Math.min(min.z, vec.z));
			max.set(Math.max(max.x, vec.x), Math.max(max.y, vec.y), Math.max(max.z, vec.z));
		}

		return { min, max };
	}

	/** Unescapes escaped (\) characters. */
	static unescape(str: string) {
		let regex = /\\([^\\])/g;
		let match: RegExpExecArray = null;
		let specialCases: Record<string, string> = {
			't': '\t',
			'v': '\v',
			'0': '\0',
			'f': '\f',
			'n': '\n',
			'r': '\r'
		};

		while ((match = regex.exec(str)) !== null) {
			let replaceWith: string;

			if (specialCases[match[1]]) replaceWith = specialCases[match[1]];
			else replaceWith = match[1];

			str = str.slice(0, match.index) + replaceWith + str.slice(match.index + match[0].length);
			regex.lastIndex--;
		}

		return str;
	}

	/** Creates a downsampled version of a cube texture. */
	static downsampleCubeTexture(renderer: THREE.WebGLRenderer, cubeTexture: THREE.CubeTexture) {
		let scene = new THREE.Scene();
		scene.background = cubeTexture;

		let target = new THREE.WebGLCubeRenderTarget(128);
		let camera = new THREE.CubeCamera(1, 100000, target);

		camera.update(renderer, scene);
	
		return camera.renderTarget.texture;
	}

	/** Splits a string like String.prototype.split, but ignores the splitter if it appears inside string literal tokens. */
	static splitIgnoreStringLiterals(str: string, splitter: string, strLiteralToken = '"') {
		let indices: number[] = [];

		let inString = false;
		for (let i = 0; i < str.length; i++) {
			let c = str[i];

			if (inString) {
				if (c === strLiteralToken && str[i-1] !== '\\') inString = false;
				continue;
			}

			if (c === strLiteralToken) inString = true;
			else if (c === splitter) indices.push(i);
		}

		let parts: string[] = [];
		let remaining = str;

		for (let i = 0; i < indices.length; i++) {
			let index = indices[i] - (str.length - remaining.length);
			let part = remaining.slice(0, index);
			remaining = remaining.slice(index + 1);
			parts.push(part);
		}
		parts.push(remaining);

		return parts;
	}

	/** Gets the index of a substring like String.prototype.indexOf, but only if that index lies outside of string literals. */
	static indexOfIgnoreStringLiterals(str: string, searchString: string, position = 0, strLiteralToken = '"') {
		let inString = false;
		for (let i = position; i < str.length; i++) {
			let c = str[i];

			if (inString) {
				if (c === strLiteralToken && str[i-1] !== '\\') inString = false;
				continue;
			}

			if (c === strLiteralToken) inString = true;
			else if (str.startsWith(searchString, i)) return i;
		}

		return -1;
	}

	/** Returns true iff the supplied index is part of a string literal. */
	static indexIsInStringLiteral(str: string, index: number, strLiteralToken = '"') {
		let inString = false;
		for (let i = 0; i < str.length; i++) {
			let c = str[i];

			if (inString) {
				if (i === index) return true;
				if (c === strLiteralToken && str[i-1] !== '\\') inString = false;
				continue;
			}

			if (c === strLiteralToken) inString = true;
		}

		return false;
	}

	/** Reorders an array with the given index map. */
	static remapIndices<T>(arr: T[], indices: number[]) {
		return indices.map(i => arr[i]);
	}

	/** Finds the last element in an array that fulfills a predicate. */
	static findLast<T>(arr: T[], predicate: (elem: T) => boolean) {
		let candidate: T = undefined;

		for (let item of arr) {
			if (predicate(item)) candidate = item;
		}

		return candidate;
	}

	/** Removes diacritics from a string. */
	static normalizeString(str: string) {
		// https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
		return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
	}

	/** Gets the last item in an array. */
	static last<T>(arr: T[]) {
		return arr[arr.length - 1];
	}
}

/** A scheduler can be used to schedule tasks in the future which will be executed when it's time. */
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