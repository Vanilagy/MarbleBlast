enum Type {
	False = 0,
	True = 1,
	Zero = 2,
	One = 3,
	F32 = 4,
	F64 = 5,
	P8 = 6,
	N8 = 7,
	P16 = 8,
	N16 = 9,
	P32 = 10,
	N32 = 11,
	String8 = 12,
	String16 = 13,
	String32 = 14,
	Undefined = 15,
	Null = 16,
	KeyDictionary = 17,
	Array8 = 18,
	Array16 = 19,
	Array32 = 20,
	Object = 21,
	Reference8 = 22,
	Reference16 = 23,
	Reference32 = 24
}

/** Provides methods to convert JavaScript data into a compact binary format and back. */
export abstract class BinarySerializer {
	static encodeBuffer: ArrayBuffer;
	static encodeView: DataView;
	static encodeBytes: Uint8Array;

	static decodeView: DataView;
	static decodeBytes: Uint8Array;

	static index = 0;

	// These two following variables are used for data reuse. Especially useful for strings.
	static dataIndices = new Map<any, number>();
	static indexData = new Map<number, any>();

	static init() {
		this.encodeBuffer = new ArrayBuffer(2**24); // Allocate a buffer large enough so we never need to enlarge
		this.encodeView = new DataView(this.encodeBuffer);
		this.encodeBytes = new Uint8Array(this.encodeBuffer);
	}

	/** Encodes the given data into an ArrayBuffer. */
	static encode(x: any) {
		this.index = 0;
		this.dataIndices.clear();

		this.write(x);

		return this.encodeBuffer.slice(0, this.index);
	}

	static write(x: any) {
		let type = typeof x;

		if (type === 'boolean') {
			this.writeType(x? Type.True : Type.False);
		} else if (type === 'number') {
			this.writeNumber(x);
		} else if (type === 'string') {
			this.writeString(x);
		} else if (type === 'undefined') {
			this.writeType(Type.Undefined);
		} else if (type === 'object') {
			if (x === null) return this.writeType(Type.Null);

			if (Array.isArray(x)) {
				this.writeArray(x);
			} else {
				this.writeObject(x);
			}
		} else {
			throw new Error(`Cannot encode data of type ${typeof x}.`);
		}
	}

	static writeType(type: Type) {
		this.encodeView.setUint8(this.index++, type);
	}

	static writeNumber(x: number) {
		if (x === 0) return this.writeType(Type.Zero);
		if (x === 1) return this.writeType(Type.One);

		let isInteger = Number.isInteger(x);

		if (isInteger) {
			let abs = Math.abs(x);
			let positive = x > 0;

			if (abs < (1 << 8)) {
				this.writeType(positive? Type.P8 : Type.N8);
				this.encodeView.setUint8(this.index++, abs);
			} else if (abs < (1 << 16)) {
				this.writeType(positive? Type.P16 : Type.N16);
				this.encodeView.setUint16(this.index, abs, true);
				this.index += 2;
			} else if (abs < (1 << 32)) {
				this.writeType(positive? Type.P32 : Type.N32);
				this.encodeView.setUint32(this.index, abs, true);
				this.index += 4;
			} else {
				this.writeFloat(x);
			}
		} else {
			this.writeFloat(x);
		}
	}

	static writeFloat(x: number) {
		if (x === Math.fround(x) || isNaN(x)) {
			this.writeType(Type.F32);
			this.encodeView.setFloat32(this.index, x, true);
			this.index += 4;
		} else {
			this.writeType(Type.F64);
			this.encodeView.setFloat64(this.index, x, true);
			this.index += 8;
		}
	}

