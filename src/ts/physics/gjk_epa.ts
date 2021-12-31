import THREE from "three";
import { Util } from "../util";
import { CollisionShape } from "./collision_shape";

const maxIterations = 64;
const maxEpaFaces = 64;
const epaTolerance = 0.0001;
const maxEpaLooseEdges = 64;
const maxEpaIterations = 64;

// Global algorithm state
let points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),  new THREE.Vector3()];
let numPoints = 0;
let support = new THREE.Vector3();
let direction = new THREE.Vector3();
let ao = new THREE.Vector3();
let bo = new THREE.Vector3();
let ab = new THREE.Vector3();
let ac = new THREE.Vector3();
let ad = new THREE.Vector3();
let bc = new THREE.Vector3();
let bd = new THREE.Vector3();
let abc = new THREE.Vector3();
let acd = new THREE.Vector3();
let adb = new THREE.Vector3();
let bdc = new THREE.Vector3();
let t1 = new THREE.Vector3();
let t2 = new THREE.Vector3();
let triangle = new THREE.Triangle();
let translation = new THREE.Vector3();
let actualPosition1 = new THREE.Vector3();
let actualPosition2 = new THREE.Vector3();
let scaledTranslation = new THREE.Vector3();
let distance = new THREE.Vector3();
let v = new THREE.Vector3();
let w = new THREE.Vector3();

