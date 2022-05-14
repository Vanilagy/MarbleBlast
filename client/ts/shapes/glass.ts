import { Shape } from "../shape";

export class Glass extends Shape {
	constructor(dataBlock: string) {
		super();

		let dim = /glass_(\d+)shape/.exec(dataBlock)[1];
		this.dtsPath = `shapes/glass/${dim}x3.dts`;
		this.colliderDtsPath = `shapes/glass/col/${dim}x3.dts`;
	}
}