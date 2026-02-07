import type { APIContext } from "astro";
import {
	DirectusAuthError,
	DIRECTUS_ACCESS_COOKIE_NAME,
	directusGetMe,
	directusLogin,
	DIRECTUS_REFRESH_COOKIE_NAME,
	getCookieOptions,
	pickPublicUserInfo,
	resolveAccessTokenMaxAgeSeconds,
	type PublicUserInfo,
} from "../../../server/directus-auth";
import { checkLoginRateLimitDistributed } from "../../../server/security/login-rate-limit";
import type { JsonObject, JsonValue } from "../../../types/json";
import { getJsonString, isJsonObject } from "../../../utils/json-utils";

export const prerender = false;

function resolveTrustedClientIp(headers: Headers): string {
	const vercelForwarded = headers.get("x-vercel-forwarded-for");
	if (vercelForwarded) {
		return vercelForwarded.split(",")[0]?.trim() || "unknown";
	}

	const cloudflare = headers.get("cf-connecting-ip");
	if (cloudflare) {
		return cloudflare.trim();
	}

	const realIp = headers.get("x-real-ip");
	if (realIp) {
		return realIp.trim();
	}

	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) {
		return forwarded.split(",")[0]?.trim() || "unknown";
	}

	return "unknown";
}

function json<T>(data: T, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...(init?.headers ?? {}),
		},
	});
}

export async function POST(context: APIContext): Promise<Response> {
	const { request, cookies, url } = context;

	const origin = request.headers.get("origin");
	if (origin && origin !== url.origin) {
		return json({ ok: false, message: "非法来源请求" }, { status: 403 });
	}

	const ip = resolveTrustedClientIp(request.headers);
	let rate: Awaited<ReturnType<typeof checkLoginRateLimitDistributed>>;
	try {
		rate = await checkLoginRateLimitDistributed(ip);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("UPSTASH_RATE_LIMIT_NOT_CONFIGURED")
		) {
			return json(
				{ ok: false, message: "登录限流服务未配置" },
				{ status: 500 },
			);
		}
		console.error("[api/auth/login] rate limit failed:", error);
		return json({ ok: false, message: "限流检查失败" }, { status: 500 });
	}
	if (!rate.ok) {
		const retryAfter = Math.max(
			1,
			Math.ceil((rate.resetAt - Date.now()) / 1000),
		);
		return json(
			{ ok: false, message: "请求过于频繁，请稍后再试" },
			{
				status: 429,
				headers: {
					"Retry-After": String(retryAfter),
					"X-RateLimit-Remaining": "0",
				},
			},
		);
	}

	let body: JsonValue;
	try {
		body = (await request.json()) as JsonValue;
	} catch {
		return json(
			{ ok: false, message: "请求体不是合法 JSON" },
			{ status: 400 },
		);
	}

	const bodyObject: JsonObject = isJsonObject(body) ? body : {};
	const email = (getJsonString(bodyObject, "email") ?? "").trim();
	const password = getJsonString(bodyObject, "password") ?? "";

	if (!email || !password) {
		return json(
			{ ok: false, message: "请填写邮箱与密码" },
			{ status: 400 },
		);
	}

	try {
		const tokens = await directusLogin({ email, password });
		cookies.set(
			DIRECTUS_REFRESH_COOKIE_NAME,
			tokens.refreshToken,
			getCookieOptions({
				requestUrl: url,
			}),
		);
		cookies.set(
			DIRECTUS_ACCESS_COOKIE_NAME,
			tokens.accessToken,
			getCookieOptions({
				requestUrl: url,
				maxAge: resolveAccessTokenMaxAgeSeconds(tokens.expiresMs),
			}),
		);

		let user: PublicUserInfo = {
			id: "",
			email,
			name: email,
		};
		try {
			const me = await directusGetMe({ accessToken: tokens.accessToken });
			const picked = pickPublicUserInfo(me);
			user = {
				id: picked.id || user.id,
				email: picked.email || user.email,
				name: picked.name || user.name,
				avatarUrl: picked.avatarUrl || user.avatarUrl,
			};
		} catch {
			// 若 /users/me 失败，不影响登录态写入，前台可再调用 /api/auth/me
		}

		return json(
			{ ok: true, user },
			{
				headers: {
					"X-RateLimit-Remaining": String(rate.remaining),
				},
			},
		);
	} catch (error) {
		const status =
			error instanceof DirectusAuthError && error.directusStatus === 401
				? 401
				: 500;
		return json(
			{
				ok: false,
				message: status === 401 ? "邮箱或密码错误" : "登录失败",
			},
			{ status },
		);
	}
}
