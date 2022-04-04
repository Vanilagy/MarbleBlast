export const nullable = Symbol('nullable');
export const union = Symbol('nullable');

type Writeable<T> =
	T extends readonly [...unknown[]] ? { -readonly [P in keyof T]: Writeable<T[P]> } :
	T extends readonly (infer R)[] ? R[] :
	{ -readonly [P in keyof T]: Writeable<T[P]> };

type PrimitiveTypeMap = {
	'boolean': boolean,
	'u8': number,
	's8': number,
	'u16': number,
	's16': number,
	'u32': number,
	's32': number,
	'f32': number,
	'f64': number,
	'varint': number,
	'string': string
};

type SerializationFormat<T> =
	T extends keyof PrimitiveTypeMap ? T :
	T extends readonly [typeof nullable, infer R] ? (R extends SerializationFormat<R> ? T : never) :
	T extends readonly [typeof union, infer D, ...infer V] ?
		(D extends keyof V[number] ?
			CheckUnionType<Omit<V[number], D>, T> :
			never) :
	T extends readonly [...unknown[]] ? (T extends readonly [SerializationFormat<T[0]>] ? T : never) :
	T extends { [key: string]: any } ? (T extends { [K in keyof T]: SerializationFormat<T[K]> } ? T : never) :
	never;

type CheckUnionType<U, T> = U extends { [K in keyof U]: SerializationFormat<U[K]> } ? T : never;

type FormatToTypeInternal<T> =
	T extends keyof PrimitiveTypeMap ? PrimitiveTypeMap[T] :
	T extends [typeof nullable, infer R] ? FormatToTypeInternal<R> :
	T extends [typeof union, infer D, ...infer R] ?
		(D extends keyof R[number] ? MapUnionType<R[number], D> : never) :
	T extends { [key: string]: SerializationFormat<unknown> } ? { [P in keyof T]: FormatToTypeInternal<T[P]> } :
	T extends [infer R] ? (R extends SerializationFormat<unknown> ? FormatToTypeInternal<R>[] : never) :
	never;

type MapUnionType<U, K extends keyof U> = U extends any ? (FormatToTypeInternal<Omit<U, K>> & { [L in K]: U[L] }) : never;

export type FormatToType<T> = FormatToTypeInternal<Writeable<T>>;

export abstract class FixedFormatBinarySerializer {
	static buffer: ArrayBuffer;
	static view: DataView;
	static bytes: Uint8Array;
	static stringBuffer = new Uint8Array(2**16);

	static index = 0;
	static decodeByteLength: number;

	static init() {
		this.buffer = new ArrayBuffer(2**24); // Allocate a buffer large enough so we never need to enlarge
		this.view = new DataView(this.buffer);
		this.bytes = new Uint8Array(this.buffer);
	}

	static format<T>(x: SerializationFormat<T>): T {
		return x;
	}

	static encode<T>(data: FormatToType<T>, format: SerializationFormat<T>) {
		this.index = 0;

		this.write(data, format);

		return this.buffer.slice(0, this.index);
	}

	static write(data: any, format: any, discriminator?: string) {
		if (typeof format === 'string') {
			this.writePrimitive(data, format as keyof PrimitiveTypeMap);
		} else if (format[0] === nullable) {
			this.view.setUint8(this.index++, Number(data !== null));
			if (data !== null) this.write(data, format[1]);
		} else if (format[0] === union) {
			let discriminator = format[1] as string;
			let index: number;

			for (let i = 2; i < format.length; i++) {
				if (format[i][discriminator] === data[discriminator]) {
					index = i - 2;
					break;
				}
			}

			this.writePrimitive(index, 'varint');
			this.write(data, format[index + 2], discriminator);
		} else if (Array.isArray(format)) {
			this.writePrimitive(data.length, 'varint');
			for (let elem of data) this.write(elem, format[0]);
		} else if (typeof format === 'object') {
			for (let key in format) {
				if (key === discriminator) continue;
				this.write(data[key], format[key]);
			}
		} else {
			throw new Error("Incorrect format!");
		}
	}

