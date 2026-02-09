import type { APIContext } from "astro";

import type { AppAlbum, AppArticle, AppDiary } from "@/types/app";
import type { JsonObject } from "@/types/json";
import {
	assertCan,
	assertOwnerOrAdmin,
	updateProfileUsername,
} from "@/server/auth/acl";
import { validateDisplayName } from "@/server/auth/username";
import {
	createOne,
	deleteDirectusFile,
	deleteOne,
	readMany,
	readOneById,
	updateDirectusUser,
	updateOne,
} from "@/server/directus/client";
import { fail, ok } from "@/server/api/response";
import {
	parseJsonBody,
	parsePagination,
	toBooleanValue,
	toNumberValue,
	toOptionalString,
	toStringArray,
} from "@/server/api/utils";

import type { AppAccess } from "./shared";
import {
	normalizeAlbumLayout,
	normalizeReportReason,
	normalizeReportTargetType,
	normalizeStatus,
	normalizeWatchStatus,
	nowIso,
	parseBodyStatus,
	parseBodyTextField,
	parseSocialLinks,
	parseProfileBioField,
	parseRouteId,
	parseVisibilityPatch,
	requireAccess,
	safeCsv,
	sanitizeSlug,
	toSpecialArticleSlug,
	hasOwn,
} from "./shared";
import { invalidateAuthorCache } from "./shared/author-cache";
import { generateShortId } from "@/server/utils/short-id";

async function handleMeProfile(
	context: APIContext,
	access: AppAccess,
): Promise<Response> {
	if (context.request.method === "GET") {
		return ok({
			profile: access.profile,
		});
	}

	if (context.request.method === "PATCH") {
		const body = await parseJsonBody(context.request);
		const payload: JsonObject = {};
		const hasAvatarFilePatch = hasOwn(body, "avatar_file");
		const hasAvatarUrlPatch = hasOwn(body, "avatar_url");
		const prevAvatarFile = access.profile.avatar_file;
		let nextAvatarFile = prevAvatarFile;
		let nextAvatarUrl = access.profile.avatar_url;
		if (hasOwn(body, "bio")) {
			payload.bio = parseProfileBioField(body.bio);
		}
		if (hasAvatarFilePatch) {
			nextAvatarFile = toOptionalString(body.avatar_file);
			payload.avatar_file = nextAvatarFile;
		}
		if (hasAvatarUrlPatch) {
			nextAvatarUrl = toOptionalString(body.avatar_url);
			payload.avatar_url = nextAvatarUrl;
		}
		if (hasOwn(body, "profile_public")) {
			payload.profile_public = toBooleanValue(body.profile_public, true);
		}

		if (hasOwn(body, "username")) {
			const username = parseBodyTextField(body, "username");
			const normalized = await updateProfileUsername(
				access.profile.id,
				username,
			);
			payload.username = normalized;
		}
		if (hasOwn(body, "display_name")) {
			payload.display_name = validateDisplayName(
				parseBodyTextField(body, "display_name"),
			);
		}
		if (hasOwn(body, "social_links")) {
			payload.social_links = parseSocialLinks(body.social_links);
		}

		const updated = await updateOne(
			"app_user_profiles",
			access.profile.id,
			payload,
		);
		// 头像文件发生变更时，删除旧文件避免孤立资源
		if (
			hasAvatarFilePatch &&
			prevAvatarFile &&
			prevAvatarFile !== nextAvatarFile
		) {
			await deleteDirectusFile(prevAvatarFile);
		}
		if (
			(hasAvatarFilePatch || hasAvatarUrlPatch) &&
			!nextAvatarFile &&
			!nextAvatarUrl
		) {
			await updateDirectusUser(access.user.id, { avatar: null });
		}
		invalidateAuthorCache(access.user.id);
		return ok({ profile: updated });
	}

	return fail("方法不允许", 405);
}

