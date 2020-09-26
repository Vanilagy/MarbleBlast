import * as THREE from "three";

const mainCanvas = document.querySelector('#main-canvas') as HTMLCanvasElement;

const resize = () => {
	mainCanvas.setAttribute('width', window.innerWidth.toString());
	mainCanvas.setAttribute('height', window.innerHeight.toString());
	renderer.setSize(window.innerWidth, window.innerHeight);

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	orthographicCamera.left = 0;
	orthographicCamera.right = window.innerWidth;
	orthographicCamera.top = 0;
	orthographicCamera.bottom = window.innerHeight;
	orthographicCamera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);

export const renderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true });
renderer.shadowMap.enabled = true;

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight);
camera.up.set(0, 0, 1);

export const orthographicCamera = new THREE.OrthographicCamera(-window.innerWidth/2, window.innerWidth/2, -window.innerHeight/2, window.innerHeight/2, 0.1, 100000);
orthographicCamera.up.set(0, 0, -1);
orthographicCamera.lookAt(new THREE.Vector3(1, 0, 0));

resize();