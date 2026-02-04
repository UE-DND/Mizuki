import type { APIContext } from "astro";
import {
	directusLogout,
	DIRECTUS_REFRESH_COOKIE_NAME,
	getCookieOptions,
} from "../../../server/directus-auth";

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

function clearAuthCookie(cookies: APIContext["cookies"]) {
	try {
		cookies.delete(DIRECTUS_REFRESH_COOKIE_NAME, { path: "/" });
	} catch {
		cookies.set(DIRECTUS_REFRESH_COOKIE_NAME, "", {
			...getCookieOptions(),
			maxAge: 0,
		});
	}
}

export async function POST(context: APIContext): Promise<Response> {
	const { request, cookies, url } = context;

	const origin = request.headers.get("origin");
	if (origin && origin !== url.origin) {
		return json({ ok: false, message: "非法来源请求" }, { status: 403 });
	}

	const refreshToken = cookies.get(DIRECTUS_REFRESH_COOKIE_NAME)?.value || "";

	if (refreshToken) {
		try {
			await directusLogout({ refreshToken });
		} catch {
			// token 可能已过期/被轮换，仍然清理本地 cookie
		}
	}

	clearAuthCookie(cookies);
	return json({ ok: true });
}
