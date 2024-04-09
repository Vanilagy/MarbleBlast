/** Sanitizes a string for worry-free use in Discord messages. */
export const escapeDiscord = (message: string) => {
	message = message.replace(/\\/g, "\\\\");
	message = message.replace(/\*/g, "\\*");
	message = message.replace(/_/g, "\\_");
	message = message.replace(/~/g, "\\~");
	message = message.replace(/-/g, "\\-");
	message = message.replace(/`/g, "\\`");
	message = message.replace(/:/g, "\\:");
	message = message.replace(/#/g, "\\#");
	message = message.replace(/\|/g, "\\|");

	// To prevent people from @everyone and causing a problem
	message = message.replace(/@/g, "@﻿");
	// To prevent people from <@&> as well
	message = message.replace(/</g, "<﻿");

	return message;
};

/** Converts seconds to a formatted time string. */
export const secondsToTimeString = (seconds: number, decimalDigits = 3) => {
	let abs = Math.abs(seconds);
	let minutes = Math.floor(abs / 60);
	let string = leftPadZeroes(minutes.toString(), 2) + ':' + leftPadZeroes(Math.floor(abs % 60).toString(), 2) + '.' + leftPadZeroes(Math.floor(abs % 1 * 10**decimalDigits).toString(), decimalDigits);
	if (seconds < 0) string = '-' + string;

	return string;
};

/** Pads the number with zeroes on the left. */
export const leftPadZeroes = (str: string, amount: number) => {
	return "000000000000000000".slice(0, Math.max(0, amount - str.length)) + str;
};

/** Uppercases the first letter of a given string. */
export const uppercaseFirstLetter = (str: string) => {
	return str[0].toUpperCase() + str.slice(1);
};

export const compareSemver = (v1: string, v2: string) => {
	let v1Parts = v1.split('.').map(Number);
	let v2Parts = v2.split('.').map(Number);

	for (let i = 0; i < 3; i++) {
		if (v1Parts[i] > v2Parts[i]) return 1;
		if (v1Parts[i] < v2Parts[i]) return -1;
	}

	return 0;
};