async function handleMePrivacy(
	context: APIContext,
	access: AppAccess,
): Promise<Response> {
	if (context.request.method === "GET") {
		const profile = access.profile;
		return ok({
			privacy: {
				profile_public: profile.profile_public,
				show_articles_on_profile: profile.show_articles_on_profile,
				show_diaries_on_profile: profile.show_diaries_on_profile,
				show_anime_on_profile: profile.show_anime_on_profile,
				show_albums_on_profile: profile.show_albums_on_profile,
				show_comments_on_profile: profile.show_comments_on_profile,
			},
		});
	}

	if (context.request.method === "PATCH") {
		const body = await parseJsonBody(context.request);
		const updated = await updateOne(
			"app_user_profiles",
			access.profile.id,
			{
				profile_public: toBooleanValue(
					body.profile_public,
					access.profile.profile_public,
				),
				show_articles_on_profile: toBooleanValue(
					body.show_articles_on_profile,
					access.profile.show_articles_on_profile,
				),
				show_diaries_on_profile: toBooleanValue(
					body.show_diaries_on_profile,
					access.profile.show_diaries_on_profile,
				),
				show_anime_on_profile: toBooleanValue(
					body.show_anime_on_profile,
					access.profile.show_anime_on_profile,
				),
				show_albums_on_profile: toBooleanValue(
					body.show_albums_on_profile,
					access.profile.show_albums_on_profile,
				),
				show_comments_on_profile: toBooleanValue(
					body.show_comments_on_profile,
					access.profile.show_comments_on_profile,
				),
			},
		);
		return ok({ privacy: updated });
	}

	return fail("方法不允许", 405);
}

async function handleMePermissions(
	context: APIContext,
	access: AppAccess,
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}
	return ok({
		permissions: access.permissions,
		is_admin: access.isAdmin,
	});
}

async function handleMeBlocks(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 1) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const rows = await readMany("app_user_blocks", {
				filter: {
					_and: [
						{ blocker_id: { _eq: access.user.id } },
						{ status: { _eq: "published" } },
					],
				} as JsonObject,
				sort: ["-date_created"],
				limit,
				offset,
			});
			return ok({
				items: rows,
				page,
				limit,
				total: rows.length,
			});
		}

		if (context.request.method === "POST") {
			const body = await parseJsonBody(context.request);
			const blockedUserId = parseBodyTextField(body, "blocked_user_id");
			if (!blockedUserId) {
				return fail("缺少被屏蔽用户 ID", 400);
			}
			if (blockedUserId === access.user.id) {
				return fail("不能屏蔽自己", 400);
			}

			const existing = await readMany("app_user_blocks", {
				filter: {
					_and: [
						{ blocker_id: { _eq: access.user.id } },
						{ blocked_user_id: { _eq: blockedUserId } },
						{ status: { _eq: "published" } },
					],
				} as JsonObject,
				limit: 1,
			});
			if (existing.length > 0) {
				return ok({ item: existing[0], existed: true });
			}

			const created = await createOne("app_user_blocks", {
				status: "published",
				blocker_id: access.user.id,
				blocked_user_id: blockedUserId,
				reason: toOptionalString(body.reason),
				note: toOptionalString(body.note),
			});
			return ok({ item: created, existed: false });
		}
	}

	if (segments.length === 2) {
		const blockId = parseRouteId(segments[1]);
		if (!blockId) {
			return fail("缺少屏蔽记录 ID", 400);
		}
		const block = await readOneById("app_user_blocks", blockId);
		if (!block) {
			return fail("屏蔽记录不存在", 404);
		}
		assertOwnerOrAdmin(access, block.blocker_id);

		if (context.request.method === "DELETE") {
			const updated = await updateOne("app_user_blocks", blockId, {
				status: "archived",
			});
			return ok({ item: updated });
		}
	}

	return fail("未找到接口", 404);
}

export async function handleMe(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	const required = await requireAccess(context);
	if ("response" in required) {
		return required.response;
	}
	const access = required.access;

	if (segments.length >= 1 && segments[0] === "profile") {
		return await handleMeProfile(context, access);
	}
	if (segments.length >= 1 && segments[0] === "privacy") {
		return await handleMePrivacy(context, access);
	}
	if (segments.length >= 1 && segments[0] === "permissions") {
		return await handleMePermissions(context, access);
	}
	if (segments.length >= 1 && segments[0] === "blocks") {
		return await handleMeBlocks(context, access, segments);
	}
	if (segments.length >= 1 && segments[0] === "reports") {
		return await handleMeReports(context, access, segments);
	}
	if (segments.length >= 1 && segments[0] === "article-likes") {
		return await handleMeArticleLikes(context, access, segments);
	}
	if (segments.length >= 1 && segments[0] === "articles") {
		return await handleMeArticles(context, access, segments);
	}
	if (segments.length >= 1 && segments[0] === "diaries") {
		if (segments.length >= 3 && segments[2] === "images") {
			return await handleMeDiaryImages(context, access, segments);
		}
		if (segments.length >= 3 && segments[1] === "images") {
			return await handleMeDiaryImages(context, access, segments);
		}
		return await handleMeDiaries(context, access, segments);
	}
	if (segments.length >= 1 && segments[0] === "anime") {
		return await handleMeAnime(context, access, segments);
	}
	if (segments.length >= 1 && segments[0] === "albums") {
		if (segments.length >= 3 && segments[2] === "photos") {
			return await handleMeAlbumPhotos(context, access, segments);
		}
		if (segments.length >= 3 && segments[1] === "photos") {
			return await handleMeAlbumPhotos(context, access, segments);
		}
		return await handleMeAlbums(context, access, segments);
	}

	return fail("未找到接口", 404);
}

