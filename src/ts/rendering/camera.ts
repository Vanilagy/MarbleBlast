import THREE from "three";

export class Camera {
	position = new THREE.Vector3();
	viewMatrix = new THREE.Matrix4();
	projectionMatrix = new THREE.Matrix4();
	near: number = 0.01;
	far: number;
}