import {
	weightedCharLength,
	charWeight,
	USERNAME_MAX_WEIGHT,
	DISPLAY_NAME_MAX_WEIGHT,
} from "@/constants/text-limits";

const USERNAME_ALLOWED_PATTERN = /^[A-Za-z0-9_-]+$/;

function trimUsernameEdges(value: string): string {
	return value.replace(/^[-_]+|[-_]+$/g, "");
}

export function truncateUsernameByWeight(
	value: string,
	maxWeight: number,
): string {
	if (maxWeight <= 0) {
		return "";
	}
	let total = 0;
	let output = "";
	for (const ch of value) {
		const w = charWeight(ch);
		if (total + w > maxWeight) {
			break;
		}
		output += ch;
		total += w;
	}
	return output;
}

function normalizeRequestedUsernameBase(input: string): string {
	return String(input || "").trim();
}

function normalizeAutoUsernameBase(input: string): string {
	return normalizeRequestedUsernameBase(input).toLowerCase();
}

export function normalizeRequestedUsername(input: string): string {
	const normalized = normalizeRequestedUsernameBase(input);
	if (!normalized) {
		throw new Error("USERNAME_EMPTY");
	}
	if (!USERNAME_ALLOWED_PATTERN.test(normalized)) {
		throw new Error("USERNAME_INVALID");
	}
	if (weightedCharLength(normalized) > USERNAME_MAX_WEIGHT) {
		throw new Error("USERNAME_TOO_LONG");
	}
	return normalized;
}

export function normalizeAutoUsername(input: string): string {
	const normalized = trimUsernameEdges(
		normalizeAutoUsernameBase(input)
			.replace(/\s+/g, "-")
			.replace(/[^A-Za-z0-9_-]/g, "-")
			.replace(/-+/g, "-"),
	);
	const fallback = normalized || "user";
	const truncated = truncateUsernameByWeight(fallback, USERNAME_MAX_WEIGHT);
	return truncated || "user";
}

export function composeUsernameWithSuffix(
	base: string,
	suffix: string,
): string {
	if (!suffix) {
		return truncateUsernameByWeight(base, USERNAME_MAX_WEIGHT);
	}
	const suffixWeight = weightedCharLength(suffix);
	const baseBudget = Math.max(1, USERNAME_MAX_WEIGHT - suffixWeight);
	const trimmedBase = trimUsernameEdges(
		truncateUsernameByWeight(base, baseBudget),
	);
	return `${trimmedBase || "u"}${suffix}`;
}

// eslint-disable-next-line no-control-regex
const DISPLAY_NAME_INVALID_PATTERN = /[\x00-\x1F\x7F]/;

export function validateDisplayName(input: string): string {
	const value = String(input || "").trim();
	if (!value) {
		throw new Error("DISPLAY_NAME_EMPTY");
	}
	if (DISPLAY_NAME_INVALID_PATTERN.test(value)) {
		throw new Error("DISPLAY_NAME_INVALID");
	}
	if (weightedCharLength(value) > DISPLAY_NAME_MAX_WEIGHT) {
		throw new Error("DISPLAY_NAME_TOO_LONG");
	}
	return value;
}