	static writePrimitive(data: any, format: keyof PrimitiveTypeMap) {
		let byteLength: number;

		switch (format) {
			case 'boolean':
				this.view.setUint8(this.index++, Number(data));
				break;
			case 'u8':
				this.view.setUint8(this.index++, data);
				break;
			case 's8':
				this.view.setInt8(this.index++, data);
				break;
			case 'u16':
				this.view.setUint16((this.index += 2) - 2, data, true);
				break;
			case 's16':
				this.view.setInt16((this.index += 2) - 2, data, true);
				break;
			case 'u32':
				this.view.setUint32((this.index += 4) - 4, data, true);
				break;
			case 's32':
				this.view.setInt32((this.index += 4) - 4, data, true);
				break;
			case 'f32':
				this.view.setFloat32((this.index += 4) - 4, data, true);
				break;
			case 'f64':
				this.view.setFloat64((this.index += 8) - 8, data, true);
				break;
			case 'varint':
				if (!Number.isInteger(data)) throw new Error("Varint passed incorrect data: " + data);

				data = (Math.abs(data) << 1) | Number(data < 0);

				do {
					let value = data & 127;
					if (data >= 128) value |= 128;
					data >>= 7;
					this.view.setUint8(this.index++, value);
				} while (data > 0);

				break;
			case 'string':
				byteLength = this.stringToUtf8Bytes(data, this.stringBuffer, 0);
				this.writePrimitive(byteLength, 'varint');
				this.bytes.set(this.stringBuffer.subarray(0, byteLength), this.index);
				this.index += byteLength;
				break;
			default:
				throw new Error("Incorrect format: " + format);
		}
	}

	static decode<T>(buffer: ArrayBuffer, format: SerializationFormat<T>): FormatToType<T> {
		this.index = 0;
		this.decodeByteLength = buffer.byteLength;
		this.bytes.set(new Uint8Array(buffer));

		return this.read(format);
	}

	static read(format: any, discriminator?: string): any {
		if (typeof format === 'string') {
			return this.readPrimitive(format as keyof PrimitiveTypeMap);
		} else if (format[0] === nullable) {
			let isNull = !this.view.getUint8(this.index++);

			if (isNull) return null;
			else return this.read(format[1]);
		} else if (format[0] === union) {
			let index = this.readPrimitive('varint') as number;
			let discriminator = format[1] as string;

			let obj = {
				[discriminator]: format[index + 2][discriminator],
				...this.read(format[index + 2], discriminator)
			};

			return obj;
		} else if (Array.isArray(format)) {
			let arrayLength = this.read('varint');
			let arr: any[] = [];

			for (let i = 0; i < arrayLength; i++) {
				if (this.index >= this.decodeByteLength) throw new Error("Out of bounds!"); // Gotta do this check so the decoder can't get cheesed by artifically manipulated data where the index is like a huge number
				arr.push(this.read(format[0]));
			}

			return arr;
		} else if (typeof format === 'object') {
			let obj: any = {};

			for (let key in format) {
				if (key === discriminator) continue;
				obj[key] = this.read(format[key]);
			}

			return obj as any;
		}
	}

	static readPrimitive(format: keyof PrimitiveTypeMap) {
		let res: number;
		let byteLength: number;

		switch (format) {
			case 'boolean':
				return !!this.view.getUint8(this.index++);
			case 'u8':
				return this.view.getUint8(this.index++);
			case 's8':
				return this.view.getInt8(this.index++);
			case 'u16':
				return this.view.getUint16((this.index += 2) - 2, true);
			case 's16':
				return this.view.getInt16((this.index += 2) - 2, true);
			case 'u32':
				return this.view.getUint32((this.index += 4) - 4, true);
			case 's32':
				return this.view.getInt32((this.index += 4) - 4, true);
			case 'f32':
				return this.view.getFloat32((this.index += 4) - 4, true);
			case 'f64':
				return this.view.getFloat64((this.index += 8) - 8, true);
			case 'varint':
				res = 0;

				for (let i = 0; true; i++) {
					let nextByte = this.view.getUint8(this.index++);
					res += (nextByte & 127) << (7 * i);
					if (!(nextByte & 128)) break;
				}

				res = (res >> 1) * (1 - 2 * (res & 1));
				return res;
			case 'string':
				byteLength = this.readPrimitive('varint') as number;
				return this.utf8BytesToString(this.bytes, this.index, this.index += byteLength);
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
				((c & 0xFC00) === 0xD800) && (i + 1) < str.length &&
				((str.charCodeAt(i + 1) & 0xFC00) === 0xDC00)) {
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

	static encodeDecode<T>(data: FormatToType<T>, format: SerializationFormat<T>) {
		return this.decode(this.encode(data, format), format);
	}
}
FixedFormatBinarySerializer.init();