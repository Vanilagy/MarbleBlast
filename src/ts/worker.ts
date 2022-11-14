import { Util } from "./util";

const workerBody = () => {
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
};

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
	let msgId = Util.getRandomId();
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

const timerWorkerBody = () => {
	let idMap = new Map<number, number>();

	self.onmessage = (e: MessageEvent) => {
		let data = e.data;

		if (data.command === 'setTimeout') {
			let internalId = setTimeout(() => {
				self.postMessage({
					externalId: data.externalId
				});
			}, data.timeout) as any as number;

			idMap.set(data.externalId, internalId);
		} else if (data.command === 'setInterval') {
			let internalId = setInterval(() => {
				self.postMessage({
					externalId: data.externalId
				});
			}, data.timeout) as any as number;

			idMap.set(data.externalId, internalId);
		} else if (data.command === 'clear') {
			clearTimeout(idMap.get(data.externalId));
			clearInterval(idMap.get(data.externalId));
		}
	};
};

let timerEntire = timerWorkerBody.toString();
let timerBody = timerEntire.slice(timerEntire.indexOf("{") + 1, timerEntire.lastIndexOf("}"));
let timerWorker = new Worker(URL.createObjectURL(new Blob([timerBody])));

let timerId = 0;
let handlerMap = new Map<number, {
	func: () => void,
	once: boolean
}>();

timerWorker.onmessage = (ev) => {
	let handler = handlerMap.get(ev.data.externalId);

	handler?.func();
	if (handler?.once) handlerMap.delete(ev.data.externalId);
};

/** Works exactly like setTimeout, except that the timer runs on a Web Worker that keeps running in background tabs. */
export const workerSetTimeout = (handler: () => void, timeout = 0) => {
	timerWorker.postMessage({
		command: 'setTimeout',
		timeout: timeout,
		externalId: timerId
	});

	handlerMap.set(timerId, { func: handler, once: true });
	return timerId++;
};

/** Works exactly like setInterval, except that the timer runs on a Web Worker that keeps running in background tabs. */
export const workerSetInterval = (handler: () => void, timeout = 0) => {
	timerWorker.postMessage({
		command: 'setInterval',
		timeout: timeout,
		externalId: timerId
	});

	handlerMap.set(timerId, { func: handler, once: false });
	return timerId++;
};

/** Works exactly like clearTimeout and clearInterval. */
export const workerClearTimeoutOrInterval = (externalId: number) => {
	handlerMap.delete(externalId);
	timerWorker.postMessage({
		command: 'clear',
		externalId: externalId
	});
};