// EPA state
let faces: THREE.Vector3[][] = [];
let looseEdges: THREE.Vector3[][] = [];
for (let i = 0; i < maxEpaIterations; i++) {
	faces.push([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
}
for (let i = 0; i < maxEpaLooseEdges; i++) {
	looseEdges.push([new THREE.Vector3(), new THREE.Vector3()]);
}

export abstract class GjkEpa {
	static support(dst: THREE.Vector3, s1: CollisionShape, s2: CollisionShape, direction: THREE.Vector3, s1Translation?: THREE.Vector3) {
		return s1.support(dst, direction, s1Translation).sub(s2.support(t1, t2.copy(direction).negate()));
	}

	static gjk(s1: CollisionShape, s2: CollisionShape, distance?: THREE.Vector3, minimumSeparatingVector?: THREE.Vector3, s1Translation?: THREE.Vector3) {
		// Approach based on https://blog.winter.dev/2020/gjk-algorithm/

		direction.copy(s2.body.position).sub(s1.body.position).normalize(); // Can really be anything but this is a good start

		this.support(support, s1, s2, direction, s1Translation);

		numPoints = 1;
		points[0].copy(support);

		direction.copy(support).negate();

		for (let i = 0; i < maxIterations; i++) {
			this.support(support, s1, s2, direction, s1Translation);

			if (support.dot(direction) <= 0) {
				// No collision
				if (distance) this.closestPointToOrigin(distance).negate();
				return false;
			}

			points.unshift(points.pop());
			points[0].copy(support);
			numPoints++;

			if (this.nextSimplex()) {
				// Yes collision
				if (minimumSeparatingVector) this.epa(minimumSeparatingVector, s1, s2, s1Translation);
				return true;
			}
		}

		return false;
	}

	static nextSimplex() {
		switch (numPoints) {
			case 2: return this.line();
			case 3: return this.triangle();
			case 4: return this.tetrahedron();
			default: throw new Error("Shouldn't happen: " + numPoints);
		}
	}

	static line() {
		let a = points[0];
		let b = points[1];

		ab.copy(b).sub(a);
		ao.copy(a).negate();
		bo.copy(b).negate();

		if (ab.dot(ao) > 0) {
			if (ab.dot(bo) > 0) {
				a.copy(b);
				numPoints--;
				direction.copy(bo);
			} else {
				direction.copy(ab).cross(ao).cross(ab);
			}
		} else {
			numPoints--;
			direction.copy(ao);
		}

		return false;
	}

	static triangle() {
		let a = points[0];
		let b = points[1];
		let c = points[2];

		ab.copy(b).sub(a);
		ac.copy(c).sub(a);
		bc.copy(c).sub(c);
		ao.copy(a).negate();
		bo.copy(b).negate();

		abc.copy(ab).cross(ac);

		if (t1.copy(abc).cross(ac).dot(ao) > 0) {
			if (ac.dot(ao) > 0) {
				b.copy(c);
				numPoints--;
				return this.line();
				// b.copy(c);
				// numPoints--;
				// direction.copy(ac).cross(ao).cross(ac);
			} else {
				numPoints--;
				return this.line();
			}
		} else {
			if (t1.copy(ab).cross(abc).dot(ao) > 0) {
				numPoints--;
				return this.line();
			} else {
				if (t1.copy(bc).cross(abc).dot(bo) > 0) {
					a.copy(b);
					b.copy(c);
					numPoints--;
					return this.line();
				} else {
					if (abc.dot(ao) > 0) {
						direction.copy(abc);
					} else {
						t1.copy(c);
						c.copy(b);
						b.copy(t1);
						direction.copy(abc).negate();
					}
				}
			}
		}

		return false;
	}

	static tetrahedron() {
		let a = points[0];
		let b = points[1];
		let c = points[2];
		let d = points[3];

		ab.copy(b).sub(a);
		ac.copy(c).sub(a);
		ad.copy(d).sub(a);
		bc.copy(c).sub(b);
		bd.copy(d).sub(b);
		ao.copy(a).negate();
		bo.copy(b).negate();

		abc.copy(ab).cross(ac);
		acd.copy(ac).cross(ad);
		adb.copy(ad).cross(ab);
		bdc.copy(bd).cross(bc);

		if (abc.dot(ao) > 0) {
			numPoints--;
			return this.triangle();
		} else if (acd.dot(ao) > 0) {
			b.copy(c);
			c.copy(d);
			numPoints--;
			return this.triangle();
		} else if (adb.dot(ao) > 0) {
			c.copy(b);
			b.copy(d);
			numPoints--;
			return this.triangle();
		} else if (bdc.dot(bo) > 0) {
			a.copy(b);
			b.copy(d);
			numPoints--;
			return this.triangle();
		}

		return true;
	}

	static closestPointToOrigin(dst: THREE.Vector3) {
		if (numPoints === 1) {
			dst.copy(points[0]);
		} else if (numPoints === 2) {
			let a = points[0];
			let b = points[1];

			ab.copy(b).sub(a);
			ao.copy(a).negate();

			let t =  Util.clamp(ab.dot(ao) / ab.dot(ab), 0, 1);
			dst.copy(a).addScaledVector(ab, t);
		} else if (numPoints === 3) {
			triangle.set(points[0], points[1], points[2]);
			triangle.closestPointToPoint(t1.setScalar(0), dst);
		} else if (numPoints === 4) {
			let min = Infinity;
			t1.setScalar(0);

			triangle.set(points[0], points[1], points[2]);
			triangle.closestPointToPoint(t1, t2);
			if (t2.lengthSq() < min) dst.copy(t2), min = t2.lengthSq();

			triangle.set(points[0], points[1], points[3]);
			triangle.closestPointToPoint(t1, t2);
			if (t2.lengthSq() < min) dst.copy(t2), min = t2.lengthSq();

			triangle.set(points[0], points[2], points[3]);
			triangle.closestPointToPoint(t1, t2);
			if (t2.lengthSq() < min) dst.copy(t2), min = t2.lengthSq();

			triangle.set(points[1], points[2], points[3]);
			triangle.closestPointToPoint(t1, t2);
			if (t2.lengthSq() < min) dst.copy(t2);
		}

		return dst;
	}

	static epa(dst: THREE.Vector3, s1: CollisionShape, s2: CollisionShape, s1Translation?: THREE.Vector3) {
		// EPA code taken from https://github.com/kevinmoran/GJK/blob/master/GJK.h

		let a = points[0];
		let b = points[1];
		let c = points[2];
		let d = points[3];

		faces[0][0].copy(a);
		faces[0][1].copy(b);
		faces[0][2].copy(c);
		faces[0][3].copy(b).sub(a).cross(t1.copy(c).sub(a)).normalize(); // ABC
		faces[1][0].copy(a);
		faces[1][1].copy(c);
		faces[1][2].copy(d);
		faces[1][3].copy(c).sub(a).cross(t1.copy(d).sub(a)).normalize();
		faces[2][0].copy(a);
		faces[2][1].copy(d);
		faces[2][2].copy(b);
		faces[2][3].copy(d).sub(a).cross(t1.copy(b).sub(a)).normalize();
		faces[3][0].copy(b);
		faces[3][1].copy(d);
		faces[3][2].copy(c);
		faces[3][3].copy(d).sub(b).cross(t1.copy(c).sub(b)).normalize();

		let numFaces = 4;
		let closestFace = 0;

		for (let iteration = 0; iteration < maxEpaIterations; iteration++) {
			// Find face that's closest to origin
			let minDist = faces[0][0].dot(faces[0][3]);
			closestFace = 0;
			for (let i = 1; i < numFaces; i++) {
				let dist = faces[i][0].dot(faces[i][3]);
				if (dist < minDist) {
					minDist = dist;
					closestFace = i;
				}
			}

			// search normal to face that's closest to origin
			direction.copy(faces[closestFace][3]);
			this.support(support, s1, s2, direction, s1Translation);
			if (support.dot(direction) - minDist < epaTolerance) {
				// Convergence (new point is not significantly further from origin)
				dst.copy(faces[closestFace][3]).multiplyScalar(support.dot(direction)).negate(); // dot vertex with normal to resolve collision along normal!
				return;
			}

			let numLooseEdges = 0;

			// Find all triangles that are facing p
			let i = 0;
			while (i < numFaces) {
				if (faces[i][3].dot(t1.copy(support).sub(faces[i][0])) > 0) { // triangle i faces p, remove it
					// Add removed triangle's edges to loose edge list.
					// If it's already there, remove it (both triangles it belonged to are gone)
					for (let j = 0; j < 3; j++) { // Three edges per face
						let currentEdge = [faces[i][j], faces[i][(j + 1) % 3]];
						let foundEdge = false;
						for (let k = 0; k < numLooseEdges; k++) { // Check if current edge is already in list
							if (looseEdges[k][1].equals(currentEdge[0]) && looseEdges[k][0].equals(currentEdge[1])) {
								// Edge is already in the list, remove it
								// THIS ASSUMES EDGE CAN ONLY BE SHARED BY 2 TRIANGLES (which should be true)
								// THIS ALSO ASSUMES SHARED EDGE WILL BE REVERSED IN THE TRIANGLES (which
								// should be true provided every triangle is wound CCW)
								looseEdges[k][0].copy(looseEdges[numLooseEdges - 1][0]); // Overwrite current edge
								looseEdges[k][1].copy(looseEdges[numLooseEdges - 1][1]); // with last edge in list
								numLooseEdges--;
								foundEdge = true;
								break;
								// exit loop because edge can only be shared once
							}
						} // endfor loose_edges

						if (!foundEdge) { // add current edge to list
							if (numLooseEdges >= maxEpaLooseEdges)
								break;
							looseEdges[numLooseEdges][0].copy(currentEdge[0]);
							looseEdges[numLooseEdges][1].copy(currentEdge[1]);
							numLooseEdges++;
						}
					}

					// Remove triangle i from list
					faces[i][0].copy(faces[numFaces - 1][0]);
					faces[i][1].copy(faces[numFaces - 1][1]);
					faces[i][2].copy(faces[numFaces - 1][2]);
					faces[i][3].copy(faces[numFaces - 1][3]);
					numFaces--;
					i--;
				} // endif p can see triangle i

				i++;
			} // endfor num_faces

			// Reconstruct polytope with p added
			for (let i = 0; i < numLooseEdges; i++) {
				if (numFaces >= maxEpaFaces)
					break;
				faces[numFaces][0].copy(looseEdges[i][0]);
				faces[numFaces][1].copy(looseEdges[i][1]);
				faces[numFaces][2].copy(support);
				faces[numFaces][3].copy(looseEdges[i][0]).sub(looseEdges[i][1]).cross(t1.copy(looseEdges[i][0]).sub(support)).normalize();

				// Check for wrong normal to maintain CCW winding
				let bias = 0.000001; // in case dot result is only slightly < 0 (because origin is on face)
				if (faces[numFaces][0].dot(faces[numFaces][3]) + bias < 0) {
					let temp = faces[numFaces][0];
					faces[numFaces][0].copy(faces[numFaces][1]);
					faces[numFaces][1].copy(temp);
					faces[numFaces][3].multiplyScalar(-1);
				}
				numFaces++;
			}
		}
		dst.copy(faces[closestFace][3]).multiplyScalar(faces[closestFace][0].dot(faces[closestFace][3])).negate();
	}

	static determineTimeOfImpact(s1: CollisionShape, s2: CollisionShape, minimumSeparatingVector?: THREE.Vector3, eps = 0.01) {
		s1.body.getRelativeMotionVector(translation, s2.body);

		actualPosition1.copy(s1.body.position);
		actualPosition2.copy(s2.body.position);
		s1.body.position.copy(s1.body.prevPosition);
		s2.body.position.copy(s2.body.prevPosition);

		let low = 0;
		let high = 1;
		let mid: number;
		let translationLength = translation.length();

		let i: number;
		for (i = 0; i < 32; i++) {
			mid = (low + high) / 2;

			scaledTranslation.copy(translation).multiplyScalar(mid);
			let intersects = this.gjk(s1, s2, distance, null, scaledTranslation);

			if (intersects) {
				if ((high - low) * translationLength <= eps) {
					if (i === 0) mid = high; // todo explain this lol
					break;
				}

				high = mid;
			} else {
				let invMid = 1 - mid;
				let skipAhead = Math.max(distance.dot(translation) * invMid / (invMid * translationLength)**2, 0);

				skipAhead = 0;

				low = mid + skipAhead * invMid;
			}
		}

		if (minimumSeparatingVector)
			this.gjk(s1, s2, null, minimumSeparatingVector, scaledTranslation); // Run EPA on the thing

		s1.body.position.copy(actualPosition1);
		s2.body.position.copy(actualPosition2);

		return mid;
	}

	static rayCast(s1: CollisionShape, s2: CollisionShape, rayOrigin: THREE.Vector3, rayDirection: THREE.Vector3, maxLength: number) {
		direction.copy(s2.body.position).sub(s1.body.position).normalize(); // Can really be anything but this is a good start

		this.support(support, s1, s2, direction);

		numPoints = 1;
		points[0].copy(support);

		let x = rayOrigin.clone();
		let n = new THREE.Vector3();
		let lambda = 0;
		let epsSq = (1e-6)**2;

		direction.copy(x).sub(support);

		for (let i = 0; i < maxIterations; i++) {
			this.support(support, s1, s2, direction);

			w.copy(x).sub(support);

			if (direction.dot(w) > 0) {
				if (direction.dot(rayDirection) >= 0) return null;

				let delta = direction.dot(w) / direction.dot(rayDirection);
				lambda -= delta;

				if (lambda > maxLength) return null;

				x.copy(rayOrigin).addScaledVector(rayDirection, lambda);
				n.copy(direction);
			}

			points.unshift(points.pop());
			points[0].copy(support);
			numPoints++;

			for (let point of points) point.negate().add(x);

			//this.closestPointToOrigin(v);
			this.nextSimplex();
			direction.negate();
			//direction.copy(v);

			if (direction.lengthSq() < epsSq) {
				return { point: x, lambda, normal: n.normalize() };
			}

			if (numPoints === 4) return null;

			for (let point of points) point.sub(x).negate();
		}

		return null;
	}
}