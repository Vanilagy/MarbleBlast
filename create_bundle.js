const sarcina = require('sarcina');

sarcina.bundle({
	src: './src',
	dist: './dist',
	verbose: true,
	minifyMarkup: false,
	ignore: ['ts', 'php/leaderboard.json', 'storage'],
	keep: ['lib/pako.js'],
	transpileScript: sarcina.ES2017,
	insertPolyfill: true
}).then((e) => console.log(e));