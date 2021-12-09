import THREE from "three";

export class CubeCamera {
	cameras: THREE.PerspectiveCamera[] = [];
	position = new THREE.Vector3();

	constructor(near: number, far: number) {
		const fov = 90, aspect = 1;

		const cameraPX = new THREE.PerspectiveCamera( fov, aspect, near, far );
		cameraPX.up.set( 0, - 1, 0 );
		cameraPX.lookAt( new THREE.Vector3( 1, 0, 0 ) );
		this.cameras.push( cameraPX );

		const cameraNX = new THREE.PerspectiveCamera( fov, aspect, near, far );
		cameraNX.up.set( 0, - 1, 0 );
		cameraNX.lookAt( new THREE.Vector3( - 1, 0, 0 ) );
		this.cameras.push( cameraNX );

		const cameraPY = new THREE.PerspectiveCamera( fov, aspect, near, far );
		cameraPY.up.set( 0, 0, 1 );
		cameraPY.lookAt( new THREE.Vector3( 0, 1, 0 ) );
		this.cameras.push( cameraPY );

		const cameraNY = new THREE.PerspectiveCamera( fov, aspect, near, far );
		cameraNY.up.set( 0, 0, - 1 );
		cameraNY.lookAt( new THREE.Vector3( 0, - 1, 0 ) );
		this.cameras.push( cameraNY );

		const cameraPZ = new THREE.PerspectiveCamera( fov, aspect, near, far );
		cameraPZ.up.set( 0, - 1, 0 );
		cameraPZ.lookAt( new THREE.Vector3( 0, 0, 1 ) );
		this.cameras.push( cameraPZ );

		const cameraNZ = new THREE.PerspectiveCamera( fov, aspect, near, far );
		cameraNZ.up.set( 0, - 1, 0 );
		cameraNZ.lookAt( new THREE.Vector3( 0, 0, - 1 ) );
		this.cameras.push( cameraNZ );
	}
}