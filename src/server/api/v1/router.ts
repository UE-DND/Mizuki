import type { APIContext } from "astro";

import { fail, ok } from "@/server/api/response";
import { withErrorHandler } from "@/server/middleware/error-handler";

import {
	handleAdminContent,
	handleAdminRegistrationRequests,
	handleAdminSettings,
	handleAdminUsers,
} from "./admin";
import { handleArticleComments, handleDiaryComments } from "./comments";
import { handleMe } from "./me";
import { handlePublic, handleUserHome } from "./public";
import { assertSameOrigin, isWriteMethod, parseSegments } from "./shared";
import { handleUploads } from "./uploads";

async function handleV1Inner(context: APIContext): Promise<Response> {
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
		if (segments[1] === "registration-requests") {
			return await handleAdminRegistrationRequests(
				context,
				segments.slice(1),
			);
		}
		if (segments[1] === "content") {
			return await handleAdminContent(context, segments.slice(1));
		}
		if (segments[1] === "settings") {
			return await handleAdminSettings(context, segments.slice(1));
		}
	}

	return fail("未找到接口", 404);
}

export const handleV1 = withErrorHandler(handleV1Inner);
