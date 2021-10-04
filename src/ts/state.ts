import { Level } from "./level";
import { Menu } from "./ui/menu";

export const state = {
	modification: null as 'gold' | 'platinum',
	level: null as Level,
	menu: null as Menu
};

/** Gets a unique id. */
export const getRandomId = () => {
	// This might seem cheap, but Math.random can return 2^52 different values, so the chance of collisions here is still ridiculously low.
	// https://v8.dev/blog/math-random
	return Math.random().toString();
};