async function handleMeReports(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 1) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const rows = await readMany("app_content_reports", {
				filter: access.isAdmin
					? undefined
					: ({
							reporter_id: { _eq: access.user.id },
						} as JsonObject),
				sort: ["-date_created"],
				limit,
				offset,
			});
			return ok({
				items: rows,
				page,
				limit,
				total: rows.length,
			});
		}

		if (context.request.method === "POST") {
			const body = await parseJsonBody(context.request);
			const targetType = normalizeReportTargetType(
				parseBodyTextField(body, "target_type"),
			);
			const targetId = parseBodyTextField(body, "target_id");
			if (!targetType || !targetId) {
				return fail("举报类型和目标 ID 必填", 400);
			}

			let targetUserId = toOptionalString(body.target_user_id);
			if (targetType === "article") {
				const targetArticle = await readOneById(
					"app_articles",
					targetId,
				);
				if (!targetArticle) {
					return fail("举报目标不存在", 404);
				}
				targetUserId = targetUserId || targetArticle.author_id;
			}
			if (targetType === "diary") {
				const targetDiary = await readOneById("app_diaries", targetId);
				if (!targetDiary) {
					return fail("举报目标不存在", 404);
				}
				targetUserId = targetUserId || targetDiary.author_id;
			}

			const created = await createOne("app_content_reports", {
				status: "published",
				reporter_id: access.user.id,
				target_type: targetType,
				target_id: targetId,
				target_user_id: targetUserId,
				reason: normalizeReportReason(
					parseBodyTextField(body, "reason"),
				),
				detail: toOptionalString(body.detail),
				report_status: "pending",
			});
			return ok({ item: created });
		}
	}

	if (segments.length === 2) {
		const reportId = parseRouteId(segments[1]);
		if (!reportId) {
			return fail("缺少举报记录 ID", 400);
		}
		const report = await readOneById("app_content_reports", reportId);
		if (!report) {
			return fail("举报记录不存在", 404);
		}

		if (context.request.method === "PATCH") {
			if (!access.isAdmin && report.reporter_id !== access.user.id) {
				return fail("权限不足", 403);
			}
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "detail")) {
				payload.detail = toOptionalString(body.detail);
			}
			if (hasOwn(body, "report_status")) {
				const value = parseBodyTextField(body, "report_status");
				if (
					value === "pending" ||
					value === "reviewed" ||
					value === "resolved" ||
					value === "rejected"
				) {
					payload.report_status = value;
				}
			}
			const updated = await updateOne(
				"app_content_reports",
				reportId,
				payload,
			);
			return ok({ item: updated });
		}
	}

	return fail("未找到接口", 404);
}

async function getArticleLikeCount(articleId: string): Promise<number> {
	const likes = await readMany("app_article_likes", {
		filter: {
			_and: [
				{ article_id: { _eq: articleId } },
				{ status: { _eq: "published" } },
			],
		} as JsonObject,
		limit: 5000,
		fields: ["id"],
	});
	return likes.length;
}

