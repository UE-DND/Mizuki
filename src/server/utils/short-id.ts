import { getRandomValues } from "node:crypto";

const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHORT_ID_PREFIX = "CL";
const SHORT_ID_LENGTH = 10;

const SHORT_ID_RE = /^CL[0-9a-zA-Z]{10}$/;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Generate a short ID in the format `CL` + 10 base62 characters. */
export function generateShortId(): string {
	const bytes = new Uint8Array(SHORT_ID_LENGTH);
	getRandomValues(bytes);
	let result = SHORT_ID_PREFIX;
	for (let i = 0; i < SHORT_ID_LENGTH; i++) {
		result += BASE62[bytes[i] % BASE62.length];
	}
	return result;
}

/** Check whether `input` matches the short ID format (`CL` + 10 base62). */
export function isShortId(input: string): boolean {
	return SHORT_ID_RE.test(input);
}

/** Check whether `input` is a valid UUID. */
export function isUuid(input: string): boolean {
	return UUID_RE.test(input);
}
