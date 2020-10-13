import { Shape } from "../shape";
import * as THREE from "three";
import OIMO from "../declarations/oimo";
import { Util } from "../util";
import { PHYSICS_TICK_RATE } from "../level";

/** A shape with force areas that can push or pull the marble. */
export abstract class ForceShape extends Shape {
	/** Creates a cone-shaped force area that widens as it gets farther away its origin. */
	addConicForce(radius: number, arc: number, strength: number) {
		let angle = arc;
		let height = radius / Math.tan(angle);

		// Compute the transform for the cone
		let transform = new THREE.Matrix4();
		transform.compose(new THREE.Vector3(0, 0, height/2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), new THREE.Vector3(1, 1, 1));

		// Create a cone-shaped collider
		this.addCollider(() => new OIMO.ConeGeometry(radius, height/2), () => {
			let marble = this.level.marble;
			let threeMarblePosition = Util.vecOimoToThree(marble.body.getPosition());
			let vec = marble.body.getPosition().sub(Util.vecThreeToOimo(this.worldPosition)); // The vector to the tip of the cone
			if (vec.length() === 0) return;

			let strengthFac = 1 - Util.clamp(vec.length() / height, 0, 1)**2;

			let forceDirection = new THREE.Vector3(0, 0, 1);
			forceDirection.applyQuaternion(this.worldOrientation);
			let line = new THREE.Line3(this.worldPosition, this.worldPosition.clone().add(forceDirection));
			let target = new THREE.Vector3();
			line.closestPointToPoint(threeMarblePosition, false, target);
			let distanceToCenter = threeMarblePosition.distanceTo(target); // Computes the distance to the center line of the cone

			let coneStartPlane = new THREE.Plane();
			coneStartPlane.setFromNormalAndCoplanarPoint(forceDirection, this.worldPosition);
			let radiusAtDistance = radius * coneStartPlane.distanceToPoint(threeMarblePosition) / height; // Computes the radius of the cone at the current distance

			// Reduce the strength of the force based on how far away one is from the center of the cone.
			strengthFac *= 1 - Util.clamp(distanceToCenter / radiusAtDistance, 0, 1)**3;

			// Adds the linear velocity
			marble.body.addLinearVelocity(vec.normalize().scale(0.7 * strength * strengthFac / PHYSICS_TICK_RATE));
		}, transform);
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