import { Level } from "./level";

export const state = {
	currentLevel: null as Level
};

/** Gets a unique id. **/
export const getRandomId = () => {
	// This might seem cheap, but Math.random can return 2^52 different values, so the chance of collisions here is still ridiculously low.
	// https://v8.dev/blog/math-random
	return Math.random().toString();
};