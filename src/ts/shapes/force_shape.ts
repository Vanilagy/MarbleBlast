import { Shape } from "../shape";
import { Util } from "../util";
import { BallCollisionShape } from "../physics/collision_shape";
import { Vector3 } from "../math/vector3";
import { Matrix4 } from "../math/matrix4";

/** A shape with force areas that can push or pull the marble. */
export abstract class ForceShape extends Shape {
	/** Creates a cone-shaped force area that widens as it gets farther away its origin. */
	addConicForce(distance: number, arcangle: number, strength: number) {
		let semiverticalangle = arcangle/2; // Self explanatory, the semi-vertical angle of the right circular cone
		// Apparently, the tip of the cone in MB is a bit behind the center of the fan,
		// we are not handling the cases the marble is just a little bit behind the fan, so we must adjust the strength accordingly.
		// Strength of the fan is inversely proportional to the distance between the tip of the cone and the marble
		let actualStrength = strength - (strength * (0.7/distance));
		let actualDistance = distance - 0.7;

		// Create a cone-shaped collider
		this.addCollider(() => new BallCollisionShape(distance), (t: number, dt: number) => {
			let marble = this.level.marble;

			let perpendicular = new Vector3(0, 0, 1); // The normal to the fan
			perpendicular.applyQuaternion(this.worldOrientation);

			let conetip = this.worldPosition.clone().sub(perpendicular.multiplyScalar(0.7)); // The tip of the cone
			let vec = marble.body.position.clone().sub(conetip); // The vector from the tip of the cone to the marble
			if (vec.length() === 0) return;
			if (vec.length() > actualDistance) return; // Our distance is greater than the allowed distance, so we stop right here

			// Maximum force is proportional to the negative of the distance between the marble and the tip of the cone
			let maxF = Util.lerp(actualStrength, 0, vec.length()/actualDistance);

			// Calculate the angle between the perpendicular and the relative position of the marble to the tip of the cone
			let theta = perpendicular.angleTo(vec);

			// If our angle is more than the maximum angle, we stop. The division by 2 is just there cause it just works.
			if (theta > semiverticalangle / 2) return;

			// The force at an an angle is a parabolic function peaking at maxF, and its zeroes are the the positive and negative semi-vertical angles
			let forcemag = Math.abs(-maxF * (theta - semiverticalangle) * (theta + semiverticalangle));
			forcemag *= Math.sign(actualStrength);

			// Now we have to get the direction of force
			let force = vec.clone();
			force.normalize();

			// Now we apply it
			marble.body.linearVelocity.addScaledVector(force, forcemag * dt);
		}, new Matrix4());
	}

	/** Like `addConicForce`, but directly ported from OpenMBU (which did some reverse-engineering magic) */
	addConicForceExceptItsAccurateThisTime(forceRadius: number, forceArc: number, forceStrength: number) {
		// Create a cone-shaped collider
		this.addCollider(() => new BallCollisionShape(forceRadius), (t: number, dt: number) => {
			let force = this.computeAccurateConicForce(forceRadius, forceArc, forceStrength);

			// Calculate the actual force
			force.multiplyScalar(dt);

			// Now we apply it
			this.level.marble.body.linearVelocity.add(force);
		}, new Matrix4());
	}

	computeAccurateConicForce(forceRadius: number, forceArc: number, forceStrength: number) {
		let marble = this.level.marble;
		let pos = marble.body.position;

		let strength = 0.0;
		let dot = 0.0;
		let posVec = new Vector3();
		let retForce = new Vector3();

		let node = this.worldMatrix.clone(); // In the general case, this is a mount node, but we're only using this method for magnets so far and those don't have that, so use the magnet's transform instead
		let nodeVec = new Vector3(node.elements[4], node.elements[5], node.elements[6]); // Gets the second column, so basically the transformed y axis
		nodeVec.normalize();

		posVec = pos.clone().sub(new Vector3().setFromMatrixPosition(node));
		dot = posVec.length();

		if (forceRadius < dot) {
			// We're outside the area of effect
			return retForce;
		}

		strength = (1 - dot / forceRadius) * forceStrength;

		posVec.multiplyScalar(1 / dot);
		let newDot = nodeVec.dot(posVec);
		let arc = forceArc;
		if (arc < newDot) {
			retForce.add(posVec.multiplyScalar(strength).multiplyScalar(newDot - arc).multiplyScalar(1 / (1 - arc)));
		}

		return retForce;
	}

	/** Creates a spherical-shaped force whose force always acts in the direction away from the center. */
	addSphericalForce(radius: number, strength: number) {
		this.addCollider(() => new BallCollisionShape(radius), (t: number, dt: number) => {
			let marble = this.level.marble;
			let vec = marble.body.position.clone().sub(this.worldPosition);
			if (vec.length() === 0) return;

			let strengthFac = 1 - Util.clamp(vec.length() / radius, 0, 1)**2; // Quadratic falloff with distance

			marble.body.linearVelocity.addScaledVector(vec.normalize(), strength * strengthFac * dt);
		}, new Matrix4());
	}

	/** Creates a spherical-shaped force whose force acts in the direction of the vector specified. */
	addFieldForce(radius: number, forceVector: Vector3) {
		this.addCollider(() => new BallCollisionShape(radius), (t: number, dt: number) => {
			let marble = this.level.marble;
			if (marble.body.position.distanceTo(this.worldPosition) >= radius) return;

			// Simply add the force
			marble.body.linearVelocity.addScaledVector(forceVector, dt);
		}, new Matrix4());
	}
}
