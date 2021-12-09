import THREE from "three";
import { Util } from "../util";

export class Geometry {
	readonly positions: number[] = [];
	readonly normals: number[] = [];
	readonly uvs: number[] = [];
	readonly materials: number[] = [];
	readonly indices: number[] = [];

	fillRest() {
		while (this.normals.length/3 < this.positions.length/3) this.normals.push(0, 0, 0);
		while (this.uvs.length/2 < this.positions.length/3) this.uvs.push(0, 0);
	}

	validate() {
		let verts = this.indices.length/3;

		if (new Set([this.positions.length/3, this.normals.length/3, this.uvs.length/2, this.materials.length/1]).size !== 1) {
			console.error(this);
			throw new Error(`Geometry is invalid (vertex counts don't match):
Positions: ${verts}
Normals: ${this.normals.length/3}
Uvs: ${this.uvs.length/2},
Material Indices: ${this.materials.length/1}
			`);
		}

		for (let i = 0; i < this.indices.length; i++) {
			let index = this.indices[i];
			if (index >= this.positions.length/3) {
				console.error(this);
				throw new Error("Geometry is invalid (index points out of bounds)");
			}
		}

		if (verts % 3)
			throw new Error("Geometry is invalid (triangle count isn't a whole number): " + verts/3);
	}

	// Largely taken from three.js source
	static createSphereGeometry(radius = 1, widthSegments = 32, heightSegments = 16, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) {
		let geometry = new Geometry();

		widthSegments = Math.max( 3, Math.floor( widthSegments ) );
		heightSegments = Math.max( 2, Math.floor( heightSegments ) );

		const thetaEnd = Math.min( thetaStart + thetaLength, Math.PI );

		let index = 0;
		const grid = [];

		const vertex = new THREE.Vector3();
		const normal = new THREE.Vector3();

		// buffers

		const vertices = [];
		const normals = [];
		const uvs = [];

		// generate vertices, normals and uvs

		for ( let iy = 0; iy <= heightSegments; iy ++ ) {

			const verticesRow = [];

			const v = iy / heightSegments;

			// special case for the poles

			let uOffset = 0;

			if ( iy == 0 && thetaStart == 0 ) {

				uOffset = 0.5 / widthSegments;

			} else if ( iy == heightSegments && thetaEnd == Math.PI ) {

				uOffset = - 0.5 / widthSegments;

			}

			for ( let ix = 0; ix <= widthSegments; ix ++ ) {

				const u = ix / widthSegments;

				// vertex

				vertex.x = - radius * Math.cos( phiStart + u * phiLength ) * Math.sin( thetaStart + v * thetaLength );
				vertex.y = radius * Math.cos( thetaStart + v * thetaLength );
				vertex.z = radius * Math.sin( phiStart + u * phiLength ) * Math.sin( thetaStart + v * thetaLength );

				vertices.push( vertex.x, vertex.y, vertex.z );

				// normal

				normal.copy( vertex ).normalize();
				normals.push( normal.x, normal.y, normal.z );

				// uv

				uvs.push( u + uOffset, 1 - v );

				verticesRow.push( index ++ );

			}

			grid.push( verticesRow );

		}

		Util.pushArray(geometry.positions, vertices);
		Util.pushArray(geometry.normals, normals);
		Util.pushArray(geometry.uvs, uvs);

		// indices

		for ( let iy = 0; iy < heightSegments; iy ++ ) {

			for ( let ix = 0; ix < widthSegments; ix ++ ) {

				const a = grid[ iy ][ ix + 1 ];
				const b = grid[ iy ][ ix ];
				const c = grid[ iy + 1 ][ ix ];
				const d = grid[ iy + 1 ][ ix + 1 ];

				if ( iy !== 0 || thetaStart > 0 ) geometry.indices.push(a, b, d);
				if ( iy !== heightSegments - 1 || thetaEnd < Math.PI ) geometry.indices.push(b, c, d);
			}

		}

		Util.pushArray(geometry.materials, Array(geometry.indices.length).fill(0));

		return geometry;
	}
}