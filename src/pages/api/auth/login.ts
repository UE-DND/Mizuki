import type { APIContext } from "astro";
import {
	checkLoginRateLimit,
	directusGetMe,
	directusLogin,
	DIRECTUS_REFRESH_COOKIE_NAME,
	getClientIp,
	getCookieOptions,
	pickPublicUserInfo,
} from "../../../server/directus-auth";

export const prerender = false;

function json(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...(init?.headers ?? {}),
		},
	});
}

export async function POST(context: APIContext) {
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

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ ok: false, message: "请求体不是合法 JSON" },
			{ status: 400 },
		);
	}

	const rawEmail =
		body && typeof body === "object" && "email" in body
			? (body as Record<string, unknown>).email
			: "";
	const rawPassword =
		body && typeof body === "object" && "password" in body
			? (body as Record<string, unknown>).password
			: "";

	const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
	const password = typeof rawPassword === "string" ? rawPassword : "";

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
			getCookieOptions(),
		);

		let user: {
			id: string;
			email: string;
			name: string;
			avatarUrl?: string;
		} = {
			id: "",
			email,
			name: email,
		};
		try {
			const me = await directusGetMe({ accessToken: tokens.accessToken });
			user = pickPublicUserInfo(me);
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