async function handleMeArticleLikes(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length !== 1) {
		return fail("未找到接口", 404);
	}

	if (context.request.method === "GET") {
		const { page, limit, offset } = parsePagination(context.url);
		const rows = await readMany("app_article_likes", {
			filter: {
				_and: [
					{ user_id: { _eq: access.user.id } },
					{ status: { _eq: "published" } },
				],
			} as JsonObject,
			sort: ["-date_created"],
			limit,
			offset,
		});
		return ok({
			items: rows,
			page,
			limit,
			total: rows.length,
		});
	}

	if (context.request.method === "POST") {
		const body = await parseJsonBody(context.request);
		const articleId = parseBodyTextField(body, "article_id");
		if (!articleId) {
			return fail("缺少文章 ID", 400);
		}

		const article = await readOneById("app_articles", articleId);
		if (
			!article ||
			!(article.status === "published" && article.is_public)
		) {
			return fail("文章不存在或不可见", 404);
		}

		const existing = await readMany("app_article_likes", {
			filter: {
				_and: [
					{ article_id: { _eq: articleId } },
					{ user_id: { _eq: access.user.id } },
				],
			} as JsonObject,
			sort: ["-date_created"],
			limit: 1,
		});
		const current = existing[0];

		let liked = false;
		let item: Awaited<
			ReturnType<typeof createOne<"app_article_likes">>
		> | null = null;
		if (current && current.status === "published") {
			item = await updateOne("app_article_likes", current.id, {
				status: "archived",
			});
			liked = false;
		} else if (current) {
			item = await updateOne("app_article_likes", current.id, {
				status: "published",
			});
			liked = true;
		} else {
			item = await createOne("app_article_likes", {
				status: "published",
				article_id: articleId,
				user_id: access.user.id,
			});
			liked = true;
		}

		const likeCount = await getArticleLikeCount(articleId);
		return ok({
			item,
			liked,
			like_count: likeCount,
			article_id: articleId,
		});
	}

	return fail("方法不允许", 405);
}

async function handleMeArticles(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 2) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const rows = await readMany("app_articles", {
				filter: {
					author_id: { _eq: access.user.id },
				} as JsonObject,
				sort: ["-date_created"],
				limit,
				offset,
			});
			return ok({
				items: rows.map((row) => ({ ...row, tags: safeCsv(row.tags) })),
				page,
				limit,
				total: rows.length,
			});
		}

		if (context.request.method === "POST") {
			assertCan(access, "can_publish_articles");
			const body = await parseJsonBody(context.request);

			const title = parseBodyTextField(body, "title");
			const content = parseBodyTextField(body, "body_markdown");
			if (!title || !content) {
				return fail("标题和正文必填", 400);
			}

			const status = parseBodyStatus(body, "status", "draft");
			const specialSlug = toSpecialArticleSlug(
				toOptionalString(body.slug),
			);
			const articlePayload = {
				status,
				author_id: access.user.id,
				title,
				slug: specialSlug,
				summary: toOptionalString(body.summary),
				body_markdown: content,
				cover_file: toOptionalString(body.cover_file),
				cover_url: toOptionalString(body.cover_url),
				tags: toStringArray(body.tags),
				category: toOptionalString(body.category),
				allow_comments: toBooleanValue(body.allow_comments, true),
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
				published_at:
					status === "published"
						? toOptionalString(body.published_at) || nowIso()
						: toOptionalString(body.published_at),
			};

			let created: AppArticle | null = null;
			const MAX_SHORT_ID_RETRIES = 3;
			for (let attempt = 0; attempt < MAX_SHORT_ID_RETRIES; attempt++) {
				try {
					created = await createOne("app_articles", {
						...articlePayload,
						short_id: generateShortId(),
					});
					break;
				} catch (error) {
					const msg = String(error);
					if (
						(msg.includes("unique") || msg.includes("duplicate")) &&
						attempt < MAX_SHORT_ID_RETRIES - 1
					) {
						continue;
					}
					throw error;
				}
			}
			return ok({ item: { ...created, tags: safeCsv(created?.tags) } });
		}
	}

	if (segments.length === 3) {
		const id = parseRouteId(segments[2]);
		if (!id) {
			return fail("缺少文章 ID", 400);
		}
		const target = await readOneById("app_articles", id);
		if (!target) {
			return fail("文章不存在", 404);
		}
		assertOwnerOrAdmin(access, target.author_id);

		if (context.request.method === "GET") {
			return ok({ item: { ...target, tags: safeCsv(target.tags) } });
		}

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};

			if (hasOwn(body, "title")) {
				payload.title = parseBodyTextField(body, "title");
			}
			if (hasOwn(body, "slug")) {
				payload.slug = toSpecialArticleSlug(
					toOptionalString(body.slug),
				);
			}
			if (hasOwn(body, "summary")) {
				payload.summary = toOptionalString(body.summary);
			}
			if (hasOwn(body, "body_markdown")) {
				payload.body_markdown = parseBodyTextField(
					body,
					"body_markdown",
				);
			}
			if (hasOwn(body, "cover_file")) {
				payload.cover_file = toOptionalString(body.cover_file);
			}
			if (hasOwn(body, "cover_url")) {
				payload.cover_url = toOptionalString(body.cover_url);
			}
			if (hasOwn(body, "tags")) {
				payload.tags = toStringArray(body.tags);
			}
			if (hasOwn(body, "category")) {
				payload.category = toOptionalString(body.category);
			}
			if (hasOwn(body, "allow_comments")) {
				payload.allow_comments = toBooleanValue(
					body.allow_comments,
					target.allow_comments,
				);
			}
			Object.assign(payload, parseVisibilityPatch(body));
			if (hasOwn(body, "published_at")) {
				payload.published_at = toOptionalString(body.published_at);
			}

			const updated = await updateOne("app_articles", id, payload);
			return ok({ item: { ...updated, tags: safeCsv(updated.tags) } });
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_articles", id);
			return ok({ id });
		}
	}

	return fail("未找到接口", 404);
}

