import { Util } from "./util";

function workerBody() {
	const respond = (msgId: string, payload: any) => {
		self.postMessage({
			msgId: msgId,
			data: payload
		});
	};

	let url: string = null;
	self.onmessage = (e: MessageEvent) => {
		if (!url) {
			// The first message received will be the url
			url = e.data;
			self.importScripts(url + 'lib/pako.js');
			return;
		}

		let data = e.data;

		if (data.command === 'compress') {
			let compressed = pako.deflate(data.data);
			respond(e.data.msgId, compressed);
		}
	};
}

// Create the worker by converting the function into a blob resource
let entire = workerBody.toString();
let body = entire.slice(entire.indexOf("{") + 1, entire.lastIndexOf("}"));
let blob = new Blob([body]);
let worker = new Worker(URL.createObjectURL(blob));
let currentPromiseResolves = new Map<string, (data: any) => any>();

// https://stackoverflow.com/questions/22172426/using-importsscripts-within-blob-in-a-karma-environment
worker.postMessage(window.location.href.slice(0, window.location.href.lastIndexOf('/') + 1));

worker.onmessage = (e) => {
	currentPromiseResolves.get(e.data.msgId)(e.data.data);
};

/** Executes a command with a payload on the worker. Returns a promise that resolves with the result. */
export const executeOnWorker = (command: string, payload: any) => {
	let msgId = Util.uuid();
	worker.postMessage({
		msgId: msgId,
		command: command,
		data: payload
	});

	let promise = new Promise<any>((resolve) => {
		currentPromiseResolves.set(msgId, resolve);
	});
	return promise;
};