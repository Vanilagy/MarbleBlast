import * as THREE from "three";
import { StorageManager } from "./storage";

export const mainCanvas = document.querySelector('#main-canvas') as HTMLCanvasElement;

const MIN_WIDTH = 640;
const MIN_HEIGHT = 600;

export let SCALING_RATIO = 1;

export const resize = () => {
	let ratio = Math.max(1, MIN_WIDTH / window.innerWidth, MIN_HEIGHT / window.innerHeight);
	document.body.style.width = Math.ceil(window.innerWidth * ratio) + 'px';
	document.body.style.height = Math.ceil(window.innerHeight * ratio) + 'px';
	document.body.style.transform = `scale(${1 / ratio})`;
	SCALING_RATIO = ratio;

	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(StorageManager.data?.settings.respectDevicePixelRatio? window.devicePixelRatio : 1);
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

export const renderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: false, logarithmicDepthBuffer: true }); // Just so much better with logarithmic
renderer.shadowMap.enabled = true;

/** Main camera. */
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01);
camera.up.set(0, 0, 1);

/** Used for rendering the HUD overlay. */
export const orthographicCamera = new THREE.OrthographicCamera(-window.innerWidth/2, window.innerWidth/2, -window.innerHeight/2, window.innerHeight/2, 0.1, 100000);
orthographicCamera.up.set(0, 0, -1);
orthographicCamera.lookAt(new THREE.Vector3(1, 0, 0));

const dim = 2**9;
// We use a single texture for the marble reflection and not 6 in a cube because that's 6x faster.
export const marbleReflectionRenderTarget = new THREE.WebGLRenderTarget(dim, dim, {
	format: THREE.RGBFormat,
	generateMipmaps: true,
	minFilter: THREE.LinearMipmapLinearFilter,
	anisotropy: 16
});
export const marbleReflectionCamera = new THREE.PerspectiveCamera(150, 1, 0.05, 1000); // Far will be updated on le fly

resize();