async function handleMeDiaries(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 2) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const rows = await readMany("app_diaries", {
				filter: {
					author_id: { _eq: access.user.id },
				} as JsonObject,
				sort: ["-date_created"],
				limit,
				offset,
			});
			return ok({
				items: rows,
				page,
				limit,
				total: rows.length,
			});
		}

		if (context.request.method === "POST") {
			assertCan(access, "can_manage_diaries");
			const body = await parseJsonBody(context.request);
			const content = parseBodyTextField(body, "content");
			if (!content) {
				return fail("日记内容必填", 400);
			}

			const status = parseBodyStatus(body, "status", "draft");
			const diaryPayload = {
				status,
				author_id: access.user.id,
				content,
				mood: toOptionalString(body.mood),
				location: toOptionalString(body.location),
				happened_at: toOptionalString(body.happened_at) || nowIso(),
				allow_comments: toBooleanValue(body.allow_comments, true),
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			};

			let created: AppDiary | null = null;
			const MAX_DIARY_SID_RETRIES = 3;
			for (let attempt = 0; attempt < MAX_DIARY_SID_RETRIES; attempt++) {
				try {
					created = await createOne("app_diaries", {
						...diaryPayload,
						short_id: generateShortId(),
					});
					break;
				} catch (error) {
					const msg = String(error);
					if (
						(msg.includes("unique") || msg.includes("duplicate")) &&
						attempt < MAX_DIARY_SID_RETRIES - 1
					) {
						continue;
					}
					throw error;
				}
			}
			return ok({ item: created });
		}
	}

	if (segments.length === 3) {
		const id = parseRouteId(segments[2]);
		if (!id) {
			return fail("缺少日记 ID", 400);
		}
		const target = await readOneById("app_diaries", id);
		if (!target) {
			return fail("日记不存在", 404);
		}
		assertOwnerOrAdmin(access, target.author_id);

		if (context.request.method === "GET") {
			const images = await readMany("app_diary_images", {
				filter: {
					diary_id: { _eq: id },
				} as JsonObject,
				sort: ["sort", "-date_created"],
				limit: 100,
			});
			return ok({ item: target, images });
		}

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "content")) {
				payload.content = parseBodyTextField(body, "content");
			}
			if (hasOwn(body, "mood")) {
				payload.mood = toOptionalString(body.mood);
			}
			if (hasOwn(body, "location")) {
				payload.location = toOptionalString(body.location);
			}
			if (hasOwn(body, "happened_at")) {
				payload.happened_at = toOptionalString(body.happened_at);
			}
			if (hasOwn(body, "allow_comments")) {
				payload.allow_comments = toBooleanValue(
					body.allow_comments,
					target.allow_comments,
				);
			}
			Object.assign(payload, parseVisibilityPatch(body));
			const updated = await updateOne("app_diaries", id, payload);
			return ok({ item: updated });
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_diaries", id);
			return ok({ id });
		}
	}

	return fail("未找到接口", 404);
}

