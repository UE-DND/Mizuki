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
	updateOne,
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
import {
	clearRegistrationRequestCookie,
	normalizeRegistrationRequestId,
	REGISTRATION_REQUEST_COOKIE_NAME,
	setRegistrationRequestCookie,
} from "@/server/auth/registration-request-cookie";
import { getSessionUser } from "@/server/auth/session";
import {
	AppError,
	badRequest,
	conflict,
	forbidden,
	notFound,
} from "@/server/api/errors";

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
const REGISTRATION_PASSWORD_MIN_LENGTH = 8;
const REGISTRATION_PASSWORD_MAX_LENGTH = 20;
const REGISTRATION_PASSWORD_ALLOWED_PATTERN = /^[A-Za-z0-9@_]+$/;

function assertRegisterEnabled(context: APIContext): void {
	const enabled = Boolean(
		context.locals.siteSettings?.settings.auth?.register_enabled,
	);
	if (!enabled) {
		throw notFound("REGISTER_DISABLED", "资源不存在");
	}
}

function parseRegistrationReason(raw: unknown): string {
	const reason = String(raw || "").trim();
	if (!reason) {
		throw badRequest("REGISTRATION_REASON_EMPTY", "注册理由不能为空");
	}
	if (reason.length > REGISTRATION_REASON_MAX_LENGTH) {
		throw badRequest(
			"REGISTRATION_REASON_TOO_LONG",
			"注册理由最多 500 字符",
		);
	}
	return reason;
}

function parseRegistrationPassword(raw: unknown): string {
	const password = String(raw ?? "");
	if (!password.trim()) {
		throw badRequest("REGISTRATION_PASSWORD_REQUIRED", "密码不能为空");
	}
	if (!REGISTRATION_PASSWORD_ALLOWED_PATTERN.test(password)) {
		throw badRequest(
			"REGISTRATION_PASSWORD_INVALID",
			"密码仅支持数字、字母、@ 和下划线",
		);
	}
	if (password.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
		throw badRequest("REGISTRATION_PASSWORD_TOO_SHORT", "密码至少 8 位");
	}
	if (password.length > REGISTRATION_PASSWORD_MAX_LENGTH) {
		throw badRequest(
			"REGISTRATION_PASSWORD_TOO_LONG",
			"密码长度不能超过 20 位",
		);
	}
	return password;
}

function parseRegistrationEmail(raw: unknown): string {
	const email = String(raw || "")
		.trim()
		.toLowerCase();
	if (!email) {
		throw badRequest("EMAIL_EMPTY", "邮箱不能为空");
	}
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailPattern.test(email)) {
		throw badRequest("EMAIL_INVALID", "邮箱格式不正确");
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
		throw conflict("EMAIL_EXISTS", "邮箱已存在");
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
		throw conflict("USERNAME_EXISTS", "用户名已存在");
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
		throw conflict(
			"REGISTRATION_REQUEST_EXISTS",
			"该邮箱或用户名已有待处理申请",
		);
	}
}

async function assertNoPendingRegistrationEmailConflict(
	email: string,
): Promise<void> {
	const rows = await readMany("app_user_registration_requests", {
		filter: {
			_and: [
				{ request_status: { _eq: "pending" } },
				{ email: { _eq: email } },
			],
		} as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw conflict(
			"REGISTRATION_REQUEST_EXISTS",
			"该邮箱或用户名已有待处理申请",
		);
	}
}

async function assertNoPendingRegistrationUsernameConflict(
	username: string,
): Promise<void> {
	const rows = await readMany("app_user_registration_requests", {
		filter: {
			_and: [
				{ request_status: { _eq: "pending" } },
				{ username: { _eq: username } },
			],
		} as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw conflict(
			"REGISTRATION_REQUEST_EXISTS",
			"该邮箱或用户名已有待处理申请",
		);
	}
}

type RegistrationFieldCheckResult = {
	valid: boolean;
	available: boolean;
	code: string;
	message: string;
};

function mapRegistrationCheckError(
	error: unknown,
): RegistrationFieldCheckResult {
	const message = String((error as Error)?.message ?? error);
	if (message.includes("EMAIL_EMPTY")) {
		return {
			valid: false,
			available: false,
			code: "EMAIL_EMPTY",
			message: "邮箱不能为空",
		};
	}
	if (message.includes("EMAIL_INVALID")) {
		return {
			valid: false,
			available: false,
			code: "EMAIL_INVALID",
			message: "邮箱格式不正确",
		};
	}
	if (message.includes("USERNAME_EMPTY")) {
		return {
			valid: false,
			available: false,
			code: "USERNAME_EMPTY",
			message: "用户名不能为空",
		};
	}
	if (message.includes("USERNAME_INVALID")) {
		return {
			valid: false,
			available: false,
			code: "USERNAME_INVALID",
			message: "用户名仅支持英文、数字、下划线和短横线",
		};
	}
	if (message.includes("USERNAME_TOO_LONG")) {
		return {
			valid: false,
			available: false,
			code: "USERNAME_TOO_LONG",
			message: "用户名最多 14 字符",
		};
	}
	if (message.includes("EMAIL_EXISTS")) {
		return {
			valid: true,
			available: false,
			code: "EMAIL_EXISTS",
			message: "邮箱已存在",
		};
	}
	if (message.includes("USERNAME_EXISTS")) {
		return {
			valid: true,
			available: false,
			code: "USERNAME_EXISTS",
			message: "用户名已存在",
		};
	}
	if (message.includes("REGISTRATION_REQUEST_EXISTS")) {
		return {
			valid: true,
			available: false,
			code: "REGISTRATION_REQUEST_EXISTS",
			message: "该邮箱或用户名已有待处理申请",
		};
	}
	throw error;
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
	if (segments.length === 2) {
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
		const registrationPassword = parseRegistrationPassword(body.password);
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
			registration_password: registrationPassword,
			avatar_file: avatarFile,
			registration_reason: registrationReason,
			request_status: "pending",
			reviewed_by: null,
			reviewed_at: null,
			reject_reason: null,
			approved_user_id: null,
		});

		if (created?.id) {
			setRegistrationRequestCookie(context, created.id);
		}

		return ok({
			item: created,
		});
	}

	if (segments.length === 3) {
		if (context.request.method !== "PATCH") {
			return fail("方法不允许", 405);
		}
		assertRegisterEnabled(context);

		const requestId = parseRouteId(segments[2]);
		if (!requestId) {
			return fail("缺少申请 ID", 400);
		}
		const cookieRequestId = normalizeRegistrationRequestId(
			context.cookies.get(REGISTRATION_REQUEST_COOKIE_NAME)?.value,
		);
		if (!cookieRequestId || cookieRequestId !== requestId) {
			throw forbidden(
				"REGISTRATION_REQUEST_FORBIDDEN",
				"无法操作当前申请，请刷新后重试",
			);
		}

		const body = await parseJsonBody(context.request);
		const action = String(body.action || "").trim();
		if (action !== "cancel") {
			throw badRequest("REGISTRATION_ACTION_INVALID", "不支持的申请操作");
		}

		const rows = await readMany("app_user_registration_requests", {
			filter: { id: { _eq: requestId } } as JsonObject,
			limit: 1,
			fields: ["id", "request_status"],
		});
		const target = rows[0];
		if (!target) {
			throw notFound("REGISTRATION_NOT_FOUND", "申请不存在");
		}
		if (String(target.request_status || "").trim() !== "pending") {
			throw conflict(
				"REGISTRATION_STATUS_CONFLICT",
				"申请状态冲突，请刷新后重试",
			);
		}

		const updated = await updateOne(
			"app_user_registration_requests",
			requestId,
			{
				request_status: "cancelled",
				reviewed_by: null,
				reviewed_at: new Date().toISOString(),
				registration_password: null,
				reject_reason: null,
			},
		);

		return ok({ item: updated });
	}

	return fail("未找到接口", 404);
}