	static writeString(x: string, allowReferences = true) {
		if (allowReferences) {
			let index = this.dataIndices.get(x);
			if (index !== undefined) return this.writeReference(index);
			this.dataIndices.set(x, this.index);
		}

		let byteLength = this.stringToUtf8Bytes(x, this.encodeBytes, this.index + 2);

		if (byteLength < (1 << 8)) {
			this.writeType(Type.String8);
			this.encodeView.setUint8(this.index++, byteLength);
		} else if (byteLength < (1 << 16)) {
			this.encodeBytes.set(this.encodeBytes.subarray(this.index + 2, this.index + 2 + byteLength), this.index + 3);
			this.writeType(Type.String16);
			this.encodeView.setUint16((this.index += 2) - 2, byteLength, true);
		} else {
			this.encodeBytes.set(this.encodeBytes.subarray(this.index + 2, this.index + 2 + byteLength), this.index + 4);
			this.writeType(Type.String32);
			this.encodeView.setUint32((this.index += 4) - 4, byteLength, true);
		}

		this.index += byteLength;
	}

	static writeReference(toIndex: number) {
		if (toIndex < (1 << 8)) {
			this.writeType(Type.Reference8);
			this.encodeView.setUint8(this.index++, toIndex);
		} else if (toIndex < (1 << 16)) {
			this.writeType(Type.Reference16);
			this.encodeView.setUint16((this.index += 2) - 2, toIndex, true);
		} else {
			this.writeType(Type.Reference32);
			this.encodeView.setUint16((this.index += 4) - 4, toIndex, true);
		}
	}

	static writeArray(x: any[]) {
		if (x.length < (1 << 8)) {
			this.writeType(Type.Array8);
			this.encodeView.setUint8(this.index++, x.length);
		} else if (x.length < (1 << 16)) {
			this.writeType(Type.Array16);
			this.encodeView.setUint16((this.index += 2) - 2, x.length, true);
		} else {
			this.writeType(Type.Array32);
			this.encodeView.setUint32((this.index += 4) - 4, x.length, true);
		}

		for (let i = 0; i < x.length; i++) {
			this.write(x[i]);
		}
	}

	static writeObject(x: Record<string, any>) {
		this.writeType(Type.Object);

		let keys = Object.keys(x);
		this.encodeView.setUint8(this.index++, keys.length);

		for (let key of keys) {
			this.writeString(key);
			this.write(x[key]);
		}
	}

	/** Converts a string into UTF-8 bytes. Done manually because it's significantly faster than TextEncoder. */
	static stringToUtf8Bytes(str: string, out: Uint8Array, offset: number) {
		let p = offset;
		for (let i = 0; i < str.length; i++) {
			let c = str.charCodeAt(i);
			if (c < 128) {
				out[p++] = c;
			} else if (c < 2048) {
				out[p++] = (c >> 6) | 192;
				out[p++] = (c & 63) | 128;
			} else if (
				((c & 0xFC00) == 0xD800) && (i + 1) < str.length &&
				((str.charCodeAt(i + 1) & 0xFC00) == 0xDC00)) {
				// Surrogate Pair
				c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
				out[p++] = (c >> 18) | 240;
				out[p++] = ((c >> 12) & 63) | 128;
				out[p++] = ((c >> 6) & 63) | 128;
				out[p++] = (c & 63) | 128;
			} else {
				out[p++] = (c >> 12) | 224;
				out[p++] = ((c >> 6) & 63) | 128;
				out[p++] = (c & 63) | 128;
			}
		}
		return p - offset;
	}

	/** Decodes the data given in the ArrayBuffer back into its original form. */
	static decode(x: ArrayBuffer) {
		this.index = 0;
		this.indexData.clear();
		this.decodeView = new DataView(x);
		this.decodeBytes = new Uint8Array(x);

		return this.read();
	}

	static read() {
		let type: Type = this.decodeView.getUint8(this.index++);

		if (type === Type.False) return false;
		if (type === Type.True) return true;
		if (type >= Type.Zero && type <= Type.N32) return this.readNumber(type);
		if (type >= Type.String8 && type <= Type.String32) return this.readString(type);
		if (type >= Type.Reference8 && type <= Type.Reference32) return this.readReference(type);
		if (type === Type.Undefined) return undefined;
		if (type === Type.Null) return null;
		if (type >= Type.Array8 && type <= Type.Array32) return this.readArray(type);
		if (type === Type.Object) return this.readObject();

		throw new Error(`Incorrect type ${type} at index ${this.index}.`);
	}

