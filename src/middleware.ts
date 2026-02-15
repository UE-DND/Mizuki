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
	// 1. 生成/复用请求 ID
	const upstreamId = context.request.headers.get("x-request-id");
	const requestId =
		upstreamId && upstreamId.length <= 128
			? upstreamId
			: crypto.randomUUID();
	context.locals.requestId = requestId;

	// 2. 环境变量校验
	try {
		assertRequiredEnv();
	} catch (error) {
		console.error("[middleware] required env validation failed:", error);
		return buildEnvErrorResponse(context.url.pathname);
	}

	// 3. 加载站点设置
	try {
		context.locals.siteSettings = await getResolvedSiteSettings();
	} catch (error) {
		console.error("[middleware] failed to load site settings:", error);
	}

	// 4. 执行后续处理
	const response = await next();

	// 5. 响应头附加 requestId
	response.headers.set("X-Request-ID", requestId);
	return response;
});
