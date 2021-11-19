// This file is a faster way to bundle the project, but will throw much less TypeScript errors. Good for repetetive iterative work, but not good for being 100% type-correct. It's for debug, basically.

import typescript from 'rollup-plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import external_globals from 'rollup-plugin-external-globals';
import externals from 'rollup-plugin-node-externals';

export default [{
	input: './src/ts/index.ts',
	plugins: [
		resolve({
			browser: true
		}),
		commonjs(),
		typescript(),
		external_globals({
			'three': 'THREE',
			'./declarations/oimo': 'OIMO',
			'../declarations/oimo': 'OIMO'
		})
	],
	output: {
		format: 'iife',
		file: './src/js/bundle.js',
		name: '' // Empty string here to create an unnamed IIFE
	},
	onwarn: function (message) {
		if (message.code === 'CIRCULAR_DEPENDENCY' || message.code === "MISSING_GLOBAL_NAME") {
			return;
		}
		console.warn(message);
	}
}, {
	input: './server/ts/index.ts',
	plugins: [
		externals(),
		typescript()
	],
	output: {
		format: 'cjs',
		file: './server/bundle.js'
	},
	onwarn: function (message) {
		if (message.code === 'CIRCULAR_DEPENDENCY' || message.code === "MISSING_GLOBAL_NAME" || message.code === "UNRESOLVED_IMPORT") {
			return;
		}
		console.warn(message);
	}
}];