	static readNumber(type: Type) {
		if (type === Type.Zero) return  0;
		if (type === Type.One)  return  1;

		if (type === Type.F32)  return  this.decodeView.getFloat32((this.index += 4) - 4, true);
		if (type === Type.F64)  return  this.decodeView.getFloat64((this.index += 8) - 8, true);

		if (type === Type.P8)   return  this.decodeView.getUint8(this.index++);
		if (type === Type.N8)   return -this.decodeView.getUint8(this.index++);

		if (type === Type.P16)  return  this.decodeView.getUint16((this.index += 2) - 2, true);
		if (type === Type.N16)  return -this.decodeView.getUint16((this.index += 2) - 2, true);

		if (type === Type.P32)  return  this.decodeView.getUint32((this.index += 4) - 4, true);
		else                    return -this.decodeView.getUint32((this.index += 4) - 4, true);
	}

	static readString(type: Type, allowReferences = true) {
		let length: number;
		let startingIndex = this.index - 1;

		if (type === Type.String8) {
			length = this.decodeView.getUint8(this.index++);
		} else if (type === Type.String16) {
			length = this.decodeView.getUint16((this.index += 2) - 2, true);
		} else {
			length = this.decodeView.getUint32((this.index += 4) - 4, true);
		}

		let string = this.utf8BytesToString(this.decodeBytes, this.index, this.index += length);
		if (allowReferences) this.indexData.set(startingIndex, string);

		return string;
	}

	static readReference(type: Type) {
		if (type === Type.Reference8) {
			return this.indexData.get(this.decodeView.getUint8(this.index++));
		} else if (type === Type.Reference16) {
			return this.indexData.get(this.decodeView.getUint16((this.index += 2) - 2, true));
		} else {
			return this.indexData.get(this.decodeView.getUint32((this.index += 4) - 4, true));
		}
	}

	static readArray(type: Type) {
		let length: number;

		if (type === Type.Array8) {
			length = this.decodeView.getUint8(this.index++);
		} else if (type === Type.Array16) {
			length = this.decodeView.getUint16((this.index += 2) - 2, true);
		} else {
			length = this.decodeView.getUint32((this.index += 4) - 4, true);
		}

		let arr: any[] = [];

		for (let i = 0; i < length; i++) {
			arr.push(this.read());
		}

		return arr;
	}

	static readObject() {
		let keyCount = this.decodeView.getUint8(this.index++);
		let obj: Record<string, any> = {};

		for (let i = 0; i < keyCount; i++) {
			let key = this.read() as string;
			obj[key] = this.read();
		}

		return obj;
	}

	/** Converts a UTF-8 bytes back into a string. Done manually because it's significantly faster than TextDecoder. */
	static utf8BytesToString(bytes: Uint8Array, start: number, end: number) {
		let out = '', pos = start;
		while (pos < end) {
			let c1 = bytes[pos++];
			if (c1 < 128) {
				out += String.fromCharCode(c1);
			} else if (c1 > 191 && c1 < 224) {
				let c2 = bytes[pos++];
				out += String.fromCharCode((c1 & 31) << 6 | c2 & 63);
			} else if (c1 > 239 && c1 < 365) {
				// Surrogate Pair
				let c2 = bytes[pos++];
				let c3 = bytes[pos++];
				let c4 = bytes[pos++];
				let u = ((c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 0x10000;
				out += String.fromCharCode(0xD800 + (u >> 10));
				out += String.fromCharCode(0xDC00 + (u & 1023));
			} else {
				let c2 = bytes[pos++];
				let c3 = bytes[pos++];
				out += String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
			}
		}
		return out;
	}

	/** Encodes and immediately decodes the data. Can be used to clone objects or, realistically, to debug this class. */
	static encodeDecode(x: any) {
		let encoded = this.encode(x);
		return this.decode(encoded);
	}
}
BinarySerializer.init();