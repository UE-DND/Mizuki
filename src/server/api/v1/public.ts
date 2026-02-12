import type { APIContext } from "astro";

import type {
	AppAlbum,
	AppAnimeEntry,
	AppArticle,
	AppArticleComment,
	AppDiary,
	AppDiaryComment,
	AppDiaryImage,
	AppProfile,
} from "@/types/app";
import type { JsonObject } from "@/types/json";
import {
	createOne,
	countItems,
	readDirectusAssetResponse,
	readMany,
} from "@/server/directus/client";
import { buildDirectusAssetUrl } from "@/server/directus-auth";
import { getPublicSiteSettings } from "@/server/site-settings/service";
import { fail, ok } from "@/server/api/response";
import {
	parseJsonBody,
	parsePagination,
	toStringValue,
} from "@/server/api/utils";
import {
	normalizeRequestedUsername,
	validateDisplayName,
} from "@/server/auth/username";
import { getSessionUser } from "@/server/auth/session";

import {
	DEFAULT_LIST_LIMIT,
	filterPublicStatus,
	isSpecialArticleSlug,
	loadPublicAlbumById,
	loadPublicArticleById,
	loadPublicArticleBySlug,
	loadPublicDiaryById,
	parseRouteId,
	safeCsv,
	toDirectusAssetQuery,
} from "./shared";
import { getAuthorBundle } from "./shared/author-cache";

const REGISTRATION_REASON_MAX_LENGTH = 500;

function assertRegisterEnabled(context: APIContext): void {
	const enabled = Boolean(
		context.locals.siteSettings?.settings.auth?.register_enabled,
	);
	if (!enabled) {
		throw new Error("REGISTER_DISABLED");
	}
}

function parseRegistrationReason(raw: unknown): string {
	const reason = String(raw || "").trim();
	if (!reason) {
		throw new Error("REGISTRATION_REASON_EMPTY");
	}
	if (reason.length > REGISTRATION_REASON_MAX_LENGTH) {
		throw new Error("REGISTRATION_REASON_TOO_LONG");
	}
	return reason;
}

function parseRegistrationEmail(raw: unknown): string {
	const email = String(raw || "")
		.trim()
		.toLowerCase();
	if (!email) {
		throw new Error("EMAIL_EMPTY");
	}
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailPattern.test(email)) {
		throw new Error("EMAIL_INVALID");
	}
	return email;
}

