import { Plane } from "../math/plane";
import { Vector3 } from "../math/vector3";
import { Util } from "../util";
import { BallCollisionShape, CollisionShape, SingletonCollisionShape } from "./collision_shape";
import { RigidBody } from "./rigid_body";

const maxIterations = 64;
const maxEpaFaces = 64;
const epaTolerance = 10 * Number.EPSILON;
const maxEpaLooseEdges = 64;
const maxEpaIterations = 64;

// Global algorithm state
/** The points of the current simplex. Only points with index < numPoints are valid. */
let points = [new Vector3(), new Vector3(), new Vector3(),  new Vector3()];
/** The amount of points in the current simplex. */
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
/** Indicates if the current triangle (3-point simplex) needs to have its winding order reversed. */
let requireFlip = 0;
let lastS1: CollisionShape = null;
let lastS2: CollisionShape = null;
let o = new Vector3(0, 0, 0);

let singletonShape = new SingletonCollisionShape();
let singletonBody = new RigidBody();
singletonBody.addCollisionShape(singletonShape);

// EPA state
let faces: Vector3[][] = [];
let looseEdges: Vector3[][] = [];
for (let i = 0; i < maxEpaIterations; i++) {
	faces.push([new Vector3(), new Vector3(), new Vector3(), new Vector3()]);
}
for (let i = 0; i < maxEpaLooseEdges; i++) {
	looseEdges.push([new Vector3(), new Vector3()]);
}

/** Provides methods for testing for intersection of convex shapes. */
export abstract class CollisionDetection {
	/** Joined support function; returns the support function of the Minkowski difference of shape 1 and 2. */
	static support(dst: Vector3, s1: CollisionShape, s2: CollisionShape, direction: Vector3) {
		return s1.support(dst, direction).sub(s2.support(v1, v2.copy(direction).negate()));
	}

	/** Returns true iff `s1` and `s2` intersect. */
	static checkIntersection(s1: CollisionShape, s2: CollisionShape) {
		// Remember the shapes for later
		lastS1 = s1;
		lastS2 = s2;

		if (s1 instanceof BallCollisionShape && s2 instanceof BallCollisionShape) {
			// Since this case is trivial, we have a special method for it to process it quickly
			return this.checkBallBallIntersection(s1, s2);
		} else if (s1 instanceof BallCollisionShape) {
			// This case is less trivial and does require GJK but does *not* require EPA later on, so use a special method for this also
			return this.checkBallConvexIntersection(s1, s2);
		} else {
			// Otherwise, do general GJK
			return this.checkConvexConvexIntersection(s1, s2);
		}
	}

	static checkBallBallIntersection(s1: BallCollisionShape, s2: BallCollisionShape) {
		// Simply compare distance and radius sum
		return s1.body.position.distanceTo(s2.body.position) <= s1.radius + s2.radius;
	}

	static checkBallConvexIntersection(s1: BallCollisionShape, s2: CollisionShape) {
		singletonBody.position.copy(s1.body.position);

		// All we need to do is compute the closest point on s2 to s1's center. After that, a simple comparison with the radius will suffice.
		let closestPoint = this.determineClosestPoint(new Vector3(), s2, singletonShape);
		let distanceSq = closestPoint.lengthSq();

		return distanceSq <= s1.radius**2;
	}

	/** Check for intersection of two shapes using the boolean Gilbert-Johnson-Keerthi (GJK) algorithm. */
	static checkConvexConvexIntersection(s1: CollisionShape, s2: CollisionShape) {
		direction.copy(s2.body.position).sub(s1.body.position).normalize(); // Can really be anything but this is a good start

		this.support(support, s1, s2, direction);

		numPoints = 1;
		points[0].copy(support);

		direction.copy(support).negate(); // ao

		for (let i = 0; i < maxIterations; i++) {
			this.support(support, s1, s2, direction);

			if (support.dot(direction) <= 0) {
				// No collision
				return false;
			}

			// Update the simplex
			this.addPointToSimplex(support);
			this.updateSimplexFast();

			if (numPoints === 4) {
				// We managed to enclose the origin in a tetrahedron, meaning we're intersecting
				return true;
			}
		}

		return false;
	}

