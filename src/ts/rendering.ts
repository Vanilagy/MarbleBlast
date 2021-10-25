import * as THREE from "three";

const mainCanvas = document.querySelector('#main-canvas') as HTMLCanvasElement;

const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;

export let SCALING_RATIO = 1;

const resize = () => {
	let ratio = Math.max(1, MIN_WIDTH / window.innerWidth, MIN_HEIGHT / window.innerHeight);
	document.body.style.width = Math.ceil(window.innerWidth * ratio) + 'px';
	document.body.style.height = Math.ceil(window.innerHeight * ratio) + 'px';
	document.body.style.transform = `scale(${1 / ratio})`;
	SCALING_RATIO = ratio;

	renderer.setSize(window.innerWidth, window.innerHeight);
	mainCanvas.style.width = '100%';
	mainCanvas.style.height = '100%';

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix(); // Necessary because changed aspect ratio

	orthographicCamera.left = 0;
	orthographicCamera.right = window.innerWidth;
	orthographicCamera.top = 0;
	orthographicCamera.bottom = window.innerHeight;
	orthographicCamera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);

export const renderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: false });
renderer.shadowMap.enabled = true;

/** Main camera. */
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01);
camera.up.set(0, 0, 1);

/** Used for rendering the HUD overlay. */
export const orthographicCamera = new THREE.OrthographicCamera(-window.innerWidth/2, window.innerWidth/2, -window.innerHeight/2, window.innerHeight/2, 0.1, 100000);
orthographicCamera.up.set(0, 0, -1);
orthographicCamera.lookAt(new THREE.Vector3(1, 0, 0));

resize();