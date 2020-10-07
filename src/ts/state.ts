import { Level } from "./level";

export const state = {
	currentLevel: null as Level,
	incrementalId: 0
};

/** Gets a unique id. Since there's no parallelism in the code, this is totally fine and safe. */
export const getUniqueId = () => {
	return state.incrementalId++;
};