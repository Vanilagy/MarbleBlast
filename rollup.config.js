// !!!! MAKE SURE TO COPY ALL CHANGES FROM THIS FILE INTO rollup-fast.config.js!!!!

import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [{
	input: './src/ts/index.ts',
	external: ['three', './declarations/oimo'],
	globals: {
		'three': 'THREE',
		'./declarations/oimo': 'OIMO',
		'../declarations/oimo': 'OIMO'
	},
    plugins: [
		resolve({
			browser: true
		}),
		commonjs(),
        typescript()
    ],
    output: {
        format: 'iife',
        file: './src/js/bundle.js',
        name: '', // Empty string here to create an unnamed IIFE
	},
	onwarn: function (message) {
		if (message.code === 'CIRCULAR_DEPENDENCY' || message.code === "MISSING_GLOBAL_NAME") {
		  return;
		}
		console.warn(message);
	}
}];