import THREE from "three";

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

		// indices

		for ( let iy = 0; iy < heightSegments; iy ++ ) {

			for ( let ix = 0; ix < widthSegments; ix ++ ) {

				const a = grid[ iy ][ ix + 1 ];
				const b = grid[ iy ][ ix ];
				const c = grid[ iy + 1 ][ ix ];
				const d = grid[ iy + 1 ][ ix + 1 ];

				let indices: number[] = [];

				if ( iy !== 0 || thetaStart > 0 ) indices.push(a, b, d);
				if ( iy !== heightSegments - 1 || thetaEnd < Math.PI ) indices.push(b, c, d);

				for (let index of indices) {
					geometry.positions.push(vertices[3*index + 0], vertices[3*index + 1], vertices[3*index + 2]);
					geometry.normals.push(normals[3*index + 0], normals[3*index + 1], normals[3*index + 2]);
					geometry.uvs.push(uvs[2*index + 0], uvs[2*index + 1]);
					geometry.materials.push(0);
				}
			}

		}

		return geometry;
	}
}