async function handleMeAnime(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 2) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const rows = await readMany("app_anime_entries", {
				filter: {
					author_id: { _eq: access.user.id },
				} as JsonObject,
				sort: ["-date_created"],
				limit,
				offset,
			});
			return ok({
				items: rows.map((row) => ({
					...row,
					genres: safeCsv(row.genres),
				})),
				page,
				limit,
				total: rows.length,
			});
		}

		if (context.request.method === "POST") {
			assertCan(access, "can_manage_anime");
			const body = await parseJsonBody(context.request);
			const title = parseBodyTextField(body, "title");
			if (!title) {
				return fail("标题必填", 400);
			}

			const status = parseBodyStatus(body, "status", "draft");
			const created = await createOne("app_anime_entries", {
				status,
				author_id: access.user.id,
				title,
				watch_status: normalizeWatchStatus(
					parseBodyTextField(body, "watch_status"),
				),
				rating: toNumberValue(body.rating),
				progress: toNumberValue(body.progress),
				total_episodes: toNumberValue(body.total_episodes),
				year: toOptionalString(body.year),
				studio: toOptionalString(body.studio),
				genres: toStringArray(body.genres),
				description: toOptionalString(body.description),
				link: toOptionalString(body.link),
				cover_file: toOptionalString(body.cover_file),
				cover_url: toOptionalString(body.cover_url),
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			});
			return ok({
				item: { ...created, genres: safeCsv(created.genres) },
			});
		}
	}

	if (segments.length === 3) {
		const id = parseRouteId(segments[2]);
		if (!id) {
			return fail("缺少番剧 ID", 400);
		}
		const target = await readOneById("app_anime_entries", id);
		if (!target) {
			return fail("番剧条目不存在", 404);
		}
		assertOwnerOrAdmin(access, target.author_id);

		if (context.request.method === "GET") {
			return ok({ item: { ...target, genres: safeCsv(target.genres) } });
		}

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "title")) {
				payload.title = parseBodyTextField(body, "title");
			}
			if (hasOwn(body, "watch_status")) {
				payload.watch_status = normalizeWatchStatus(
					parseBodyTextField(body, "watch_status"),
				);
			}
			if (hasOwn(body, "rating")) {
				payload.rating = toNumberValue(body.rating);
			}
			if (hasOwn(body, "progress")) {
				payload.progress = toNumberValue(body.progress);
			}
			if (hasOwn(body, "total_episodes")) {
				payload.total_episodes = toNumberValue(body.total_episodes);
			}
			if (hasOwn(body, "year")) {
				payload.year = toOptionalString(body.year);
			}
			if (hasOwn(body, "studio")) {
				payload.studio = toOptionalString(body.studio);
			}
			if (hasOwn(body, "genres")) {
				payload.genres = toStringArray(body.genres);
			}
			if (hasOwn(body, "description")) {
				payload.description = toOptionalString(body.description);
			}
			if (hasOwn(body, "link")) {
				payload.link = toOptionalString(body.link);
			}
			if (hasOwn(body, "cover_file")) {
				payload.cover_file = toOptionalString(body.cover_file);
			}
			if (hasOwn(body, "cover_url")) {
				payload.cover_url = toOptionalString(body.cover_url);
			}
			Object.assign(payload, parseVisibilityPatch(body));
			const updated = await updateOne("app_anime_entries", id, payload);
			return ok({
				item: { ...updated, genres: safeCsv(updated.genres) },
			});
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_anime_entries", id);
			return ok({ id });
		}
	}

	return fail("未找到接口", 404);
}

