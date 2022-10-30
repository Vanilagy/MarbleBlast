/* eslint-disable @typescript-eslint/no-var-requires */
const sarcina = require('sarcina');

sarcina.bundle({
	src: './src',
	dist: './dist',
	verbose: true,
	minifyMarkup: false,
	ignore: ['ts', 'assets'],
	keep: ['lib/pako.js', 'lib/oggdec.js', 'lib/webm.js', 'manifest.json', 'sw.js'],
	transpileScript: sarcina.ES2017,
	insertPolyfill: true,
	handleInlineScript: false
}).then((e) => console.log(e));