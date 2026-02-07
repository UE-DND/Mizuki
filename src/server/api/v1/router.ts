import type { APIContext } from "astro";

import { fail, ok } from "@/server/api/response";

import { handleAdminContent, handleAdminUsers } from "./admin";
import { handleArticleComments, handleDiaryComments } from "./comments";
import { handleMe } from "./me";
import { handlePublic, handleUserHome } from "./public";
import {
	assertSameOrigin,
	isWriteMethod,
	parseSegments,
	toErrorResponse,
} from "./shared";
import { handleUploads } from "./uploads";

export async function handleV1(context: APIContext): Promise<Response> {
	try {
		if (isWriteMethod(context.request.method)) {
			const denied = assertSameOrigin(context);
			if (denied) {
				return denied;
			}
		}

		const segments = parseSegments(context);
		if (segments.length === 0) {
			return ok({ message: "ok" });
		}

		if (segments[0] === "public") {
			return await handlePublic(context, segments);
		}

		if (segments[0] === "users") {
			return await handleUserHome(context, segments);
		}

		if (segments[0] === "me") {
			return await handleMe(context, segments.slice(1));
		}

		if (segments[0] === "articles") {
			return await handleArticleComments(context, segments);
		}

		if (segments[0] === "diaries") {
			return await handleDiaryComments(context, segments);
		}

		if (segments[0] === "uploads") {
			return await handleUploads(context);
		}

		if (segments[0] === "admin") {
			if (segments[1] === "users") {
				return await handleAdminUsers(context, segments.slice(1));
			}
			if (segments[1] === "content") {
				return await handleAdminContent(context, segments.slice(1));
			}
		}

		return fail("未找到接口", 404);
	} catch (error) {
		return toErrorResponse(error, context);
	}
}
