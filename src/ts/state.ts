import { Level } from "./level";

export const state = {
	currentLevel: null as Level,
	incrementalId: 0
};

export const getUniqueId = () => {
	return state.incrementalId++;
};