import type { APIContext } from "astro";

import type {
	AppAlbum,
	AppAnimeEntry,
	AppArticle,
	AppArticleComment,
	AppDiary,
	AppDiaryComment,
	AppDiaryImage,
} from "@/types/app";
import type { JsonObject } from "@/types/json";
import {
	countItems,
	readDirectusAssetResponse,
	readMany,
} from "@/server/directus/client";
import { buildDirectusAssetUrl } from "@/server/directus-auth";
import { fail, ok } from "@/server/api/response";
import { parsePagination } from "@/server/api/utils";

import {
	DEFAULT_LIST_LIMIT,
	filterPublicStatus,
	isSpecialArticleSlug,
	loadPublicAlbumBySlug,
	loadPublicArticleById,
	loadPublicArticleBySlug,
	loadPublicDiaryById,
	parseRouteId,
	safeCsv,
	toDirectusAssetQuery,
} from "./shared";
import { getAuthorBundle } from "./shared/author-cache";

function toAuthorFallback(userId: string): {
	id: string;
	name: string;
	username?: string;
} {
	const normalized = String(userId || "").trim();
	const shortId = (normalized || "user").slice(0, 8);
	return {
		id: normalized,
		name: `user-${shortId}`,
		username: `user-${shortId}`,
	};
}

function readAuthor(
	authorMap: Map<
		string,
		{ id: string; name: string; username?: string; avatar_url?: string }
	>,
	userId: string,
): { id: string; name: string; username?: string; avatar_url?: string } {
	return authorMap.get(userId) || toAuthorFallback(userId);
}

async function handlePublicAsset(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}

	if (segments.length !== 3) {
		return fail("资源不存在", 404);
	}

	const fileId = parseRouteId(segments[2]);
	if (!fileId) {
		return fail("缺少文件 ID", 400);
	}

	const response = await readDirectusAssetResponse({
		fileId,
		query: toDirectusAssetQuery(context.url.searchParams),
	});

	if (!response.ok) {
		if (response.status === 404 || response.status === 403) {
			return fail("资源不存在", 404);
		}
		throw new Error(
			`ASSET_FETCH_FAILED:${response.status}:${response.statusText}`,
		);
	}

	const headers = new Headers();
	const contentType = response.headers.get("content-type");
	const contentLength = response.headers.get("content-length");
	const cacheControl = response.headers.get("cache-control");
	const etag = response.headers.get("etag");
	const lastModified = response.headers.get("last-modified");

	if (contentType) {
		headers.set("content-type", contentType);
	}
	if (contentLength) {
		headers.set("content-length", contentLength);
	}
	if (etag) {
		headers.set("etag", etag);
	}
	if (lastModified) {
		headers.set("last-modified", lastModified);
	}
	headers.set(
		"cache-control",
		cacheControl || "public, max-age=300, s-maxage=300",
	);

	return new Response(response.body, {
		status: 200,
		headers,
	});
}

async function handlePublicArticles(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}

	if (segments.length === 2) {
		const { page, limit, offset } = parsePagination(context.url);
		const tag = (context.url.searchParams.get("tag")?.trim() || "").slice(
			0,
			200,
		);
		const category = (
			context.url.searchParams.get("category")?.trim() || ""
		).slice(0, 200);
		const q = (context.url.searchParams.get("q")?.trim() || "").slice(
			0,
			200,
		);

		const andFilters: JsonObject[] = [filterPublicStatus()];
		if (tag) {
			andFilters.push({ tags: { _contains: tag } });
		}
		if (category) {
			andFilters.push({ category: { _eq: category } });
		}
		if (q) {
			andFilters.push({
				_or: [
					{ title: { _icontains: q } },
					{ summary: { _icontains: q } },
				],
			});
		}

		const filter = { _and: andFilters } as JsonObject;

		const [rows, total] = await Promise.all([
			readMany("app_articles", {
				filter,
				sort: ["-published_at", "-date_created"],
				limit,
				offset,
			}),
			countItems("app_articles", filter),
		]);

		const authorIds = Array.from(
			new Set(rows.map((row) => row.author_id).filter(Boolean)),
		);
		const authorMap = await getAuthorBundle(authorIds);

		const items = rows.map((row) => ({
			...row,
			tags: safeCsv(row.tags),
			author: readAuthor(authorMap, row.author_id),
		}));

		return ok({
			items,
			page,
			limit,
			total,
		});
	}

	if (segments.length === 3) {
		const articleId = parseRouteId(segments[2]);
		if (!articleId) {
			return fail("缺少文章 ID", 400);
		}
		const articleById = await loadPublicArticleById(articleId);
		const article =
			articleById ||
			(isSpecialArticleSlug(articleId)
				? await loadPublicArticleBySlug(articleId)
				: null);
		if (!article) {
			return fail("文章不存在", 404);
		}
		const authorMap = await getAuthorBundle([article.author_id]);
		return ok({
			item: {
				...article,
				tags: safeCsv(article.tags),
				author: readAuthor(authorMap, article.author_id),
			},
		});
	}

	return fail("未找到接口", 404);
}

