const sarcina = require('sarcina');

sarcina.bundle({
	src: './src',
	dist: './dist',
	verbose: true,
	minifyMarkup: false,
	ignore: ['ts'],
	transpileScript: sarcina.ES2017,
	insertPolyfill: true
}).then((e) => console.log(e));