	/** Computes the closest point to the origin in the Minkowski difference of s1 and s2. */
	static determineClosestPoint(dst: Vector3, s1: CollisionShape, s2: CollisionShape) {
		direction.copy(s2.body.position).sub(s1.body.position);

		numPoints = 0;

		for (let i = 0; i < maxIterations; i++) {
			if (numPoints === 4) break;

			this.support(support, s1, s2, direction);

			if (direction.lengthSq() + direction.dot(support) <= 10 * Number.EPSILON) break;

			this.addPointToSimplex(support);
			this.updateSimplexAndClosestPoint(direction);
			direction.negate();
		}

		return dst.copy(direction).negate();
	}

	/** Determines the time of impact of two moving shapes by simply linearly translating the shapes between their last and current position. */
	static determineTimeOfImpact(s1: CollisionShape, s2: CollisionShape, eps = 0.03) {
		s1.body.getRelativeMotionVector(translation, s2.body); // We assume s2 is stationary and s1's movement is now relative to s2's frame
		let translationLength = translation.length();

		// Remember the positions and revert the shapes back one position
		actualPosition1.copy(s1.body.position);
		actualPosition2.copy(s2.body.position);
		s1.body.position.copy(s1.body.prevPosition);
		s2.body.position.copy(s2.body.prevPosition);

		// A simple ray cast on the Minkowski difference will return the time of impact
		let res = this.castRay(s2, s1, o, translation, 1);

		// Reset the position
		s1.body.position.copy(actualPosition1);
		s2.body.position.copy(actualPosition2);

		if (!res) return null;

		// To ensure that collision is actually detected, nudge the point of impact a little bit forward so the shapes definitely intersect.
		let toAdd = Math.min(eps * translationLength, eps / translationLength); // Don't ask, there's no clean derivation for this
		res.lambda += toAdd;
		res.lambda = Util.clamp(res.lambda, 0, 1);

		return res.lambda;
	}

	/** Performs a GJK ray cast on the Minkowski difference of two shapes. Uses the method described by Gino van den Bergen in http://dtecta.com/papers/jgt04raycast.pdf. */
	static castRay(s1: CollisionShape, s2: CollisionShape, rayOrigin: Vector3, rayDirection: Vector3, lambdaMax: number) {
		direction.copy(s2.body.position).sub(s1.body.position).normalize();

		this.support(support, s1, s2, direction);

		numPoints = 0;

		x.copy(rayOrigin); // x will be the point of impact
		n.setScalar(0); // n will be the surface normal at the point of impact
		let lambda = 0; // lambda will be the number such that origin + lambda * direction = x

		direction.copy(x).sub(support);

		for (let i = 0; i < maxIterations; i++) {
			this.support(support, s1, s2, direction);

			w.copy(x).sub(support);

			if (direction.dot(w) > 0) {
				if (direction.dot(rayDirection) >= 0) return null;

				// Nudge forward
				let delta = direction.dot(w) / direction.dot(rayDirection);
				lambda -= delta;

				if (lambda > lambdaMax) return null;

				x.copy(rayOrigin).addScaledVector(rayDirection, lambda);
				n.copy(direction);
			}

			this.addPointToSimplex(support);

			// Offset the entire simplex temporarily
			for (let i = 0; i < numPoints; i++) points[i].sub(x);

			// This now finds the feature of the simplex closest to x, not the origin anymore, because we offset the simplex.
			this.updateSimplexAndClosestPoint(direction);
			direction.negate();

			// Offset the simplex back
			for (let i = 0; i < numPoints; i++) points[i].add(x);

			let maxDist2 = 0;
			for (let i = 0; i < numPoints; i++) {
				maxDist2 = Math.max(maxDist2, points[i].distanceToSquared(x));
			}

			if (direction.lengthSq() < 10 * Number.EPSILON * maxDist2) {
				return { point: x.clone(), lambda, normal: n.clone().normalize() };
			}
		}

		return null;
	}

	/** Expands the current simplex by one point. */
	static addPointToSimplex(p: Vector3) {
		// Check if the point is already contained in the simplex, and if so, don't add it
		for (let i = 0; i < numPoints; i++) {
			if (p.distanceToSquared(points[i]) < 10 * Number.EPSILON) return;
		}

		// Shift all points one to the right
		for (let i = numPoints; i > 0; i--) {
			points[i].copy(points[i-1]);
		}

		// Add the point at the front
		points[0].copy(p);
		numPoints++;
	}

