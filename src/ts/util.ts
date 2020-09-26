import OIMO from "./declarations/oimo";
import * as THREE from "three";

export enum EaseType {
	Linear,
	EaseInQuad,
	EaseOutQuad,
	EaseInOutQuad,
	EaseInCubic,
	EaseOutCubic,
	EaseInOutCubic,
	EaseInQuart,
	EaseOutQuart,
	EaseInOutQuart,
	EaseInQuint,
	EaseOutQuint,
	EaseInOutQuint,
	EaseInElastic,
	EaseOutElastic,
	EaseInSine,
	EaseOutSine,
	EaseInOutSine,
	EaseInExpo,
	EaseOutExpo,
	EaseInOutExpo,
	EaseInCirc,
	EaseOutCirc,
	EaseInOutCirc,
	EaseInBack,
	EaseOutBack,
	EaseInOutBack,
	EaseInElasticAlternative,
	EaseOutElasticAlternative,
	EaseOutElasticHalf,
	EaseOutElasticQuarter,
	EaseInOutElasticAlternative,
	EaseInBounce,
	EaseOutBounce,
	EaseInOutBounce
}

// Some constants for easing:
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;
const elasticConst = 2 * Math.PI / 0.3;
const elasticConst2 = 0.3 / 4;
const elasticOffsetHalf = Math.pow(2, -10) * Math.sin((.5 - elasticConst2) * elasticConst);
const elasticOffsetQuarter = Math.pow(2, -10) * Math.sin((.25 - elasticConst2) * elasticConst);

export abstract class Util {
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

	/** @param x Should be in the range [0, 1].
	 *  @param p Some shit used for elastic bounce */
	static ease(x: number, type: EaseType, p = 0.3): number {
		switch (type) {
			case EaseType.Linear:
				return x;
			case EaseType.EaseInQuad:
				return x * x;
			case EaseType.EaseOutQuad:
				return x * (2 - x);
			case EaseType.EaseInOutQuad:
				return x < 0.5 ? 2 * x * x : -1 + (4 - 2 * x) * x;
			case EaseType.EaseInCubic:
				return x * x * x;
			case EaseType.EaseOutCubic:
				return (--x) * x * x + 1;
			case EaseType.EaseInOutCubic:
				return x < 0.5 ? 4 * x * x * x : (x - 1) * (2 * x - 2) * (2 * x - 2) + 1;
			case EaseType.EaseInQuart:
				return x * x * x * x;
			case EaseType.EaseOutQuart:
				return 1-(--x) * x * x * x;
			case EaseType.EaseInOutQuart:
				return x < 0.5 ? 8 * x * x * x * x : 1 - 8 * (--x) * x * x * x;
			case EaseType.EaseInQuint:
				return x * x * x * x * x;
			case EaseType.EaseOutQuint:
				return 1+(--x) * x * x * x * x;
			case EaseType.EaseInOutQuint:
				return x < 0.5 ? 16 * x * x * x * x * x : 1 + 16*(--x) * x * x * x * x;
			case EaseType.EaseInElastic:
				return 1 - Util.ease(EaseType.EaseOutElastic, 1 - x, p);
			case EaseType.EaseOutElastic:
				return Math.pow(2,-10*x) * Math.sin((x-p/4)*(2*Math.PI)/p) + 1;
			case EaseType.EaseInSine:
				return -1 * Math.cos(x * (Math.PI / 2)) + 1;
			case EaseType.EaseOutSine:
				return Math.sin(x * (Math.PI / 2));
			case EaseType.EaseInOutSine:
				return Math.cos(Math.PI * x) * -0.5 + 0.5;
			case EaseType.EaseInExpo:
				return x === 0 ? 0 : Math.pow(2, 10 * (x - 1));
			case EaseType.EaseOutExpo:
				return x === 1 ? 1 : (-Math.pow(2, -10 * x) + 1);
			case EaseType.EaseInOutExpo:
				if (x === 0 || x === 1) return x;

				const scaledTime = x * 2;
				const scaledTime1 = scaledTime - 1;

				if (scaledTime < 1) {
					return 0.5 * Math.pow(2, 10 * (scaledTime1));
				}

				return 0.5 * (-Math.pow(2, -10 * scaledTime1) + 2);
			case EaseType.EaseInCirc:
				return 1 - Math.sqrt(1 - Math.pow(x, 2));
			case EaseType.EaseOutCirc:
				return Math.sqrt(1 - Math.pow(x - 1, 2));
			case EaseType.EaseInOutCirc:
				return x < 0.5
					? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
					: (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2;
			case EaseType.EaseInBack:
				return c3 * x * x * x - c1 * x * x;
			case EaseType.EaseOutBack:
				return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
			case EaseType.EaseInOutBack:
				return x < 0.5
					? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
					: (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
			case EaseType.EaseInElasticAlternative:
				return x === 0
					? 0
					: x === 1
					? 1
					: -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4);
			case EaseType.EaseOutElasticAlternative:
				return x === 0
					? 0
					: x === 1
					? 1
					: Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
			case EaseType.EaseInOutElasticAlternative:
				return x === 0
					? 0
					: x === 1
					? 1
					: x < 0.5
					? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
					: (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1;
			case EaseType.EaseOutElasticHalf:
				return Math.pow(2, -10 * x) * Math.sin((.5 * x - elasticConst2) * elasticConst) + 1 - elasticOffsetHalf * x;
			case EaseType.EaseOutElasticQuarter:
				return Math.pow(2, -10 * x) * Math.sin((.25 * x - elasticConst2) * elasticConst) + 1 - elasticOffsetQuarter * x;
			case EaseType.EaseInBounce:
				return 1 - Util.ease(EaseType.EaseOutBounce, 1 - x);
			case EaseType.EaseOutBounce:
				const n1 = 7.5625;
				const d1 = 2.75;

				if (x < 1 / d1) {
					return n1 * x * x;
				} else if (x < 2 / d1) {
					return n1 * (x -= 1.5 / d1) * x + 0.75;
				} else if (x < 2.5 / d1) {
					return n1 * (x -= 2.25 / d1) * x + 0.9375;
				} else {
					return n1 * (x -= 2.625 / d1) * x + 0.984375;
				}
			case EaseType.EaseInOutBounce:
				return x < 0.5
					? (1 - Util.ease(EaseType.EaseOutBounce, 1 - 2 * x)) / 2
					: (1 + Util.ease(EaseType.EaseOutBounce, 2 * x - 1)) / 2;
			default:
				return x;
		}
	}

	static leftPadZeroes(str: string, amount: number) {
		return "000000000000000000".slice(0, Math.max(0, amount - str.length)) + str;
	}

	static forceLayout(element: Element) {
		element.clientWidth;
	}

	static async getKeyForButtonCode(code: string): Promise<string> {
		let keyboard = (navigator as any).keyboard;

		outer:
		if (keyboard.getLayoutMap) {
			let map = await keyboard.getLayoutMap();
			let value = map.get(code);
			if (!value) break outer;

			// Use the value from the keyboard map. This maps things like KeyZ to Y for German keyboards, for example.
			return (value.toUpperCase().length > 1)? value : value.toUpperCase(); // This special handling here is for characters that turn into more than one letter when capitalized (like ß).
		}

		if (code.startsWith("Key")) return code.slice(3);
		if (code.startsWith("Digit")) return code.slice(5);
		if (code.startsWith('Arrow')) return code.slice(5);
		if (code === "Space") return "Space Bar";
		return code;
	}
}