async function handleMeAlbums(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 2) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const rows = await readMany("app_albums", {
				filter: {
					author_id: { _eq: access.user.id },
				} as JsonObject,
				sort: ["-date", "-date_created"],
				limit,
				offset,
			});
			return ok({
				items: rows.map((row) => ({ ...row, tags: safeCsv(row.tags) })),
				page,
				limit,
				total: rows.length,
			});
		}

		if (context.request.method === "POST") {
			assertCan(access, "can_manage_albums");
			const body = await parseJsonBody(context.request);
			const title = parseBodyTextField(body, "title");
			if (!title) {
				return fail("相册标题必填", 400);
			}
			const status = parseBodyStatus(body, "status", "draft");
			const albumPayload = {
				status,
				author_id: access.user.id,
				title,
				slug: sanitizeSlug(parseBodyTextField(body, "slug") || title),
				description: toOptionalString(body.description),
				cover_file: toOptionalString(body.cover_file),
				cover_url: toOptionalString(body.cover_url),
				date: toOptionalString(body.date),
				location: toOptionalString(body.location),
				tags: toStringArray(body.tags),
				layout: normalizeAlbumLayout(
					parseBodyTextField(body, "layout"),
				),
				columns: toNumberValue(body.columns, 3) || 3,
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			};

			let created: AppAlbum | null = null;
			const MAX_ALBUM_SID_RETRIES = 3;
			for (let attempt = 0; attempt < MAX_ALBUM_SID_RETRIES; attempt++) {
				try {
					created = await createOne("app_albums", {
						...albumPayload,
						short_id: generateShortId(),
					});
					break;
				} catch (error) {
					const msg = String(error);
					if (
						(msg.includes("unique") || msg.includes("duplicate")) &&
						attempt < MAX_ALBUM_SID_RETRIES - 1
					) {
						continue;
					}
					throw error;
				}
			}
			return ok({ item: { ...created, tags: safeCsv(created?.tags) } });
		}
	}

	if (segments.length === 3) {
		const id = parseRouteId(segments[2]);
		if (!id) {
			return fail("缺少相册 ID", 400);
		}
		const target = await readOneById("app_albums", id);
		if (!target) {
			return fail("相册不存在", 404);
		}
		assertOwnerOrAdmin(access, target.author_id);

		if (context.request.method === "GET") {
			const photos = await readMany("app_album_photos", {
				filter: {
					album_id: { _eq: id },
				} as JsonObject,
				sort: ["sort", "-date_created"],
				limit: 200,
			});
			return ok({
				item: { ...target, tags: safeCsv(target.tags) },
				photos: photos.map((photo) => ({
					...photo,
					tags: safeCsv(photo.tags),
				})),
			});
		}

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "title")) {
				payload.title = parseBodyTextField(body, "title");
			}
			if (hasOwn(body, "slug")) {
				payload.slug = sanitizeSlug(parseBodyTextField(body, "slug"));
			}
			if (hasOwn(body, "description")) {
				payload.description = toOptionalString(body.description);
			}
			if (hasOwn(body, "cover_file")) {
				payload.cover_file = toOptionalString(body.cover_file);
			}
			if (hasOwn(body, "cover_url")) {
				payload.cover_url = toOptionalString(body.cover_url);
			}
			if (hasOwn(body, "date")) {
				payload.date = toOptionalString(body.date);
			}
			if (hasOwn(body, "location")) {
				payload.location = toOptionalString(body.location);
			}
			if (hasOwn(body, "tags")) {
				payload.tags = toStringArray(body.tags);
			}
			if (hasOwn(body, "layout")) {
				payload.layout = normalizeAlbumLayout(
					parseBodyTextField(body, "layout"),
				);
			}
			if (hasOwn(body, "columns")) {
				payload.columns =
					toNumberValue(body.columns, target.columns) ||
					target.columns;
			}
			Object.assign(payload, parseVisibilityPatch(body));
			const updated = await updateOne("app_albums", id, payload);
			return ok({ item: { ...updated, tags: safeCsv(updated.tags) } });
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_albums", id);
			return ok({ id });
		}
	}

	return fail("未找到接口", 404);
}

