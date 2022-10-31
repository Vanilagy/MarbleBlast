import { Vector3 } from "../math/vector3";
import { Util } from "../util";

/** Defines the geometry for a 3D mesh. */
export class Geometry {
	/** A list of numbers describing the 3D coordinates of the vertices. */
	readonly positions: number[] = [];
	/** A list of numbers describing the normals of the vertices. */
	readonly normals: number[] = [];
	/** A list of numbers describing the UV texture coordinates of the vertices. */
	readonly uvs: number[] = [];
	/** The list of vertex indices that should be drawn. */
	readonly indices: number[] = [];
	/** For each vertex index, this array defines the material that vertex uses. Only really makes sense if all vertices that make up a triangle have the same material. */
	readonly materials: number[] = [];

	/** Fills the normal and uv arrays so their lengths match with the vertex positions. */
	fillRest() {
		while (this.normals.length/3 < this.positions.length/3) this.normals.push(0, 0, 0);
		while (this.uvs.length/2 < this.positions.length/3) this.uvs.push(0, 0);
	}

	/** Makes sure the geometry isn't ill-defined. */
	validate() {
		// Check if all arrays actually describe the same amount of vertices
		if (new Set([this.positions.length/3, this.normals.length/3, this.uvs.length/2]).size !== 1) {
			console.error(this);
			throw new Error(`Geometry is invalid (vertex counts don't match):
Positions: ${this.positions.length/3}
Normals: ${this.normals.length/3}
Uvs: ${this.uvs.length/2},
Material Indices: ${this.materials.length/1}
			`);
		}

		// Check that all indices are in bounds
		for (let i = 0; i < this.indices.length; i++) {
			let index = this.indices[i];
			if (index >= this.positions.length/3) {
				console.error(this);
				throw new Error("Geometry is invalid (index points out of bounds)");
			}
		}

		let tris = this.indices.length;
		if (tris % 3)
			throw new Error("Geometry is invalid (triangle count isn't a whole number): " + tris/3);
	}

	/** Creates a UV sphere geometry. Largely taken from three.js source. */
	static createSphereGeometry(radius = 1, widthSegments = 32, heightSegments = 16, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) {
		let geometry = new Geometry();

		widthSegments = Math.max( 3, Math.floor( widthSegments ) );
		heightSegments = Math.max( 2, Math.floor( heightSegments ) );

		const thetaEnd = Math.min( thetaStart + thetaLength, Math.PI );

		let index = 0;
		const grid = [];

		const vertex = new Vector3();
		const normal = new Vector3();

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

			if ( iy === 0 && thetaStart === 0 ) {

				uOffset = 0.5 / widthSegments;

			} else if ( iy === heightSegments && thetaEnd === Math.PI ) {

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