import { Vector3 } from "../math/vector3";
import { Util } from "../util";
import { BallCollisionShape, CollisionShape } from "./collision_shape";

const maxIterations = 64;
const maxEpaFaces = 64;
const epaTolerance = 0.0001;
const maxEpaLooseEdges = 64;
const maxEpaIterations = 64;

// Global algorithm state
let points = [new Vector3(), new Vector3(), new Vector3(),  new Vector3()];
let numPoints = 0;
let support = new Vector3();
let direction = new Vector3();
let ao = new Vector3();
let bo = new Vector3();
let co = new Vector3();
let ab = new Vector3();
let ac = new Vector3();
let ad = new Vector3();
let bc = new Vector3();
let bd = new Vector3();
let abc = new Vector3();
let acd = new Vector3();
let adb = new Vector3();
let bdc = new Vector3();
let v1 = new Vector3();
let v2 = new Vector3();
let translation = new Vector3();
let actualPosition1 = new Vector3();
let actualPosition2 = new Vector3();
let x = new Vector3();
let n = new Vector3();
let w = new Vector3();
let requireFlip = 0;
let lastS1: CollisionShape = null;
let lastS2: CollisionShape = null;
let o = new Vector3(0, 0, 0);

// EPA state
let faces: Vector3[][] = [];
let looseEdges: Vector3[][] = [];
for (let i = 0; i < maxEpaIterations; i++) {
	faces.push([new Vector3(), new Vector3(), new Vector3(), new Vector3()]);
}
for (let i = 0; i < maxEpaLooseEdges; i++) {
	looseEdges.push([new Vector3(), new Vector3()]);
}

export abstract class CollisionDetection {
	static support(dst: Vector3, s1: CollisionShape, s2: CollisionShape, direction: Vector3) {
		return s1.support(dst, direction).sub(s2.support(v1, v2.copy(direction).negate()));
	}

	static checkIntersection(s1: CollisionShape, s2: CollisionShape) {
		lastS1 = s1;
		lastS2 = s2;

		if (s1 instanceof BallCollisionShape && s2 instanceof BallCollisionShape) {
			return this.checkBallBallIntersection(s1, s2);
		} else {
			return this.checkConvexConvexIntersection(s1, s2);
		}
	}

	static checkBallBallIntersection(s1: BallCollisionShape, s2: BallCollisionShape) {
		return s1.body.position.distanceTo(s2.body.position) <= s1.radius + s2.radius;
	}

	static checkConvexConvexIntersection(s1: CollisionShape, s2: CollisionShape) {
		direction.copy(s2.body.position).sub(s1.body.position).normalize(); // Can really be anything but this is a good start

		this.support(support, s1, s2, direction);

		numPoints = 1;
		points[0].copy(support);

		direction.copy(support).negate();

		for (let i = 0; i < maxIterations; i++) {
			this.support(support, s1, s2, direction);

			if (support.dot(direction) <= 0) {
				// No collision
				return false;
			}

			this.addPointToSimplex(support);
			this.updateSimplexAndClosestPoint(direction);
			direction.negate();

			if (numPoints === 4) {
				// Yes collision
				return true;
			}
		}

		return false;
	}

	static determineTimeOfImpact(s1: CollisionShape, s2: CollisionShape, eps = 0.03) {
		s1.body.getRelativeMotionVector(translation, s2.body);
		let translationLength = translation.length();

		actualPosition1.copy(s1.body.position);
		actualPosition2.copy(s2.body.position);
		s1.body.position.copy(s1.body.prevPosition);
		s2.body.position.copy(s2.body.prevPosition);

		let res = this.castRay(s1, s2, o, translation.negate(), 1);

		s1.body.position.copy(actualPosition1);
		s2.body.position.copy(actualPosition2);

		if (!res) return null;

		let toAdd = Math.min(eps * translationLength, eps / translationLength);
		res.lambda += toAdd;
		res.lambda = Util.clamp(res.lambda, 0, 1);

		return res.lambda;
	}

