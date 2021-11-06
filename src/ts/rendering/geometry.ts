export class Geometry {
	positions: number[] = [];
	normals: number[] = [];
	uvs: number[] = [];
	materials: number[] = [];
	indices: number[] = []; // Doesn't have to be filled, but is needed for some Shape stuff

	fillRest() {
		while (this.normals.length/3 < this.positions.length/3) this.normals.push(0, 0, 0);
		while (this.uvs.length/2 < this.positions.length/3) this.uvs.push(0, 0);
	}
}