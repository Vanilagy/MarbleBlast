import * as http from 'http';
import assert from 'node:assert';

export const MINUTE = 1000 * 60;
export const HOUR = MINUTE * 60;

const windows = new Map<string, { entries: { time: number, amount: number }[], interval: number }>();

// Make sure the map doesn't grow forever
setInterval(() => {
	let now = Date.now();
	for (let [key, window] of windows) {
		if (window.entries.every(x => now - x.time >= window.interval)) windows.delete(key);
	}
}, 10 * MINUTE);

/** Lets an action identified by `key` spend at most `limit` per `interval` milliseconds, `amount` per call. Returns false and
 * responds with 429 Too Many Requests if that would exceed the limit. */
export const rateLimitRequest = (res: http.ServerResponse, key: string, limit: number, interval: number, amount = 1) => {
	let retryAfter = spendRateLimitBudget(key, limit, interval, amount);
	if (retryAfter === 0) return true;

	res.writeHead(429, { 'Retry-After': Math.ceil(retryAfter / 1000).toString() });
	res.end();
	return false;
};

/** Returns how many milliseconds to wait until the amount can be spent, or 0 if it was spent. */
export const spendRateLimitBudget = (key: string, limit: number, interval: number, amount = 1) => {
	assert(amount <= limit);

	let now = Date.now();
	let entries = (windows.get(key)?.entries ?? []).filter(x => now - x.time < interval);
	windows.set(key, {
		entries,
		interval
	});

	let spent = entries.reduce((sum, x) => sum + x.amount, 0);
	let excess = spent + amount - limit;
	if (excess <= 0) {
		entries.push({
			time: now,
			amount
		});
		return 0;
	}

	// Wait until enough of the oldest entries have expired to cover the excess
	for (let entry of entries) {
		excess -= entry.amount;
		if (excess <= 0) return entry.time + interval - now;
	}
};
