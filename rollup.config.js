// !!!! MAKE SURE TO COPY ALL CHANGES FROM THIS FILE INTO rollup-fast.config.js!!!!

import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import external_globals from 'rollup-plugin-external-globals';

export default [{
	input: './src/ts/index.ts',
	//external: ['three', './declarations/oimo'],
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
		name: '', // Empty string here to create an unnamed IIFE
		/*globals: {
			'three': 'THREE',
			'oimo': 'OIMO'
		}*/
	},
	onwarn: function (message) {
		if (message.code === 'CIRCULAR_DEPENDENCY' || message.code === "MISSING_GLOBAL_NAME") {
			return;
		}
		console.warn(message);
	}
}];