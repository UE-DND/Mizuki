import type { APIContext } from "astro";
import {
	checkLoginRateLimit,
	DIRECTUS_ACCESS_COOKIE_NAME,
	directusGetMe,
	directusLogin,
	DIRECTUS_REFRESH_COOKIE_NAME,
	getClientIp,
	getCookieOptions,
	pickPublicUserInfo,
	resolveAccessTokenMaxAgeSeconds,
	type PublicUserInfo,
} from "../../../server/directus-auth";
import type { JsonObject, JsonValue } from "../../../types/json";
import { getJsonString, isJsonObject } from "../../../utils/json-utils";

export const prerender = false;

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

	const ip = getClientIp(request.headers);
	const rate = checkLoginRateLimit(ip);
	if (!rate.ok) {
		return json(
			{ ok: false, message: "请求过于频繁，请稍后再试" },
			{ status: 429 },
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

		return json({ ok: true, user });
	} catch (error) {
		const message = String(error?.message ?? error);
		const status = message.includes("(401)") ? 401 : 500;
		return json(
			{
				ok: false,
				message: status === 401 ? "邮箱或密码错误" : "登录失败",
			},
			{ status },
		);
	}
}