async function handlePublicRegistrationCheck(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (segments.length !== 2) {
		return fail("未找到接口", 404);
	}
	if (context.request.method !== "GET") {
		return fail("方法不允许", 405);
	}

	assertRegisterEnabled(context);
	const emailRaw = String(context.url.searchParams.get("email") || "").trim();
	const usernameRaw = String(
		context.url.searchParams.get("username") || "",
	).trim();
	if (!emailRaw && !usernameRaw) {
		return fail("至少提供邮箱或用户名", 400);
	}

	const result: {
		email?: RegistrationFieldCheckResult;
		username?: RegistrationFieldCheckResult;
	} = {};

	if (emailRaw) {
		try {
			const email = parseRegistrationEmail(emailRaw);
			await Promise.all([
				assertRegistrationEmailAvailable(email),
				assertNoPendingRegistrationEmailConflict(email),
			]);
			result.email = {
				valid: true,
				available: true,
				code: "OK",
				message: "邮箱可用",
			};
		} catch (error) {
			result.email = mapRegistrationCheckError(error);
		}
	}

	if (usernameRaw) {
		try {
			const username = normalizeRequestedUsername(usernameRaw);
			await Promise.all([
				assertRegistrationUsernameAvailable(username),
				assertNoPendingRegistrationUsernameConflict(username),
			]);
			result.username = {
				valid: true,
				available: true,
				code: "OK",
				message: "用户名可用",
			};
		} catch (error) {
			result.username = mapRegistrationCheckError(error);
		}
	}

	return ok(result);
}

async function handlePublicRegistrationSession(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	if (segments.length !== 2) {
		return fail("未找到接口", 404);
	}
	if (context.request.method !== "DELETE") {
		return fail("方法不允许", 405);
	}
	clearRegistrationRequestCookie(context);
	return ok({
		cleared: true,
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
		throw new AppError(
			"ASSET_FETCH_FAILED",
			`资源获取失败: ${response.status} ${response.statusText}`,
			response.status >= 400 && response.status < 500
				? response.status
				: 502,
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

async function handlePublicFriends(
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
	const tag = (context.url.searchParams.get("tag")?.trim() || "").slice(
		0,
		100,
	);
	const q = (context.url.searchParams.get("q")?.trim() || "").slice(0, 200);

	const andFilters: JsonObject[] = [filterPublicStatus()];
	if (tag) {
		andFilters.push({ tags: { _contains: tag } });
	}
	if (q) {
		andFilters.push({
			_or: [
				{ title: { _icontains: q } },
				{ description: { _icontains: q } },
				{ site_url: { _icontains: q } },
			],
		});
	}

	const filter = { _and: andFilters } as JsonObject;
	const [rows, total] = await Promise.all([
		readMany("app_friends", {
			filter,
			sort: ["sort", "-date_created"],
			limit,
			offset,
		}),
		countItems("app_friends", filter),
	]);

	const items = rows.map((row) => ({
		...row,
		tags: safeCsv(row.tags),
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
	if (segments[1] === "registration-check") {
		return await handlePublicRegistrationCheck(context, segments);
	}
	if (segments[1] === "registration-session") {
		return await handlePublicRegistrationSession(context, segments);
	}
	if (segments[1] === "friends") {
		return await handlePublicFriends(context, segments);
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