async function handlePublicDiaries(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}

	if (segments.length === 2) {
		const { page, limit, offset } = parsePagination(context.url);
		const filter = filterPublicStatus();
		const [rows, total] = await Promise.all([
			readMany("app_diaries", {
				filter,
				sort: ["-happened_at", "-date_created"],
				limit,
				offset,
			}),
			countItems("app_diaries", filter),
		]);

		const diaryIds = rows.map((row) => row.id);
		const authorIds = Array.from(
			new Set(rows.map((row) => row.author_id).filter(Boolean)),
		);
		const [images, authorMap] = await Promise.all([
			readMany("app_diary_images", {
				filter:
					diaryIds.length > 0
						? ({
								_and: [
									{ diary_id: { _in: diaryIds } },
									{ status: { _eq: "published" } },
									{ is_public: { _eq: true } },
								],
							} as JsonObject)
						: ({ id: { _null: true } } as JsonObject),
				sort: ["sort", "-date_created"],
				limit: Math.max(diaryIds.length * 6, DEFAULT_LIST_LIMIT),
			}),
			getAuthorBundle(authorIds),
		]);

		const imageMap = new Map<string, AppDiaryImage[]>();
		for (const image of images) {
			const list = imageMap.get(image.diary_id) || [];
			list.push(image);
			imageMap.set(image.diary_id, list);
		}

		const items = rows.map((row) => ({
			...row,
			author: readAuthor(authorMap, row.author_id),
			images: imageMap.get(row.id) || [],
		}));

		return ok({
			items,
			page,
			limit,
			total,
		});
	}

	if (segments.length === 3) {
		const id = parseRouteId(segments[2]);
		if (!id) {
			return fail("缺少日记 ID", 400);
		}
		const diary = await loadPublicDiaryById(id);
		if (!diary) {
			return fail("日记不存在", 404);
		}
		const [images, authorMap] = await Promise.all([
			readMany("app_diary_images", {
				filter: {
					_and: [
						{ diary_id: { _eq: diary.id } },
						{ status: { _eq: "published" } },
						{ is_public: { _eq: true } },
					],
				} as JsonObject,
				sort: ["sort", "-date_created"],
				limit: 100,
			}),
			getAuthorBundle([diary.author_id]),
		]);

		return ok({
			item: {
				...diary,
				author: readAuthor(authorMap, diary.author_id),
				images,
			},
		});
	}

	return fail("未找到接口", 404);
}

async function handlePublicAnime(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}
	if (segments.length !== 2) {
		return fail("未找到接口", 404);
	}

	const { page, limit, offset } = parsePagination(context.url);
	const watchStatus = context.url.searchParams.get("status")?.trim() || "";
	const andFilters: JsonObject[] = [filterPublicStatus()];
	if (watchStatus) {
		andFilters.push({ watch_status: { _eq: watchStatus } });
	}

	const animeFilter = { _and: andFilters } as JsonObject;
	const [rows, total] = await Promise.all([
		readMany("app_anime_entries", {
			filter: animeFilter,
			sort: ["-date_created"],
			limit,
			offset,
		}),
		countItems("app_anime_entries", animeFilter),
	]);

	const authorIds = Array.from(
		new Set(rows.map((row) => row.author_id).filter(Boolean)),
	);
	const authorMap = await getAuthorBundle(authorIds);

	const items = rows.map((row) => ({
		...row,
		genres: safeCsv(row.genres),
		author: readAuthor(authorMap, row.author_id),
	}));

	return ok({
		items,
		page,
		limit,
		total,
	});
}

async function handlePublicAlbums(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}

	if (segments.length === 2) {
		const { page, limit, offset } = parsePagination(context.url);
		const filter = filterPublicStatus();
		const [rows, total] = await Promise.all([
			readMany("app_albums", {
				filter,
				sort: ["-date", "-date_created"],
				limit,
				offset,
			}),
			countItems("app_albums", filter),
		]);

		const authorIds = Array.from(
			new Set(rows.map((row) => row.author_id).filter(Boolean)),
		);
		const authorMap = await getAuthorBundle(authorIds);

		const items = rows.map((row) => ({
			...row,
			tags: safeCsv(row.tags),
			author: readAuthor(authorMap, row.author_id),
		}));

		return ok({
			items,
			page,
			limit,
			total,
		});
	}

	if (segments.length === 3) {
		const slug = parseRouteId(segments[2]);
		if (!slug) {
			return fail("缺少相册 slug", 400);
		}
		const album = await loadPublicAlbumBySlug(slug);
		if (!album) {
			return fail("相册不存在", 404);
		}

		const [photos, authorMap] = await Promise.all([
			readMany("app_album_photos", {
				filter: {
					_and: [
						{ album_id: { _eq: album.id } },
						{ status: { _eq: "published" } },
						{ is_public: { _eq: true } },
					],
				} as JsonObject,
				sort: ["sort", "-date_created"],
				limit: 200,
			}),
			getAuthorBundle([album.author_id]),
		]);

		return ok({
			item: {
				...album,
				tags: safeCsv(album.tags),
				author: readAuthor(authorMap, album.author_id),
				photos: photos.map((photo) => ({
					...photo,
					tags: safeCsv(photo.tags),
				})),
			},
		});
	}

	return fail("未找到接口", 404);
}

