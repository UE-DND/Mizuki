import type { AstroCookieSetOptions } from "astro";

import type { JsonObject, JsonValue } from "@/types/json";
import { getJsonString, isJsonObject } from "@/utils/json-utils";

type DirectusAuthTokens = {
	accessToken: string;
	refreshToken: string;
	expiresMs?: number;
};

type DirectusMe = {
	id?: string;
	email?: string;
	first_name?: string;
	last_name?: string;
	role?: string | { id?: string; name?: string };
	avatarId?: string;
};

export type PublicUserInfo = {
	id: string;
	email: string;
	name: string;
	avatarUrl?: string;
};

export const DIRECTUS_REFRESH_COOKIE_NAME = "mizuki_directus_refresh";

export function getCookieOptions(): AstroCookieSetOptions {
	const isProd = import.meta.env.PROD;
	return {
		httpOnly: true,
		secure: isProd,
		sameSite: "lax" as const,
		path: "/",
		maxAge: 60 * 60 * 24 * 30,
	};
}

export function getDirectusUrl(): string {
	const url = process.env.DIRECTUS_URL || import.meta.env.DIRECTUS_URL || "";
	if (!url.trim()) {
		throw new Error("DIRECTUS_URL 未配置");
	}
	return url.trim().replace(/\/+$/, "");
}

function extractDirectusFileId(
	value: JsonValue | undefined,
): string | undefined {
	if (typeof value === "string" && value.trim()) {
		return value.trim();
	}
	if (value && isJsonObject(value)) {
		const id = getJsonString(value, "id");
		if (id && id.trim()) {
			return id.trim();
		}
	}
	return undefined;
}

export function buildDirectusAssetUrl(
	fileId: string,
	options?: {
		width?: number;
		height?: number;
		fit?: string;
		quality?: number;
	},
): string {
	const baseUrl = getDirectusUrl();
	const url = new URL(`assets/${fileId}`, `${baseUrl}/`);

	if (options?.width) {
		url.searchParams.set("width", String(options.width));
	}
	if (options?.height) {
		url.searchParams.set("height", String(options.height));
	}
	if (options?.fit) {
		url.searchParams.set("fit", options.fit);
	}
	if (options?.quality) {
		url.searchParams.set("quality", String(options.quality));
	}

	return url.href;
}

function unwrapDirectusData(value: JsonValue): JsonValue {
	if (isJsonObject(value) && "data" in value) {
		return value.data;
	}
	return value;
}

async function directusFetchText(
	pathname: string,
	init: RequestInit,
): Promise<string> {
	const baseUrl = getDirectusUrl();
	const normalizedPathname = pathname.replace(/^\/+/, "");
	const url = new URL(normalizedPathname, `${baseUrl}/`);

	const response = await fetch(url, init);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`Directus 请求失败 (${response.status}) ${response.statusText}: ${text}`,
		);
	}

	return text;
}

async function directusFetchJson(
	pathname: string,
	init: RequestInit,
): Promise<JsonValue> {
	const text = await directusFetchText(pathname, init);
	if (!text) {
		throw new Error("Directus 响应体为空");
	}
	return JSON.parse(text) as JsonValue;
}

function parseExpiresMs(value: JsonValue | undefined): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return undefined;
}

function parseTokens(payload: JsonValue): DirectusAuthTokens {
	const dataValue = unwrapDirectusData(payload);
	if (!isJsonObject(dataValue)) {
		throw new Error("Directus 登录/刷新响应不是对象");
	}

	const accessToken = getJsonString(dataValue, "access_token") ?? "";
	const refreshToken = getJsonString(dataValue, "refresh_token") ?? "";

	const expiresRaw =
		dataValue.expires ?? dataValue.expires_in ?? dataValue.expires_at;

	if (!accessToken || !refreshToken) {
		throw new Error("Directus 登录/刷新响应缺少 token");
	}

	const expiresMs = parseExpiresMs(expiresRaw);

	return { accessToken, refreshToken, expiresMs };
}