	/** Updates the simplex and search direction quickly, meaning it doesn't perform a thourough search for the precise closest feature but just gets the general direction right. Uses the approach from https://blog.winter.dev/2020/gjk-algorithm/. */
	static updateSimplexFast() {
		switch (numPoints) {
			case 2: return this.updateLine();
			case 3: return this.updateTriangle();
			case 4: return this.updateTetrahedron();
			default: throw new Error("Shouldn't happen: " + numPoints);
		}
	}

	static updateLine() {
		let a = points[0];
		let b = points[1];

		ab.copy(b).sub(a);
		ao.copy(a).negate();

		if (ab.dot(ao) > 0) {
			// Keep searching perpendicular to the line
			direction.copy(ab).cross(ao).cross(ab);
		} else {
			// Discard point B
			numPoints--;
			direction.copy(ao);
		}
	}

	static updateTriangle() {
		let a = points[0];
		let b = points[1];
		let c = points[2];

		ab.copy(b).sub(a);
		ac.copy(c).sub(a);
		ao.copy(a).negate();

		abc.copy(ab).cross(ac);

		if (v1.copy(abc).cross(ac).dot(ao) > 0) {
			if (ac.dot(ao) > 0) {
				// We're on the AC side
				b.copy(c);
				numPoints--;
				direction.copy(ac).cross(ao).cross(ac);
			} else {
				// We're on the AB side
				numPoints--;
				return this.updateLine();
			}
		} else {
			if (v1.copy(ab).cross(abc).dot(ao) > 0) {
				// We're on the AB side
				numPoints--;
				return this.updateLine();
			} else {
				// Origin must be above or below the triangle, figure out the direction
				if (abc.dot(ao) > 0) {
					direction.copy(abc);
				} else {
					v1.copy(c);
					c.copy(b);
					b.copy(v1);
					direction.copy(abc).negate();
				}
			}
		}
	}

	static updateTetrahedron() {
		let a = points[0];
		let b = points[1];
		let c = points[2];
		let d = points[3];

		ab.copy(b).sub(a);
		ac.copy(c).sub(a);
		ad.copy(d).sub(a);
		ao.copy(a).negate();

		abc.copy(ab).cross(ac);
		acd.copy(ac).cross(ad);
		adb.copy(ad).cross(ab);

		// Simply do a triangle case with the face that's pointing towards the origin
		if (abc.dot(ao) > 0) {
			numPoints--;
			return this.updateTriangle();
		} else if (acd.dot(ao) > 0) {
			b.copy(c);
			c.copy(d);
			numPoints--;
			return this.updateTriangle();
		} else if (adb.dot(ao) > 0) {
			c.copy(b);
			b.copy(d);
			numPoints--;
			return this.updateTriangle();
		}

		// If we're here, the origin is enclosed!
	}

	/** Computes the closest point to the origin on the current simplex and reduces the simplex to the smallest feature that contains that point. Method somewhat inspired by BulletPhysics. */
	static updateSimplexAndClosestPoint(dst: Vector3) {
		let used: number; // A 4-bit number where the i'th bit represents if the i'th point (order: A, B, C, D) is present in the reduced feature.
		requireFlip = 0;

		switch (numPoints) {
			case 1: used = this.closestPointPoint(dst, points[0]); break;
			case 2: used = this.closestPointLineSegment(dst, points[0], points[1]); break;
			case 3: used = this.closestPointTriangle(dst, points[0], points[1], points[2]); break;
			case 4: used = this.closestPointTetrahedron(dst, points[0], points[1], points[2], points[3]); break;
			default: throw new Error("Shouldn't get here! " + numPoints);
		}

		// Do the whole point assignerino based on whatever points make up the closest feature
		let i = 0;
		for (let j = 0; j < 4; j++) {
			if (used & (1 << j)) {
				points[i].copy(points[j]);
				i++;
			}
		}
		numPoints = i;

		// Flip winding order of triangle if needed
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

		let t = Util.clamp(ab.dot(ao) / ab.dot(ab), 0, 1); // Clamp to the line segment

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

		// Figure out which faces we need to check
		let outsideABC = abc.dot(ao) > 0;
		let outsideACD = acd.dot(ao) > 0;
		let outsideADB = adb.dot(ao) > 0;
		let outsideBDC = bdc.dot(bo) > 0;
		let degenerate = Math.abs(abc.dot(ad)) < 10 * Number.EPSILON; // i.e. it has no volume

		let minDist = Infinity;
		let used: number;
		let flip: number; // The face winding flip of the face with the min dist

		// We simply do 4 triangle cases, one for each face of the tetrahedron, and the min wins.

		if (outsideABC || degenerate) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, a, b, c);
			let len = v1.lengthSq();

