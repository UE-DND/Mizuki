import { defineMiddleware } from "astro:middleware";

import { assertRequiredEnv } from "@/server/env/required";
import { getResolvedSiteSettings } from "@/server/site-settings/service";

function buildEnvErrorResponse(pathname: string): Response {
	const isApiRequest = pathname.startsWith("/api/");
	if (isApiRequest) {
		return new Response(
			JSON.stringify({
				ok: false,
				message: "服务端配置缺失，请联系管理员",
				code: "SERVER_ENV_MISSING",
			}),
			{
				status: 500,
				headers: {
					"content-type": "application/json; charset=utf-8",
				},
			},
		);
	}

	return new Response("服务端配置缺失，请联系管理员", {
		status: 500,
		headers: {
			"content-type": "text/plain; charset=utf-8",
		},
	});
}

export const onRequest = defineMiddleware(async (context, next) => {
	try {
		assertRequiredEnv();
	} catch (error) {
		console.error("[middleware] required env validation failed:", error);
		return buildEnvErrorResponse(context.url.pathname);
	}

	try {
		context.locals.siteSettings = await getResolvedSiteSettings();
	} catch (error) {
		console.error("[middleware] failed to load site settings:", error);
	}

	return await next();
});
