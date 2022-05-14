import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";
import { Vector4 } from "../math/vector4";
import { Util } from "../util";

/** Compiles additional utilities for reading out values from .mis files. */
export abstract class MisUtils {
	/** Parses a 3-component vector from a string of three numbers. */
	static parseVector3(string: string) {
		if (!string) return new Vector3();
		let parts = string.split(' ').map((part) => Number(part));
		if (parts.length < 3) return new Vector3();
		if (parts.find(x => !isFinite(x)) !== undefined) return new Vector3();

		return new Vector3(parts[0], parts[1], parts[2]);
	}

	/** Parses a 4-component vector from a string of four numbers. */
	static parseVector4(string: string) {
		if (!string) return new Vector4();
		let parts = string.split(' ').map((part) => Number(part));
		if (parts.length < 4) return new Vector4();
		if (parts.find(x => !isFinite(x)) !== undefined) return new Vector4();

		return new Vector4(parts[0], parts[1], parts[2], parts[3]);
	}

	/** Returns a quaternion based on a rotation specified from 4 numbers. */
	static parseRotation(string: string) {
		if (!string) return new Quaternion();
		let parts = string.split(' ').map((part) => Number(part));
		if (parts.length < 4) return new Quaternion();
		if (parts.find(x => !isFinite(x)) !== undefined) return new Quaternion();

		let quaternion = new Quaternion();
		// The first 3 values represent the axis to rotate on, the last represents the negative angle in degrees.
		quaternion.setFromAxisAngle(new Vector3(parts[0], parts[1], parts[2]), -Util.degToRad(parts[3]));

		return quaternion;
	}

	/** Parses a list of space-separated numbers. */
	static parseNumberList(string: string) {
		let parts = string.split(' ');
		let result: number[] = [];

		for (let part of parts) {
			let number = Number(part);

			if (!isNaN(number)) {
				// The number parsed without issues; simply add it to the array.
				result.push(number);
			} else {
				// Since we got NaN, we assume the number did not parse correctly and we have a case where the space between multiple numbers are missing. So "0.0000000 1.0000000" turning into "0.00000001.0000000".
				const assumedDecimalPlaces = 7; // Reasonable assumption

				// Scan the part to try to find all numbers contained in it
				while (part.length > 0) {
					let dotIndex = part.indexOf('.');
					if (dotIndex === -1) break;

					let section = part.slice(0, Math.min(dotIndex + assumedDecimalPlaces + 1, part.length));
					result.push(Number(section));
					part = part.slice(dotIndex + assumedDecimalPlaces + 1);
				}
			}
		}

		return result;
	}
}