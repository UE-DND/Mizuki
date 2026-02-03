type DirectusAuthTokens = {
	accessToken: string;
	refreshToken: string;
	expiresMs?: number;
};

type DirectusTokenPayload = {
	access_token?: unknown;
	refresh_token?: unknown;
	expires?: unknown;
	expires_in?: unknown;
	expires_at?: unknown;
};

type DirectusMe = {
	id?: string;
	email?: string;
	first_name?: string;
	last_name?: string;
	role?: string | { id?: string; name?: string };
	avatarId?: string;
};

export const DIRECTUS_REFRESH_COOKIE_NAME = "mizuki_directus_refresh";

export function getCookieOptions() {
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

function extractDirectusFileId(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) {
		return value.trim();
	}
	if (value && typeof value === "object" && "id" in value) {
		const id = (value as { id?: unknown }).id;
		if (typeof id === "string" && id.trim()) {
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

function getJsonData(value: unknown) {
	if (value && typeof value === "object" && "data" in value) {
		return (value as { data: unknown }).data;
	}
	return value;
}

async function directusFetchJson<T>(
	pathname: string,
	init: RequestInit,
): Promise<T> {
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

	if (!text) {
		// @ts-expect-error allow empty body for logout etc.
		return null;
	}

	return JSON.parse(text) as T;
}

function parseTokens(payload: unknown): DirectusAuthTokens {
	const data = getJsonData(payload) as DirectusTokenPayload;
	const accessToken =
		typeof data?.access_token === "string" ? data.access_token : "";
	const refreshToken =
		typeof data?.refresh_token === "string" ? data.refresh_token : "";
	const expiresRaw =
		data?.expires ?? data?.expires_in ?? data?.expires_at ?? null;

	if (!accessToken || !refreshToken) {
		throw new Error("Directus 登录/刷新响应缺少 token");
	}

	let expiresMs: number | undefined;
	if (typeof expiresRaw === "number") {
		expiresMs = expiresRaw;
	} else if (typeof expiresRaw === "string") {
		const parsed = Number(expiresRaw);
		if (!Number.isNaN(parsed)) {
			expiresMs = parsed;
		}
	}

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
	await directusFetchJson("/auth/logout", {
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
	const raw = getJsonData(payload);
	const data =
		raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		id:
			data.id !== undefined && data.id !== null
				? String(data.id)
				: undefined,
		email:
			typeof data.email === "string" && data.email.trim()
				? data.email
				: undefined,
		first_name:
			typeof data.first_name === "string" && data.first_name.trim()
				? data.first_name
				: undefined,
		last_name:
			typeof data.last_name === "string" && data.last_name.trim()
				? data.last_name
				: undefined,
		role: data.role as DirectusMe["role"],
		avatarId: extractDirectusFileId(data.avatar),
	};
}

export function pickPublicUserInfo(me: DirectusMe) {
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

export function checkLoginRateLimit(
	ip: string,
	options?: { limit?: number; windowMs?: number },
) {
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
