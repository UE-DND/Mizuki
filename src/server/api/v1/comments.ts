import type { APIContext } from "astro";

import type { JsonObject } from "@/types/json";
import { assertCan, assertOwnerOrAdmin } from "@/server/auth/acl";
import {
	createOne,
	deleteOne,
	readMany,
	readOneById,
	updateOne,
} from "@/server/directus/client";
import { fail, ok } from "@/server/api/response";
import {
	parseJsonBody,
	toBooleanValue,
	toOptionalString,
} from "@/server/api/utils";

import {
	buildCommentTree,
	hasOwn,
	parseBodyCommentStatus,
	parseBodyTextField,
	parseRouteId,
	requireAccess,
} from "./shared";
import { getAuthorBundle } from "./shared/author-cache";

async function handleArticleComments(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (segments.length === 3 && segments[2] === "comments") {
		const articleId = parseRouteId(segments[1]);
		if (!articleId) {
			return fail("缺少文章 ID", 400);
		}

		if (context.request.method === "GET") {
			const article = await readOneById("app_articles", articleId);
			if (!article) {
				return fail("文章不存在", 404);
			}
			if (!(article.status === "published" && article.is_public)) {
				return fail("文章不可见", 404);
			}

			const comments = await readMany("app_article_comments", {
				filter: {
					_and: [
						{ article_id: { _eq: articleId } },
						{ status: { _eq: "published" } },
						{ is_public: { _eq: true } },
					],
				} as JsonObject,
				sort: ["date_created"],
				limit: 200,
			});

			const authorIds = Array.from(
				new Set(comments.map((item) => item.author_id)),
			);
			const authorMap = await getAuthorBundle(authorIds);
			const tree = buildCommentTree(comments, authorMap);
			return ok({
				items: tree,
				total: comments.length,
			});
		}

		if (context.request.method === "POST") {
			const required = await requireAccess(context);
			if ("response" in required) {
				return required.response;
			}
			const access = required.access;
			assertCan(access, "can_comment_articles");

			const article = await readOneById("app_articles", articleId);
			if (!article) {
				return fail("文章不存在", 404);
			}
			if (!article.allow_comments) {
				return fail("该文章已关闭评论", 403);
			}

			const body = await parseJsonBody(context.request);
			const text = parseBodyTextField(body, "body");
			if (!text) {
				return fail("评论内容不能为空", 400);
			}
			const parentId = toOptionalString(body.parent_id);
			if (parentId) {
				const parent = await readOneById(
					"app_article_comments",
					parentId,
				);
				if (!parent || parent.article_id !== articleId) {
					return fail("父评论不存在", 404);
				}
				if (parent.parent_id) {
					return fail("仅支持二级回复", 400);
				}
			}

			const created = await createOne("app_article_comments", {
				status: parseBodyCommentStatus(body, "status", "published"),
				article_id: articleId,
				author_id: access.user.id,
				parent_id: parentId,
				body: text,
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			});
			return ok({
				item: {
					...created,
					body: created.body,
				},
			});
		}
	}

	if (segments.length === 3 && segments[1] === "comments") {
		const commentId = parseRouteId(segments[2]);
		if (!commentId) {
			return fail("缺少评论 ID", 400);
		}
		const required = await requireAccess(context);
		if ("response" in required) {
			return required.response;
		}
		const access = required.access;
		const comment = await readOneById("app_article_comments", commentId);
		if (!comment) {
			return fail("评论不存在", 404);
		}
		assertOwnerOrAdmin(access, comment.author_id);

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "body")) {
				payload.body = parseBodyTextField(body, "body");
			}
			if (hasOwn(body, "status")) {
				payload.status = parseBodyCommentStatus(
					body,
					"status",
					comment.status,
				);
			}
			if (hasOwn(body, "is_public")) {
				payload.is_public = toBooleanValue(
					body.is_public,
					comment.is_public,
				);
			}
			if (hasOwn(body, "show_on_profile")) {
				payload.show_on_profile = toBooleanValue(
					body.show_on_profile,
					comment.show_on_profile,
				);
			}
			const updated = await updateOne(
				"app_article_comments",
				commentId,
				payload,
			);
			return ok({
				item: {
					...updated,
					body: updated.body,
				},
			});
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_article_comments", commentId);
			return ok({ id: commentId });
		}
	}

	return fail("未找到接口", 404);
}