async function assertRegistrationEmailAvailable(email: string): Promise<void> {
	const rows = await readMany("directus_users", {
		filter: { email: { _eq: email } } as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw new Error("EMAIL_EXISTS");
	}
}

async function assertRegistrationUsernameAvailable(
	username: string,
): Promise<void> {
	const rows = await readMany("app_user_profiles", {
		filter: { username: { _eq: username } } as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw new Error("USERNAME_EXISTS");
	}
}

async function assertNoPendingRegistrationConflict(
	email: string,
	username: string,
): Promise<void> {
	const rows = await readMany("app_user_registration_requests", {
		filter: {
			_and: [
				{ request_status: { _eq: "pending" } },
				{
					_or: [
						{ email: { _eq: email } },
						{ username: { _eq: username } },
					],
				},
			],
		} as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw new Error("REGISTRATION_REQUEST_EXISTS");
	}
}

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

async function handlePublicSiteSettings(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}
	if (segments.length !== 2) {
		return fail("未找到接口", 404);
	}
	const data = await getPublicSiteSettings();
	return ok({
		settings: data.settings,
		updated_at: data.updatedAt,
	});
}

async function handlePublicRegistrationRequests(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (segments.length !== 2) {
		return fail("未找到接口", 404);
	}
	if (context.request.method !== "POST") {
		return fail("方法不允许", 405);
	}

	assertRegisterEnabled(context);
	const body = await parseJsonBody(context.request);
	const email = parseRegistrationEmail(body.email);
	const username = normalizeRequestedUsername(
		toStringValue(body.username).trim(),
	);
	const displayName = validateDisplayName(
		toStringValue(body.display_name).trim(),
	);
	const registrationReason = parseRegistrationReason(
		body.registration_reason,
	);
	const avatarFileRaw = toStringValue(body.avatar_file).trim();
	const avatarFile = avatarFileRaw ? parseRouteId(avatarFileRaw) : null;

	await assertNoPendingRegistrationConflict(email, username);
	await Promise.all([
		assertRegistrationEmailAvailable(email),
		assertRegistrationUsernameAvailable(username),
	]);

	const created = await createOne("app_user_registration_requests", {
		status: "published",
		email,
		username,
		display_name: displayName,
		avatar_file: avatarFile,
		registration_reason: registrationReason,
		request_status: "pending",
		reviewed_by: null,
		reviewed_at: null,
		reject_reason: null,
		cancel_reason: null,
		approved_user_id: null,
	});

	return ok({
		item: created,
	});
}

async function loadProfileByUsername(
	username: string,
): Promise<AppProfile | null> {
	const rows = await readMany("app_user_profiles", {
		filter: { username: { _eq: username } } as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

function normalizeAuthorHandle(value: string): string {
	return value.trim().replace(/^@+/, "").toLowerCase();
}

/** Owner sees everything; non-owner sees published + public + show_on_profile */
function itemFiltersApi(isOwner: boolean): JsonObject[] {
	return isOwner
		? []
		: [filterPublicStatus(), { show_on_profile: { _eq: true } }];
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
		const authorHandle = normalizeAuthorHandle(
			(context.url.searchParams.get("author") || "").slice(0, 100),
		);

		const andFilters: JsonObject[] = [filterPublicStatus()];
		if (authorHandle) {
			const profile = await loadProfileByUsername(authorHandle);
			if (!profile?.user_id) {
				return ok({
					items: [],
					page,
					limit,
					total: 0,
				});
			}
			andFilters.push({ author_id: { _eq: profile.user_id } });
		}
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
		const authorHandle = normalizeAuthorHandle(
			(context.url.searchParams.get("author") || "").slice(0, 100),
		);
		const andFilters: JsonObject[] = [filterPublicStatus()];
		if (authorHandle) {
			const profile = await loadProfileByUsername(authorHandle);
			if (!profile?.user_id) {
				return ok({
					items: [],
					page,
					limit,
					total: 0,
				});
			}
			andFilters.push({ author_id: { _eq: profile.user_id } });
		}
		const filter = { _and: andFilters } as JsonObject;
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
		const albumId = parseRouteId(segments[2]);
		if (!albumId) {
			return fail("缺少相册 ID", 400);
		}
		const album = await loadPublicAlbumById(albumId);
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
	if (segments.length < 3 || segments.length > 4) {
		return fail("未找到接口", 404);
	}

	const moduleKey = segments[2];
	if (
		moduleKey !== "home" &&
		moduleKey !== "anime" &&
		moduleKey !== "diary" &&
		moduleKey !== "albums"
	) {
		return fail("未找到接口", 404);
	}
	if (moduleKey === "home" && segments.length !== 3) {
		return fail("未找到接口", 404);
	}

	// Resolve current viewer for owner bypass
	const sessionUser = await getSessionUser(context);
	const viewerId = sessionUser?.id ?? null;

	if (moduleKey !== "home") {
		const username = parseRouteId(segments[1]);
		if (!username) {
			return fail("缺少用户名", 400);
		}

		const profile = await loadProfileByUsername(username);
		if (!profile) {
			return fail("用户主页不存在", 404);
		}
		const userId = profile.user_id;
		const isOwnerViewing = Boolean(viewerId) && viewerId === userId;

		if (!isOwnerViewing && !profile.profile_public) {
			return fail("用户主页不存在", 404);
		}
		if (
			!isOwnerViewing &&
			moduleKey === "anime" &&
			!profile.show_anime_on_profile
		) {
			return fail("内容未公开", 403);
		}
		if (
			!isOwnerViewing &&
			moduleKey === "diary" &&
			!profile.show_diaries_on_profile
		) {
			return fail("内容未公开", 403);
		}
		if (
			!isOwnerViewing &&
			moduleKey === "albums" &&
			!profile.show_albums_on_profile
		) {
			return fail("内容未公开", 403);
		}
		const detailId = segments.length === 4 ? parseRouteId(segments[3]) : "";
		if (segments.length === 4 && !detailId) {
			return fail("缺少内容 ID", 400);
		}

		if (moduleKey === "anime") {
			if (detailId) {
				return fail("未找到接口", 404);
			}
			const { page, limit, offset } = parsePagination(context.url);
			const watchStatus =
				context.url.searchParams.get("status")?.trim() || "";
			const andFilters: JsonObject[] = [
				...itemFiltersApi(isOwnerViewing),
				{ author_id: { _eq: userId } },
			];
			if (watchStatus) {
				andFilters.push({ watch_status: { _eq: watchStatus } });
			}

			const animeFilter = { _and: andFilters } as JsonObject;
			const [rows, total, authorMap] = await Promise.all([
				readMany("app_anime_entries", {
					filter: animeFilter,
					sort: ["-date_created"],
					limit,
					offset,
				}),
				countItems("app_anime_entries", animeFilter),
				getAuthorBundle([userId]),
			]);

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

		if (moduleKey === "diary") {
			if (detailId) {
				let diary: AppDiary | null;
				if (isOwnerViewing) {
					const rows = await readMany("app_diaries", {
						filter: { id: { _eq: detailId } } as JsonObject,
						limit: 1,
					});
					diary = (rows[0] as AppDiary | undefined) ?? null;
				} else {
					diary = await loadPublicDiaryById(detailId);
				}
				if (!diary || diary.author_id !== userId) {
					return fail("内容未公开", 404);
				}
				if (!isOwnerViewing && !diary.show_on_profile) {
					return fail("内容未公开", 404);
				}

				const diaryImageFilters: JsonObject[] = [
					{ diary_id: { _eq: diary.id } },
				];
				if (!isOwnerViewing) {
					diaryImageFilters.push(
						{ status: { _eq: "published" } },
						{ is_public: { _eq: true } },
					);
				}
				const [images, authorMap] = await Promise.all([
					readMany("app_diary_images", {
						filter: { _and: diaryImageFilters } as JsonObject,
						sort: ["sort", "-date_created"],
						limit: 100,
					}),
					getAuthorBundle([userId]),
				]);

				return ok({
					item: {
						...diary,
						author: readAuthor(authorMap, diary.author_id),
						images,
					},
				});
			}

			const { page, limit, offset } = parsePagination(context.url);
			const diaryFilter = {
				_and: [
					...itemFiltersApi(isOwnerViewing),
					{ author_id: { _eq: userId } },
				],
			} as JsonObject;
			const [rows, total] = await Promise.all([
				readMany("app_diaries", {
					filter: diaryFilter,
					sort: ["-happened_at", "-date_created"],
					limit,
					offset,
				}),
				countItems("app_diaries", diaryFilter),
			]);

			const diaryIds = rows.map((row) => row.id);
			const diaryImageFilters: JsonObject[] = [
				{ diary_id: { _in: diaryIds } },
			];
			if (!isOwnerViewing) {
				diaryImageFilters.push(
					{ status: { _eq: "published" } },
					{ is_public: { _eq: true } },
				);
			}
			const [images, authorMap] = await Promise.all([
				readMany("app_diary_images", {
					filter:
						diaryIds.length > 0
							? ({ _and: diaryImageFilters } as JsonObject)
							: ({ id: { _null: true } } as JsonObject),
					sort: ["sort", "-date_created"],
					limit: Math.max(diaryIds.length * 6, DEFAULT_LIST_LIMIT),
				}),
				getAuthorBundle([userId]),
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

		// albums module
		if (detailId) {
			let album: AppAlbum | null;
			if (isOwnerViewing) {
				const rows = await readMany("app_albums", {
					filter: { id: { _eq: detailId } } as JsonObject,
					limit: 1,
				});
				album = (rows[0] as AppAlbum | undefined) ?? null;
			} else {
				album = await loadPublicAlbumById(detailId);
			}
			if (!album || album.author_id !== userId) {
				return fail("内容未公开", 404);
			}
			if (!isOwnerViewing && !album.show_on_profile) {
				return fail("内容未公开", 404);
			}

			const photoFilters: JsonObject[] = [
				{ album_id: { _eq: album.id } },
			];
			if (!isOwnerViewing) {
				photoFilters.push(
					{ status: { _eq: "published" } },
					{ is_public: { _eq: true } },
				);
			}
			const [photos, authorMap] = await Promise.all([
				readMany("app_album_photos", {
					filter: { _and: photoFilters } as JsonObject,
					sort: ["sort", "-date_created"],
					limit: 200,
				}),
				getAuthorBundle([userId]),
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

		const { page, limit, offset } = parsePagination(context.url);
		const albumFilter = {
			_and: [
				...itemFiltersApi(isOwnerViewing),
				{ author_id: { _eq: userId } },
			],
		} as JsonObject;
		const [rows, total, authorMap] = await Promise.all([
			readMany("app_albums", {
				filter: albumFilter,
				sort: ["-date", "-date_created"],
				limit,
				offset,
			}),
			countItems("app_albums", albumFilter),
			getAuthorBundle([userId]),
		]);

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

	// moduleKey === "home"
	const username = parseRouteId(segments[1]);
	if (!username) {
		return fail("缺少用户名", 400);
	}

	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return fail("用户主页不存在", 404);
	}
	const isOwnerViewing = Boolean(viewerId) && viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return fail("用户主页不存在", 404);
	}

	const targetUserId = profile.user_id;
	const [authorMap, articleComments, diaryComments] = await Promise.all([
		getAuthorBundle([targetUserId]),
		isOwnerViewing || profile.show_comments_on_profile
			? readMany("app_article_comments", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFiltersApi(isOwnerViewing),
						],
					} as JsonObject,
					sort: ["-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppArticleComment[]),
		isOwnerViewing || profile.show_comments_on_profile
			? readMany("app_diary_comments", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFiltersApi(isOwnerViewing),
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
		isOwnerViewing || profile.show_articles_on_profile
			? readMany("app_articles", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFiltersApi(isOwnerViewing),
						],
					} as JsonObject,
					sort: ["-published_at", "-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppArticle[]),
		isOwnerViewing || profile.show_diaries_on_profile
			? readMany("app_diaries", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFiltersApi(isOwnerViewing),
						],
					} as JsonObject,
					sort: ["-happened_at", "-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppDiary[]),
		isOwnerViewing || profile.show_anime_on_profile
			? readMany("app_anime_entries", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFiltersApi(isOwnerViewing),
						],
					} as JsonObject,
					sort: ["-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppAnimeEntry[]),
		isOwnerViewing || profile.show_albums_on_profile
			? readMany("app_albums", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFiltersApi(isOwnerViewing),
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
		comments:
			isOwnerViewing || profile.show_comments_on_profile
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
	if (segments[1] === "site-settings") {
		return await handlePublicSiteSettings(context, segments);
	}
	if (segments[1] === "registration-requests") {
		return await handlePublicRegistrationRequests(context, segments);
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
