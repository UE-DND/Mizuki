import type { APIContext } from "astro";
import {
	directusGetMe,
	directusRefresh,
	DIRECTUS_REFRESH_COOKIE_NAME,
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

function clearAuthCookie(cookies: APIContext["cookies"]) {
	try {
		cookies.delete(DIRECTUS_REFRESH_COOKIE_NAME, { path: "/" });
	} catch {
		// fallback
		cookies.set(DIRECTUS_REFRESH_COOKIE_NAME, "", {
			...getCookieOptions(),
			maxAge: 0,
		});
	}
}

export async function GET(context: APIContext) {
	const { cookies } = context;
	const refreshToken = cookies.get(DIRECTUS_REFRESH_COOKIE_NAME)?.value || "";
	if (!refreshToken) {
		return json({ ok: false, message: "未登录" }, { status: 401 });
	}

	try {
		const tokens = await directusRefresh({ refreshToken });
		cookies.set(
			DIRECTUS_REFRESH_COOKIE_NAME,
			tokens.refreshToken,
			getCookieOptions(),
		);

		const me = await directusGetMe({ accessToken: tokens.accessToken });
		return json({ ok: true, user: pickPublicUserInfo(me) });
	} catch (error) {
		clearAuthCookie(cookies);
		const message = String(error?.message ?? error);
		const status = message.includes("(401)") ? 401 : 500;
		return json(
			{
				ok: false,
				message: status === 401 ? "登录已失效" : "获取用户信息失败",
			},
			{ status },
		);
	}
}