	static castRay(s1: CollisionShape, s2: CollisionShape, rayOrigin: Vector3, rayDirection: Vector3, lambdaMax: number) {
		lastS1 = s1;
		lastS2 = s2;

		direction.copy(s2.body.position).sub(s1.body.position).normalize();

		this.support(support, s1, s2, direction);

		numPoints = 0;

		x.copy(rayOrigin);
		n.setScalar(0);
		let lambda = 0;

		direction.copy(x).sub(support);

		for (let i = 0; i < maxIterations; i++) {
			this.support(support, s1, s2, direction);

			w.copy(x).sub(support);

			if (direction.dot(w) > 0) {
				if (direction.dot(rayDirection) >= 0) return null;

				let delta = direction.dot(w) / direction.dot(rayDirection);
				lambda -= delta;

				if (lambda > lambdaMax) return null;

				x.copy(rayOrigin).addScaledVector(rayDirection, lambda);
				n.copy(direction);
			}

			this.addPointToSimplex(support);

			for (let i = 0; i < numPoints; i++) points[i].negate().add(x);

			this.updateSimplexAndClosestPoint(direction);

			let maxDist2 = 0;
			for (let i = 0; i < numPoints; i++) {
				maxDist2 = Math.max(maxDist2, points[i].distanceToSquared(x));
			}

			if (direction.lengthSq() < 10 * Number.EPSILON * maxDist2) {
				return { point: x.clone(), lambda, normal: n.clone().normalize() };
			}

			for (let i = 0; i < numPoints; i++) points[i].sub(x).negate();
		}

		return null;
	}

	static addPointToSimplex(p: Vector3) {
		for (let i = 0; i < numPoints; i++) {
			if (p.distanceToSquared(points[i]) < 10 * Number.EPSILON) return;
		}

		for (let i = numPoints; i > 0; i--) {
			points[i].copy(points[i-1]);
		}

		points[0].copy(p);
		numPoints++;
	}

	static updateSimplexAndClosestPoint(dst: Vector3) {
		let used: number;
		requireFlip = 0;

		switch (numPoints) {
			case 1: used = this.closestPointPoint(dst, points[0]); break;
			case 2: used = this.closestPointLineSegment(dst, points[0], points[1]); break;
			case 3: used = this.closestPointTriangle(dst, points[0], points[1], points[2]); break;
			case 4: used = this.closestPointTetrahedron(dst, points[0], points[1], points[2], points[3]); break;
			default: throw new Error("Shouldn't get here! " + numPoints);
		}

		let i = 0;
		for (let j = 0; j < 4; j++) {
			if (used & (1 << j)) {
				points[i].copy(points[j]);
				i++;
			}
		}
		numPoints = i;

		if (requireFlip) {
			v1.copy(points[1]);
			points[1].copy(points[2]);
			points[2].copy(v1);
		}
	}

	static closestPointPoint(dst: Vector3, a: Vector3) {
		dst.copy(a);

		return 0b0001;
	}

	static closestPointLineSegment(dst: Vector3, a: Vector3, b: Vector3) {
		ab.copy(b).sub(a);
		ao.copy(a).negate();

		let t =  Util.clamp(ab.dot(ao) / ab.dot(ab), 0, 1);

		if (t === 0) {
			dst.copy(a);
			return 0b0001;
		} else if (t === 1) {
			dst.copy(b);
			return 0b0010;
		} else {
			dst.copy(a).addScaledVector(ab, t);
			return 0b0011;
		}
	}

	static closestPointTriangle(dst: Vector3, a: Vector3, b: Vector3, c: Vector3) {
		ab.copy(b).sub(a);
		ac.copy(c).sub(a);
		ao.copy(a).negate();

		let d1 = ab.dot(ao);
		let d2 = ac.dot(ao);
		if (d1 <= 0 && d2 <= 0) {
			dst.copy(a);
			return 0b0001;
		}

		bo.copy(b).negate();
		let d3 = ab.dot(bo);
		let d4 = ac.dot(bo);
		if (d3 >= 0 && d4 <= d3) {
			dst.copy(b);
			return 0b0010;
		}

		let vc = d1 * d4 - d3 * d2;
		if (vc <= 0 && d1 >= 0 && d3 <= 0) {
			let v = d1 / (d1 - d3);
			dst.copy(a).addScaledVector(ab, v);
			return 0b0011;
		}

		co.copy(c).negate();
		let d5 = ab.dot(co);
		let d6 = ac.dot(co);
		if (d6 >= 0 && d5 <= d6) {
			dst.copy(c);
			return 0b0100;
		}

		let vb = d5 * d2 - d1 * d6;
		if (vb <= 0 && d2 >= 0 && d6 <= 0) {
			let w = d2 / (d2 - d6);
			dst.copy(a).addScaledVector(ac, w);
			return 0b0101;
		}

		let va = d3 * d6 - d5 * d4;
		if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
			bc.copy(c).sub(b);
			let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
			dst.copy(b).addScaledVector(bc, w);
			return 0b0110;
		}