async function handleMeAlbumPhotos(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 3 && context.request.method === "POST") {
		assertCan(access, "can_manage_albums");
		const albumId = parseRouteId(segments[1]);
		if (!albumId) {
			return fail("缺少相册 ID", 400);
		}
		const album = await readOneById("app_albums", albumId);
		if (!album) {
			return fail("相册不存在", 404);
		}
		assertOwnerOrAdmin(access, album.author_id);
		const body = await parseJsonBody(context.request);
		const created = await createOne("app_album_photos", {
			status: toBooleanValue(body.is_public, true)
				? "published"
				: "archived",
			album_id: albumId,
			file_id: toOptionalString(body.file_id),
			image_url: toOptionalString(body.image_url),
			title: toOptionalString(body.title),
			description: toOptionalString(body.description),
			tags: toStringArray(body.tags),
			taken_at: toOptionalString(body.taken_at),
			location: toOptionalString(body.location),
			sort: toNumberValue(body.sort, null),
			is_public: toBooleanValue(body.is_public, true),
			show_on_profile: toBooleanValue(body.show_on_profile, true),
		});
		return ok({ item: { ...created, tags: safeCsv(created.tags) } });
	}

	if (segments.length === 3) {
		const photoId = parseRouteId(segments[2]);
		if (!photoId) {
			return fail("缺少图片 ID", 400);
		}
		const photo = await readOneById("app_album_photos", photoId);
		if (!photo) {
			return fail("图片不存在", 404);
		}
		const album = await readOneById("app_albums", photo.album_id);
		if (!album) {
			return fail("相册不存在", 404);
		}
		assertOwnerOrAdmin(access, album.author_id);

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "file_id")) {
				payload.file_id = toOptionalString(body.file_id);
			}
			if (hasOwn(body, "image_url")) {
				payload.image_url = toOptionalString(body.image_url);
			}
			if (hasOwn(body, "title")) {
				payload.title = toOptionalString(body.title);
			}
			if (hasOwn(body, "description")) {
				payload.description = toOptionalString(body.description);
			}
			if (hasOwn(body, "tags")) {
				payload.tags = toStringArray(body.tags);
			}
			if (hasOwn(body, "taken_at")) {
				payload.taken_at = toOptionalString(body.taken_at);
			}
			if (hasOwn(body, "location")) {
				payload.location = toOptionalString(body.location);
			}
			if (hasOwn(body, "sort")) {
				payload.sort = toNumberValue(body.sort, null);
			}
			if (hasOwn(body, "is_public")) {
				payload.is_public = toBooleanValue(
					body.is_public,
					photo.is_public,
				);
			}
			if (hasOwn(body, "show_on_profile")) {
				payload.show_on_profile = toBooleanValue(
					body.show_on_profile,
					photo.show_on_profile,
				);
			}
			if (hasOwn(body, "status")) {
				payload.status = normalizeStatus(
					parseBodyTextField(body, "status"),
					"published",
				);
			}
			const updated = await updateOne(
				"app_album_photos",
				photoId,
				payload,
			);
			return ok({ item: { ...updated, tags: safeCsv(updated.tags) } });
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_album_photos", photoId);
			return ok({ id: photoId });
		}
	}

	return fail("未找到接口", 404);
}

async function handleMeDiaryImages(
	context: APIContext,
	access: AppAccess,
	segments: string[],
): Promise<Response> {
	if (segments.length === 3 && context.request.method === "POST") {
		assertCan(access, "can_manage_diaries");
		const diaryId = parseRouteId(segments[1]);
		if (!diaryId) {
			return fail("缺少日记 ID", 400);
		}
		const diary = await readOneById("app_diaries", diaryId);
		if (!diary) {
			return fail("日记不存在", 404);
		}
		assertOwnerOrAdmin(access, diary.author_id);
		const body = await parseJsonBody(context.request);
		const created = await createOne("app_diary_images", {
			status: toBooleanValue(body.is_public, true)
				? "published"
				: "archived",
			diary_id: diaryId,
			file_id: toOptionalString(body.file_id),
			image_url: toOptionalString(body.image_url),
			caption: toOptionalString(body.caption),
			sort: toNumberValue(body.sort, null),
			is_public: toBooleanValue(body.is_public, true),
			show_on_profile: toBooleanValue(body.show_on_profile, true),
		});
		return ok({ item: created });
	}

	if (segments.length === 3) {
		const imageId = parseRouteId(segments[2]);
		if (!imageId) {
			return fail("缺少图片 ID", 400);
		}
		const image = await readOneById("app_diary_images", imageId);
		if (!image) {
			return fail("图片不存在", 404);
		}
		const diary = await readOneById("app_diaries", image.diary_id);
		if (!diary) {
			return fail("日记不存在", 404);
		}
		assertOwnerOrAdmin(access, diary.author_id);

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "file_id")) {
				payload.file_id = toOptionalString(body.file_id);
			}
			if (hasOwn(body, "image_url")) {
				payload.image_url = toOptionalString(body.image_url);
			}
			if (hasOwn(body, "caption")) {
				payload.caption = toOptionalString(body.caption);
			}
			if (hasOwn(body, "sort")) {
				payload.sort = toNumberValue(body.sort, null);
			}
			if (hasOwn(body, "is_public")) {
				payload.is_public = toBooleanValue(
					body.is_public,
					image.is_public,
				);
			}
			if (hasOwn(body, "show_on_profile")) {
				payload.show_on_profile = toBooleanValue(
					body.show_on_profile,
					image.show_on_profile,
				);
			}
			if (hasOwn(body, "status")) {
				payload.status = normalizeStatus(
					parseBodyTextField(body, "status"),
					"published",
				);
			}
			const updated = await updateOne(
				"app_diary_images",
				imageId,
				payload,
			);
			return ok({ item: updated });
		}

		if (context.request.method === "DELETE") {
			await deleteOne("app_diary_images", imageId);
			return ok({ id: imageId });
		}
	}

	return fail("未找到接口", 404);
}
