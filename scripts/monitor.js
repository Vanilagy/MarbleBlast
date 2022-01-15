const fs = require('fs');
const { spawn } = require('child_process');

let childProcess;
const startProcess = () => {
	childProcess = spawn('node', [process.argv[2]], { cwd: process.cwd(), stdio: 'inherit' });
};
startProcess();

let prev = fs.readFileSync(process.argv[2]).toString();
let queued = false;

fs.watch(process.argv[2], () => {
	if (queued) return;
	queued = true;

	setTimeout(() => {
		let newThing = fs.readFileSync(process.argv[2]).toString();
		if (newThing.length === 0) {
			queued = false;
			return;
		}

		let old = prev;
		prev = newThing;

		if (old !== prev) {
			console.log("=== RESTARTING ===");

			childProcess.kill();
			startProcess();
		}

		queued = false;
	}, 250);
});