async function handleUserHome(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}
	if (segments.length !== 3 || segments[2] !== "home") {
		return fail("未找到接口", 404);
	}

	const username = parseRouteId(segments[1]);
	if (!username) {
		return fail("缺少用户名", 400);
	}

	const profileRows = await readMany("app_user_profiles", {
		filter: {
			_and: [
				{ username: { _eq: username } },
				{ profile_public: { _eq: true } },
			],
		} as JsonObject,
		limit: 1,
	});
	const profile = profileRows[0];
	if (!profile) {
		return fail("用户主页不存在", 404);
	}

	const targetUserId = profile.user_id;
	const [authorMap, articleComments, diaryComments] = await Promise.all([
		getAuthorBundle([targetUserId]),
		profile.show_comments_on_profile
			? readMany("app_article_comments", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							{ status: { _eq: "published" } },
							{ is_public: { _eq: true } },
							{ show_on_profile: { _eq: true } },
						],
					} as JsonObject,
					sort: ["-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppArticleComment[]),
		profile.show_comments_on_profile
			? readMany("app_diary_comments", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							{ status: { _eq: "published" } },
							{ is_public: { _eq: true } },
							{ show_on_profile: { _eq: true } },
						],
					} as JsonObject,
					sort: ["-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppDiaryComment[]),
	]);

	const owner = readAuthor(authorMap, targetUserId);
	const base = {
		profile,
		owner: {
			id: targetUserId,
			name: profile.username || owner.name || "user",
			username: profile.username || owner.username,
			avatar_url:
				profile.avatar_url ||
				(profile.avatar_file
					? buildDirectusAssetUrl(profile.avatar_file, {
							width: 128,
							height: 128,
							fit: "cover",
						})
					: owner.avatar_url),
		},
	};

	const [articles, diaries, anime, albums] = await Promise.all([
		profile.show_articles_on_profile
			? readMany("app_articles", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							filterPublicStatus(),
							{ show_on_profile: { _eq: true } },
						],
					} as JsonObject,
					sort: ["-published_at", "-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppArticle[]),
		profile.show_diaries_on_profile
			? readMany("app_diaries", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							filterPublicStatus(),
							{ show_on_profile: { _eq: true } },
						],
					} as JsonObject,
					sort: ["-happened_at", "-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppDiary[]),
		profile.show_anime_on_profile
			? readMany("app_anime_entries", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							filterPublicStatus(),
							{ show_on_profile: { _eq: true } },
						],
					} as JsonObject,
					sort: ["-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppAnimeEntry[]),
		profile.show_albums_on_profile
			? readMany("app_albums", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							filterPublicStatus(),
							{ show_on_profile: { _eq: true } },
						],
					} as JsonObject,
					sort: ["-date", "-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppAlbum[]),
	]);

	return ok({
		...base,
		articles: articles.map((item) => ({
			...item,
			tags: safeCsv(item.tags),
		})),
		diaries,
		anime: anime.map((item) => ({ ...item, genres: safeCsv(item.genres) })),
		albums: albums.map((item) => ({ ...item, tags: safeCsv(item.tags) })),
		comments: profile.show_comments_on_profile
			? {
					article_comments: articleComments.map((comment) => ({
						...comment,
						body: comment.body,
					})),
					diary_comments: diaryComments.map((comment) => ({
						...comment,
						body: comment.body,
					})),
				}
			: { article_comments: [], diary_comments: [] },
	});
}

export async function handlePublic(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (segments[1] === "assets") {
		return await handlePublicAsset(context, segments);
	}
	if (segments[1] === "articles") {
		return await handlePublicArticles(context, segments);
	}
	if (segments[1] === "diaries") {
		return await handlePublicDiaries(context, segments);
	}
	if (segments[1] === "anime") {
		return await handlePublicAnime(context, segments);
	}
	if (segments[1] === "albums") {
		return await handlePublicAlbums(context, segments);
	}
	return fail("未找到接口", 404);
}

export { handleUserHome };
