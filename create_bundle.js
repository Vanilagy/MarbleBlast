const sarcina = require('sarcina');

sarcina.bundle({
	src: './src',
	dist: './dist',
	verbose: true,
	minifyMarkup: false,
	ignore: ['ts'],
	keep: ['lib/pako.js'],
	transpileScript: sarcina.ES2017,
	insertPolyfill: true,
	handleInlineScript: false
}).then((e) => console.log(e));