export async function directusLogin(params: {
	email: string;
	password: string;
}): Promise<DirectusAuthTokens> {
	const payload = await directusFetchJson("/auth/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			email: params.email,
			password: params.password,
			mode: "json",
		}),
	});
	return parseTokens(payload);
}

export async function directusRefresh(params: {
	refreshToken: string;
}): Promise<DirectusAuthTokens> {
	const payload = await directusFetchJson("/auth/refresh", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			refresh_token: params.refreshToken,
			mode: "json",
		}),
	});
	return parseTokens(payload);
}

export async function directusLogout(params: {
	refreshToken: string;
}): Promise<void> {
	await directusFetchText("/auth/logout", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			refresh_token: params.refreshToken,
		}),
	});
}

export async function directusGetMe(params: {
	accessToken: string;
}): Promise<DirectusMe> {
	const payload = await directusFetchJson(
		"/users/me?fields=id,email,first_name,last_name,avatar,role",
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${params.accessToken}`,
				Accept: "application/json",
			},
		},
	);
	const raw = unwrapDirectusData(payload);
	const data: JsonObject = isJsonObject(raw) ? raw : {};

	const idValue = data.id;
	const id =
		typeof idValue === "string" && idValue.trim()
			? idValue
			: typeof idValue === "number"
				? String(idValue)
				: undefined;

	const email = getJsonString(data, "email");
	const first_name = getJsonString(data, "first_name");
	const last_name = getJsonString(data, "last_name");

	const roleValue = data.role;
	const role: DirectusMe["role"] | undefined =
		typeof roleValue === "string"
			? roleValue
			: isJsonObject(roleValue)
				? {
						id: getJsonString(roleValue, "id"),
						name: getJsonString(roleValue, "name"),
					}
				: undefined;
	return {
		id,
		email: email && email.trim() ? email : undefined,
		first_name: first_name && first_name.trim() ? first_name : undefined,
		last_name: last_name && last_name.trim() ? last_name : undefined,
		role,
		avatarId: extractDirectusFileId(data.avatar),
	};
}

export function pickPublicUserInfo(me: DirectusMe): PublicUserInfo {
	const name = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
	return {
		id: me.id ?? "",
		email: me.email ?? "",
		name: name || me.email || "Member",
		avatarUrl: me.avatarId
			? buildDirectusAssetUrl(me.avatarId, {
					width: 128,
					height: 128,
					fit: "cover",
				})
			: undefined,
	};
}

export function getClientIp(headers: Headers): string {
	const forwarded = headers.get("x-forwarded-for") || "";
	if (forwarded) {
		return forwarded.split(",")[0]?.trim() || "unknown";
	}
	return (
		headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "unknown"
	);
}

type RateLimitRecord = { count: number; resetAt: number };
const loginRateLimit = new Map<string, RateLimitRecord>();

export type LoginRateLimitResult =
	| { ok: true; remaining: number; resetAt: number }
	| { ok: false; remaining: 0; resetAt: number };

export function checkLoginRateLimit(
	ip: string,
	options?: { limit?: number; windowMs?: number },
): LoginRateLimitResult {
	const limit = options?.limit ?? 10;
	const windowMs = options?.windowMs ?? 5 * 60 * 1000;

	const now = Date.now();
	const existing = loginRateLimit.get(ip);
	if (!existing || existing.resetAt <= now) {
		loginRateLimit.set(ip, { count: 1, resetAt: now + windowMs });
		return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
	}

	if (existing.count >= limit) {
		return { ok: false, remaining: 0, resetAt: existing.resetAt };
	}

	existing.count += 1;
	loginRateLimit.set(ip, existing);
	return {
		ok: true,
		remaining: Math.max(0, limit - existing.count),
		resetAt: existing.resetAt,
	};
}