			dst.copy(v1);
			minDist = len;
			used = res;
			flip = requireFlip;
		}

		if (outsideACD || degenerate) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, a, c, d);
			let len = v1.lengthSq();

			if (len < minDist) {
				dst.copy(v1);
				minDist = len;
				used = (res & 0b1) | ((res & 0b10) << 1) | ((res & 0b100) << 1); // Shift the bits around so they match the passed points
				flip = requireFlip;
			}
		}

		if (outsideADB || degenerate) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, a, d, b);
			let len = v1.lengthSq();

			if (len < minDist) {
				dst.copy(v1);
				minDist = len;
				used = (res & 0b1) | ((res & 0b10) << 2) | ((res & 0b100) >> 1);
				flip = requireFlip ^ 1; // Requires one additional flip
			}
		}

		if (outsideBDC || degenerate) {
			requireFlip = 0;
			let res = this.closestPointTriangle(v1, b, d, c);
			let len = v1.lengthSq();

			if (len < minDist) {
				dst.copy(v1);
				minDist = len;
				used = ((res & 0b1) << 1) | ((res & 0b10) << 2) | ((res & 0b100));
				flip = requireFlip ^ 1; // Also requires one additional flip
			}
		}

		if (minDist === Infinity) {
			// The origin is inside the tetrahedron!
			dst.setScalar(0);
			used = 0b1111;
			flip = 0;
		}

		requireFlip = flip;

		return used;
	}

	/** Given the last two intersecting shapes s1 and s2, returns the plane whose normal is the collision normal and whose offset represents the smallest amount s1 has to be moved along the collision normal such that s1 and s2 no longer intersect. Note that this method has to be called right after calling `checkIntersection`! */
	static determineCollisionPlane(dst: Plane) {
		if (lastS1 instanceof BallCollisionShape && lastS2 instanceof BallCollisionShape) {
			return this.determineBallBallCollisionPlane(dst);
		} else if (lastS1 instanceof BallCollisionShape) {
			return this.determineBallConvexCollisionPlane(dst);
		} else {
			return this.determineConvexConvexCollisionPlane(dst);
		}
	}

	static determineBallBallCollisionPlane(dst: Plane) {
		let len = (lastS1 as BallCollisionShape).radius + (lastS2 as BallCollisionShape).radius - lastS1.body.position.distanceTo(lastS2.body.position);
		dst.normal.copy(lastS1.body.position).sub(lastS2.body.position).normalize();
		dst.constant = len;

		return dst;
	}

	static determineBallConvexCollisionPlane(dst: Plane) {
		let len = direction.length();
		if (len === 0) return this.determineConvexConvexCollisionPlane(dst); // The ball's center is contained inside the convex hull; we'll need to do EPA

		// The collision normal is simply given by the vector from the closest point in the CSO (configuration space obstacle) to the origin
		dst.normal.copy(direction).normalize();
		dst.constant = (lastS1 as BallCollisionShape).radius - len;

		return dst;
	}

	static determineConvexConvexCollisionPlane(dst: Plane) {
		// EPA code taken from https://github.com/kevinmoran/GJK/blob/master/GJK.h

		let a = points[0];
		let b = points[1];
		let c = points[2];
		let d = points[3];

		faces[0][0].copy(a);
		faces[0][1].copy(b);
		faces[0][2].copy(c);
		faces[0][3].copy(b).sub(a).cross(v1.copy(c).sub(a)).normalize();
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

			let dot = support.dot(direction);
			dst.constant = Math.abs(dot);

			if (faces[closestFace][3].lengthSq() > 0) {
				dst.normal.copy(faces[closestFace][3]).multiplyScalar(Math.sign(dot) || 1).negate();
			}

			if (dot - minDist < epaTolerance) {
				// Convergence (new point is not significantly further from origin)
				return dst;
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
					faces[numFaces][3].negate();
				}
				numFaces++;
			}
		}

		let dot = faces[closestFace][0].dot(faces[closestFace][3]);
		dst.constant = Math.abs(dot);
		dst.normal.copy(faces[closestFace][3]).multiplyScalar(Math.sign(dot) || 1).negate();

		return dst;
	}

	static clearReferences() {
		// To allow GC
		lastS1 = null;
		lastS2 = null;
	}
}