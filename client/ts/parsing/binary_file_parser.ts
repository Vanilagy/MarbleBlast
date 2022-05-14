export interface Point2F {
	x: number,
	y: number
}

export interface Point3F {
	x: number,
	y: number,
	z: number
}

export interface Box3F {
	min: Point3F,
	max: Point3F
}

export interface SphereF {
	center: Point3F,
	radius: number
}

export interface PlaneF {
	x: number,
	y: number,
	z: number,
	d: number
}

/** An abstract class with common methods used to parse binary files. */
export abstract class BinaryFileParser {
	/** The buffer holding the data. */
	buffer: ArrayBuffer;
	/** The view into the buffer. */
	view: DataView;
	/** The current index of reading. */
	index = 0;

	constructor(arrayBuffer: ArrayBuffer) {
		this.buffer = arrayBuffer;
		this.view = new DataView(arrayBuffer);
	}

	abstract parse(): object;

	readU8() {
		return this.view.getUint8(this.index++);
	}

	readU16() {
		return this.view.getUint16((this.index = this.index + 2) - 2, true);
	}

	readU32() {
		return this.view.getUint32((this.index = this.index + 4) - 4, true);
	}

	readS8() {
		return this.view.getInt8(this.index++);
	}

	readS16() {
		return this.view.getInt16((this.index = this.index + 2) - 2, true);
	}

	readS32() {
		return this.view.getInt32((this.index = this.index + 4) - 4, true);
	}

	readF32() {
		return this.view.getFloat32((this.index = this.index + 4) - 4, true);
	}

	readBool() {
		return this.readU8() === 1;
	}

	readPoint3F(): Point3F {
		let x = this.readF32(),
			y = this.readF32(),
			z = this.readF32();

		return { x, y, z };
	}

	readBox3F(): Box3F {
		let min = this.readPoint3F(),
			max = this.readPoint3F();

		return { min, max };
	}

	readSphereF(): SphereF {
		let center = this.readPoint3F(),
			radius = this.readF32();

		return { center, radius };
	}

	readPlaneF(): PlaneF {
		let x = this.readF32(),
			y = this.readF32(),
			z = this.readF32(),
			d = this.readF32();

		return { x, y, z, d };
	}

	readString() {
		// The length of the string is given in the first byte
		let length = this.readU8();
		let result = "";

		for (let i = 0; i < length; i++) {
			result += String.fromCharCode(this.readU8());
		}

		while (result.charCodeAt(result.length - 1) === 0) result = result.slice(0, -1); // Trim off NUL bytes from the end (thank you, HiGuy)

		return result;
	}
}