async function handleDiaryComments(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (segments.length === 3 && segments[2] === "comments") {
		const diaryId = parseRouteId(segments[1]);
		if (!diaryId) {
			return fail("缺少日记 ID", 400);
		}

		if (context.request.method === "GET") {
			const diary = await readOneById("app_diaries", diaryId);
			if (!diary) {
				return fail("日记不存在", 404);
			}
			if (!(diary.status === "published" && diary.is_public)) {
				return fail("日记不可见", 404);
			}

			const comments = await readMany("app_diary_comments", {
				filter: {
					_and: [
						{ diary_id: { _eq: diaryId } },
						{ status: { _eq: "published" } },
						{ is_public: { _eq: true } },
					],
				} as JsonObject,
				sort: ["date_created"],
				limit: 200,
			});

			const authorIds = Array.from(
				new Set(comments.map((item) => item.author_id)),
			);
			const authorMap = await getAuthorBundle(authorIds);
			const tree = buildCommentTree(comments, authorMap);
			return ok({
				items: tree,
				total: comments.length,
			});
		}

		if (context.request.method === "POST") {
			const required = await requireAccess(context);
			if ("response" in required) {
				return required.response;
			}
			const access = required.access;
			assertCan(access, "can_comment_diaries");

			const diary = await readOneById("app_diaries", diaryId);
			if (!diary) {
				return fail("日记不存在", 404);
			}
			if (!diary.allow_comments) {
				return fail("该日记已关闭评论", 403);
			}

			const body = await parseJsonBody(context.request);
			const text = parseBodyTextField(body, "body");
			if (!text) {
				return fail("评论内容不能为空", 400);
			}
			const parentId = toOptionalString(body.parent_id);
			if (parentId) {
				const parent = await readOneById(
					"app_diary_comments",
					parentId,
				);
				if (!parent || parent.diary_id !== diaryId) {
					return fail("父评论不存在", 404);
				}
				if (parent.parent_id) {
					return fail("仅支持二级回复", 400);
				}
			}

			const created = await createOne("app_diary_comments", {
				status: parseBodyCommentStatus(body, "status", "published"),
				diary_id: diaryId,
				author_id: access.user.id,
				parent_id: parentId,
				body: text,
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			});
			return ok({
				item: {
					...created,
					body: created.body,
				},
			});
		}
	}

	if (segments.length === 3 && segments[1] === "comments") {
		const commentId = parseRouteId(segments[2]);
		if (!commentId) {
			return fail("缺少评论 ID", 400);
		}
		const required = await requireAccess(context);
		if ("response" in required) {
			return required.response;
		}
		const access = required.access;
		const comment = await readOneById("app_diary_comments", commentId);
		if (!comment) {
			return fail("评论不存在", 404);
		}
		assertOwnerOrAdmin(access, comment.author_id);

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "body")) {
				payload.body = parseBodyTextField(body, "body");
			}
			if (hasOwn(body, "status")) {
				payload.status = parseBodyCommentStatus(
					body,
					"status",
					comment.status,
				);
			}
			if (hasOwn(body, "is_public")) {
				payload.is_public = toBooleanValue(
					body.is_public,
					comment.is_public,
				);
			}
			if (hasOwn(body, "show_on_profile")) {
				payload.show_on_profile = toBooleanValue(
					body.show_on_profile,
					comment.show_on_profile,
				);
			}
			const updated = await updateOne(
				"app_diary_comments",
				commentId,
				payload,
			);
			return ok({
				item: {
					...updated,
					body: updated.body,
				},
			});
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_diary_comments", commentId);
			return ok({ id: commentId });
		}
	}

	return fail("未找到接口", 404);
}

export { handleArticleComments, handleDiaryComments };