		let denom = 1 / (va + vb + vc);
		let v = vb * denom;
		let w = vc * denom;

		dst.copy(a).addScaledVector(ab, v).addScaledVector(ac, w);

		abc.copy(ab).cross(ac);
		if (abc.dot(dst) > 0) {
			dst.negate();
			requireFlip ^= 1;
		}

		return 0b0111;
	}

	static closestPointTetrahedron(dst: Vector3, a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
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

		let minDist = Infinity;
		let used: number;
		let flip: number;
		let ownFlip = 0;

		if (abc.dot(ao) > 0) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, a, b, c);
			let len = v1.lengthSq();

			dst.copy(v1);
			minDist = len;
			used = res;
			flip = requireFlip;
		}

		if (acd.dot(ao) > 0) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, a, c, d);
			let len = v1.lengthSq();

			if (len < minDist) {
				dst.copy(v1);
				minDist = len;
				used = (res & 0b1) | ((res & 0b10) << 1) | ((res & 0b100) << 1);
				flip = requireFlip;
			}
		}

		if (adb.dot(ao) > 0) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, a, d, b);
			let len = v1.lengthSq();

			if (len < minDist) {
				dst.copy(v1);
				minDist = len;
				used = (res & 0b1) | ((res & 0b10) << 2) | ((res & 0b100) >> 1);
				flip = requireFlip;
				ownFlip = 1;
			}
		}

		if (bdc.dot(bo) > 0) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, b, d, c);
			let len = v1.lengthSq();

			if (len < minDist) {
				dst.copy(v1);
				minDist = len;
				used = ((res & 0b1) << 1) | ((res & 0b10) << 2) | ((res & 0b100));
				flip = requireFlip;
				ownFlip = 1;
			}
		}

		requireFlip = flip ^ ownFlip;

		if (minDist === Infinity) {
			dst.setScalar(0);
			used = 0b1111;
		}

		return used;
	}

	static determineMinimumSeparatingVector(dst: Vector3) {
		if (lastS1 instanceof BallCollisionShape && lastS2 instanceof BallCollisionShape) {
			let len = lastS1.radius + lastS2.radius - lastS1.body.position.distanceTo(lastS2.body.position);
			return dst.copy(lastS1.body.position).sub(lastS2.body.position).normalize().multiplyScalar(len);
		}

		// EPA code taken from https://github.com/kevinmoran/GJK/blob/master/GJK.h

		let a = points[0];
		let b = points[1];
		let c = points[2];
		let d = points[3];

		faces[0][0].copy(a);
		faces[0][1].copy(b);
		faces[0][2].copy(c);
		faces[0][3].copy(b).sub(a).cross(v1.copy(c).sub(a)).normalize(); // ABC
		faces[1][0].copy(a);
		faces[1][1].copy(c);
		faces[1][2].copy(d);
		faces[1][3].copy(c).sub(a).cross(v1.copy(d).sub(a)).normalize();
		faces[2][0].copy(a);
		faces[2][1].copy(d);
		faces[2][2].copy(b);
		faces[2][3].copy(d).sub(a).cross(v1.copy(b).sub(a)).normalize();
		faces[3][0].copy(b);
		faces[3][1].copy(d);
		faces[3][2].copy(c);
		faces[3][3].copy(d).sub(b).cross(v1.copy(c).sub(b)).normalize();

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
			this.support(support, lastS1, lastS2, direction);
			if (support.dot(direction) - minDist < epaTolerance) {
				// Convergence (new point is not significantly further from origin)
				return dst.copy(faces[closestFace][3]).multiplyScalar(support.dot(direction)).negate(); // dot vertex with normal to resolve collision along normal!
			}

			let numLooseEdges = 0;

			// Find all triangles that are facing p
			let i = 0;
			while (i < numFaces) {
				if (faces[i][3].dot(v1.copy(support).sub(faces[i][0])) > 0) { // triangle i faces p, remove it
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
				faces[numFaces][3].copy(looseEdges[i][0]).sub(looseEdges[i][1]).cross(v1.copy(looseEdges[i][0]).sub(support)).normalize();

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
		return dst.copy(faces[closestFace][3]).multiplyScalar(faces[closestFace][0].dot(faces[closestFace][3])).negate();
	}
}