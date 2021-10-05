import { Shape } from "../shape";
import * as THREE from "three";
import OIMO from "../declarations/oimo";
import { Util } from "../util";
import { PHYSICS_TICK_RATE } from "../level";

/** A shape with force areas that can push or pull the marble. */
export abstract class ForceShape extends Shape {
	/** Creates a cone-shaped force area that widens as it gets farther away its origin. */
	addConicForce(distance: number, arcangle: number, strength: number) {
		let semiverticalangle = arcangle/2; // Self explanatory, the semi-vertical angle of the right circular cone
		let height = distance; // The height of the cone
		let radius = height * Math.tan(semiverticalangle); // The radius of the cone
		// Apparently, the tip of the cone in MB is a bit behind the center of the fan,
		// we are not handling the cases the marble is just a little bit behind the fan, so we must adjust the strength accordingly.
		// Strength of the fan is inversely proportional to the distance between the tip of the cone and the marble
		let actualStrength = strength - (strength * (0.7/distance));
		let actualDistance = distance - 0.7;

		// Compute the transform for the cone
		let transform = new THREE.Matrix4();
		transform.compose(new THREE.Vector3(0, 0, (height/2)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), new THREE.Vector3(1, 1, 1));

		// Create a cone-shaped collider
		this.addCollider(() => new OIMO.ConeGeometry(radius, height/2), () => {
			let marble = this.level.marble;

			let perpendicular = new THREE.Vector3(0, 0, 1); // The normal to the fan
			perpendicular.applyQuaternion(this.worldOrientation);

			let conetip = this.worldPosition.clone().sub(perpendicular.multiplyScalar(0.7)); // The tip of the cone
			let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(conetip)); // The vector from the tip of the cone to the marble
			if (vec.length() === 0) return;
			if (vec.length() > actualDistance) return; // Out distance is greater than the allowed distance, so we stop right here

			// Maximum force is proportional to the negative of the distance between the marble and the tip of the cone
			let maxF = Util.lerp(actualStrength, 0, vec.length()/actualDistance);

			// Calculate the angle between the perpendicular and the relative position of the marble to the tip of the cone
			let theta = perpendicular.angleTo(Util.vecOimoToThree(vec));

			// If our angle is more than the maximum angle, we stop. The division by 2 is just there cause it just works.
			if (theta > semiverticalangle / 2) return;

			// The force at an an angle is a parabolic function peaking at maxF, and its zeroes are the the positive and negative semi-vertical angles 
			let forcemag = Math.abs(-maxF * (theta - semiverticalangle) * (theta + semiverticalangle));
			forcemag *= Math.sign(actualStrength);

			// Now we have to get the direction of force
			let force = vec.clone();
			force.normalize();

			// Calculate the actual force
			force = force.scale(forcemag / PHYSICS_TICK_RATE);

			// Now we apply it
			marble.body.addLinearVelocity(force);
		}, transform);
	}

	/** Like `addConicForce`, but directly ported from OpenMBU (which did some reverse-engineering magic) */
	addConicForceExceptItsAccurateThisTime(forceRadius: number, forceArc: number, forceStrength: number) {
		// Create a cone-shaped collider
		this.addCollider(() => new OIMO.SphereGeometry(forceRadius), () => {
			let force = this.computeAccurateConicForce(forceRadius, forceArc, forceStrength);

			// Calculate the actual force
			force = force.scale(1 / PHYSICS_TICK_RATE);

			// Now we apply it
			this.level.marble.body.addLinearVelocity(force);
		}, new THREE.Matrix4());
	}

	computeAccurateConicForce(forceRadius: number, forceArc: number, forceStrength: number) {
		let marble = this.level.marble;
		let pos = marble.body.getPosition();

		var strength = 0.0;
		var dot = 0.0;
		var posVec = new OIMO.Vec3();
		var retForce = new OIMO.Vec3();

		var node = this.worldMatrix.clone(); // In the general case, this is a mount node, but we're only using this method for magnets so far and those don't have that, so use the magnet's transform instead
		var nodeVec = new OIMO.Vec3(node.elements[4], node.elements[5], node.elements[6]); // Gets the second column, so basically the transformed y axis
		nodeVec.normalize();

		posVec = pos.sub(Util.vecThreeToOimo(new THREE.Vector3().setFromMatrixPosition(node)));
		dot = posVec.length();

		if (forceRadius < dot) {
			// We're outside the area of effect
			return retForce;
		}

		strength = (1 - dot / forceRadius) * forceStrength;

		posVec.scaleEq(1 / dot);
		var newDot = nodeVec.dot(posVec);
		var arc = forceArc;
		if (arc < newDot) {
			retForce.addEq(posVec.scaleEq(strength).scaleEq(newDot - arc).scaleEq(1 / (1 - arc)));
		}

		return retForce;
	}

	/** Creates a spherical-shaped force whose force always acts in the direction away from the center. */
	addSphericalForce(radius: number, strength: number) {
		this.addCollider(() => new OIMO.SphereGeometry(radius), () => {
			let marble = this.level.marble;
			let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(this.worldPosition));
			if (vec.length() === 0) return;

			let strengthFac = 1 - Util.clamp(vec.length() / radius, 0, 1)**2; // Quadratic falloff with distance

			marble.body.addLinearVelocity(vec.normalize().scale(strength * strengthFac / PHYSICS_TICK_RATE));
		}, new THREE.Matrix4());
	}

	/** Creates a spherical-shaped force whose force acts in the direction of the vector specified. */
	addFieldForce(radius: number, forceVector: OIMO.Vec3) {
		this.addCollider(() => new OIMO.SphereGeometry(radius), () => {
			let marble = this.level.marble;
			let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(this.worldPosition));
			if (vec.length() >= radius) return;

			// Simply add the force
			marble.body.addLinearVelocity(forceVector.scale(1 / PHYSICS_TICK_RATE));
		}, new THREE.Matrix4());
	}
}
