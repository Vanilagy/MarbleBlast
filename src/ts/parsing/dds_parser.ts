/**
 * Provides utility functions for parsing DirectDraw Surface (DDS) textures.
 */
export abstract class DdsParser {
	static async toImage(buffer: ArrayBuffer) {
		let data = new DataView(buffer);

		// Check the DDS magic number
		if (data.getUint32(0, true) !== 0x20534444) {
			throw new Error('Not a valid DDS file');
		}

		// Check for DXT1 fourCC
		let fourCC = String.fromCharCode(
			data.getUint8(84),
			data.getUint8(85),
			data.getUint8(86),
			data.getUint8(87)
		);
		if (fourCC !== 'DXT1') {
			throw new Error('Only DXT1 format is supported');
		}

		let height = data.getUint32(12, true);
		let width = data.getUint32(16, true);

		// RGBA buffer for putImageData
		let rgbaData = new Uint8ClampedArray(width * height * 4);
		let offset = 128;

		for (let y = 0; y < height; y += 4) {
			for (let x = 0; x < width; x += 4) {
				let color0 = data.getUint16(offset, true);
				let color1 = data.getUint16(offset + 2, true);

				let r0 = (color0 & 0xF800) >> 8;
				let g0 = (color0 & 0x07E0) >> 3;
				let b0 = (color0 & 0x001F) << 3;

				let r1 = (color1 & 0xF800) >> 8;
				let g1 = (color1 & 0x07E0) >> 3;
				let b1 = (color1 & 0x001F) << 3;

				let lookupTable = data.getUint32(offset + 4, true);
				for (let blockY = 0; blockY < 4; blockY++) {
					for (let blockX = 0; blockX < 4; blockX++) {
						let pixelIndex = ((y + blockY) * width + (x + blockX)) * 4;
						let index = (lookupTable >> (2 * (blockY * 4 + blockX))) & 0x03;

						if (color0 > color1) {
							switch (index) {
								case 0:
									rgbaData.set([r0, g0, b0, 255], pixelIndex);
									break;
								case 1:
									rgbaData.set([r1, g1, b1, 255], pixelIndex);
									break;
								case 2:
									rgbaData.set([(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255], pixelIndex);
									break;
								case 3:
									rgbaData.set([(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255], pixelIndex);
									break;
							}
						} else {
							switch (index) {
								case 0:
									rgbaData.set([r0, g0, b0, 255], pixelIndex);
									break;
								case 1:
									rgbaData.set([r1, g1, b1, 255], pixelIndex);
									break;
								case 2:
									rgbaData.set([(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255], pixelIndex);
									break;
								case 3:
									rgbaData.set([0, 0, 0, 0], pixelIndex); // Transparent
									break;
							}
						}
					}
				}
				offset += 8;
			}
		}

		let canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		let ctx = canvas.getContext('2d');

		let imageData = new ImageData(rgbaData, width, height);
		ctx.putImageData(imageData, 0, 0);

		let canvasDataUrl = canvas.toDataURL();
		let newImage = new Image();
		newImage.src = canvasDataUrl;

		await new Promise(resolve => newImage.onload = resolve);

		return newImage;
	}
}