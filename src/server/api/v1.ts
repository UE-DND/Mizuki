import type { APIContext } from "astro";

import type {
	AppAlbum,
	AppAnimeEntry,
	AppArticle,
	AppArticleComment,
	ContentReportReason,
	ContentReportTargetType,
	AppDiary,
	AppDiaryComment,
	AppDiaryImage,
	AppPermissions,
	AppProfile,
	AppRole,
	AppStatus,
	CommentStatus,
} from "@/types/app";
import type { JsonObject, JsonValue } from "@/types/json";
import {
	createDirectusUser,
	createOne,
	deleteDirectusFile,
	deleteOne,
	listDirectusUsers,
	readDirectusAssetResponse,
	readMany,
	readOneById,
	updateDirectusUser,
	updateOne,
	uploadDirectusFile,
} from "@/server/directus/client";
import {
	assertCan,
	assertOwnerOrAdmin,
	assertNotSuspended,
	createUniqueUsername,
	getAppAccessContext,
	updateProfileUsername,
} from "@/server/auth/acl";
import { normalizeRequestedUsername } from "@/server/auth/username";
import { getSessionUser } from "@/server/auth/session";
import { buildDirectusAssetUrl } from "@/server/directus-auth";
import { fail, ok } from "@/server/api/response";
import {
	parseJsonBody,
	parsePagination,
	toBooleanValue,
	toNumberValue,
	toOptionalString,
	toStringArray,
	toStringValue,
} from "@/server/api/utils";

const DEFAULT_LIST_LIMIT = 20;

const ADMIN_MODULE_COLLECTION = {
	articles: "app_articles",
	diaries: "app_diaries",
	anime: "app_anime_entries",
	albums: "app_albums",
	"article-comments": "app_article_comments",
	"diary-comments": "app_diary_comments",
} as const;

type AdminModuleKey = keyof typeof ADMIN_MODULE_COLLECTION;

type AppAccess = Awaited<ReturnType<typeof getAppAccessContext>>;

type CommentRecord = AppArticleComment | AppDiaryComment;

type CommentTreeNode = {
	id: string;
	parent_id: string | null;
	body: string;
	status: CommentStatus;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	author_id: string;
	author: {
		id: string;
		name: string;
		username?: string;
		avatar_url?: string;
	};
	replies: CommentTreeNode[];
};

const COMMENT_BODY_BASE64_PREFIX = "__MZK_UTF8_B64__:";
const PROFILE_BIO_MAX_LENGTH = 30;

function isWriteMethod(method: string): boolean {
	return method === "POST" || method === "PATCH" || method === "DELETE";
}

function assertSameOrigin(context: APIContext): Response | null {
	const origin = context.request.headers.get("origin");
	if (!origin) {
		return null;
	}
	if (origin !== context.url.origin) {
		return fail("非法来源请求", 403);
	}
	return null;
}

function parseSegments(context: APIContext): string[] {
	const raw = context.params.segments;
	if (!raw) {
		return [];
	}
	return raw
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function nowIso(): string {
	return new Date().toISOString();
}

function sanitizeSlug(input: string): string {
	const value = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5\s\-_]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-_]+|[-_]+$/g, "");
	return value || `item-${Date.now()}`;
}

function normalizeStatus(
	input: string,
	fallback: AppStatus = "draft",
): AppStatus {
	if (input === "published" || input === "draft" || input === "archived") {
		return input;
	}
	return fallback;
}

function normalizeAppRole(input: string): AppRole {
	return input === "admin" ? "admin" : "member";
}

function normalizeWatchStatus(
	input: string,
): "watching" | "completed" | "planned" | "onhold" | "dropped" {
	if (
		input === "watching" ||
		input === "completed" ||
		input === "planned" ||
		input === "onhold" ||
		input === "dropped"
	) {
		return input;
	}
	return "planned";
}

function normalizeAlbumLayout(input: string): "grid" | "masonry" {
	return input === "masonry" ? "masonry" : "grid";
}

function normalizeCommentStatus(
	input: string,
	fallback: CommentStatus = "published",
): CommentStatus {
	if (input === "published" || input === "hidden" || input === "archived") {
		return input;
	}
	return fallback;
}

function normalizeReportTargetType(
	input: string,
): ContentReportTargetType | null {
	if (
		input === "article" ||
		input === "diary" ||
		input === "article_comment" ||
		input === "diary_comment"
	) {
		return input;
	}
	return null;
}

function normalizeReportReason(input: string): ContentReportReason {
	if (
		input === "spam" ||
		input === "abuse" ||
		input === "hate" ||
		input === "violence" ||
		input === "copyright" ||
		input === "other"
	) {
		return input;
	}
	return "other";
}

function safeCsv(value: string[] | string | null | undefined): string[] {
	const cleanEntry = (entry: string): string =>
		String(entry)
			.trim()
			.replace(/^(?:["']|\[)+/, "")
			.replace(/(?:["']|\])+$/, "")
			.trim();

	const normalizeList = (entries: string[]): string[] =>
		entries.map((entry) => cleanEntry(entry)).filter(Boolean);

	if (!value) {
		return [];
	}
	if (Array.isArray(value)) {
		return normalizeList(value);
	}

	const raw = String(value).trim();
	if (!raw) {
		return [];
	}

	if (raw.startsWith("[") && raw.endsWith("]")) {
		try {
			const parsed = JSON.parse(raw) as string[];
			if (Array.isArray(parsed)) {
				return normalizeList(parsed);
			}
		} catch (error) {
			console.warn("[api/v1] failed to parse csv json value:", error);
		}
	}

	return normalizeList(raw.split(","));
}

function hasOwn<T extends object, K extends PropertyKey>(
	object: T,
	key: K,
): key is K & keyof T {
	return Object.prototype.hasOwnProperty.call(object, key);
}

async function requireAccess(context: APIContext): Promise<
	| {
			access: AppAccess;
	  }
	| {
			response: Response;
	  }
> {
	const user = await getSessionUser(context);
	if (!user) {
		return { response: fail("未登录", 401) };
	}

	try {
		const access = await getAppAccessContext(user);
		assertNotSuspended(access);
		return { access };
	} catch (error) {
		const message = String((error as Error)?.message ?? error);
		if (message.includes("ACCOUNT_SUSPENDED")) {
			return { response: fail("账号已被停用", 403) };
		}
		return { response: fail("权限不足", 403) };
	}
}

async function requireAdmin(context: APIContext): Promise<
	| {
			access: AppAccess;
	  }
	| {
			response: Response;
	  }
> {
	const required = await requireAccess(context);
	if ("response" in required) {
		return required;
	}
	if (!required.access.isAdmin) {
		return { response: fail("需要管理员权限", 403) };
	}
	return required;
}

function filterPublicStatus(): JsonObject {
	return {
		status: { _eq: "published" },
		is_public: { _eq: true },
	};
}

async function fetchProfilesByUserIds(
	userIds: string[],
): Promise<Map<string, AppProfile>> {
	if (userIds.length === 0) {
		return new Map();
	}
	const profiles = await readMany("app_user_profiles", {
		filter: {
			user_id: { _in: userIds },
		} as JsonObject,
		limit: Math.max(userIds.length, DEFAULT_LIST_LIMIT),
	});
	const profileMap = new Map<string, AppProfile>();
	for (const profile of profiles) {
		if (profile.user_id) {
			profileMap.set(profile.user_id, profile);
		}
	}
	return profileMap;
}

async function fetchUsersByIds(
	userIds: string[],
): Promise<
	Map<
		string,
		{ id: string; email?: string; name?: string; avatar?: string | null }
	>
> {
	if (userIds.length === 0) {
		return new Map();
	}
	const users = await readMany("directus_users", {
		filter: {
			id: { _in: userIds },
		} as JsonObject,
		limit: Math.max(userIds.length, DEFAULT_LIST_LIMIT),
		fields: ["id", "email", "first_name", "last_name", "avatar"],
	});

	const userMap = new Map<
		string,
		{ id: string; email?: string; name?: string; avatar?: string | null }
	>();
	for (const user of users) {
		const fullName = [user.first_name, user.last_name]
			.map((entry) => (entry || "").trim())
			.filter(Boolean)
			.join(" ")
			.trim();
		userMap.set(user.id, {
			id: user.id,
			email: user.email || undefined,
			name: fullName || undefined,
			avatar: user.avatar,
		});
	}
	return userMap;
}

function buildAuthor(
	userId: string,
	profileMap: Map<string, AppProfile>,
	userMap: Map<
		string,
		{ id: string; email?: string; name?: string; avatar?: string | null }
	>,
): { id: string; name: string; username?: string; avatar_url?: string } {
	const profile = profileMap.get(userId);
	const user = userMap.get(userId);

	const rawUsername = String(profile?.username || "").trim();
	const usernameWithoutDomain = rawUsername.includes("@")
		? (rawUsername.split("@")[0] || "").trim()
		: rawUsername;
	const username =
		usernameWithoutDomain || `user-${String(userId || "").slice(0, 8)}`;
	const name = username || user?.name?.trim() || "Member";

	let avatarUrl: string | undefined;
	if (profile?.avatar_url?.trim()) {
		avatarUrl = profile.avatar_url;
	} else if (profile?.avatar_file) {
		avatarUrl = buildDirectusAssetUrl(profile.avatar_file, {
			width: 96,
			height: 96,
			fit: "cover",
		});
	} else if (user?.avatar) {
		avatarUrl = buildDirectusAssetUrl(user.avatar, {
			width: 96,
			height: 96,
			fit: "cover",
		});
	}

	return {
		id: userId,
		name,
		username,
		avatar_url: avatarUrl,
	};
}

function buildCommentTree(
	comments: CommentRecord[],
	profileMap: Map<string, AppProfile>,
	userMap: Map<
		string,
		{ id: string; email?: string; name?: string; avatar?: string | null }
	>,
): CommentTreeNode[] {
	const byParent = new Map<string, CommentTreeNode[]>();
	const roots: CommentTreeNode[] = [];

	for (const comment of comments) {
		const node: CommentTreeNode = {
			id: comment.id,
			parent_id: comment.parent_id,
			body: decodeCommentBodyFromStorage(comment.body),
			status: comment.status,
			is_public: comment.is_public,
			show_on_profile: comment.show_on_profile,
			date_created: comment.date_created,
			author_id: comment.author_id,
			author: buildAuthor(comment.author_id, profileMap, userMap),
			replies: [],
		};

		if (!comment.parent_id) {
			roots.push(node);
			continue;
		}

		const siblings = byParent.get(comment.parent_id) || [];
		siblings.push(node);
		byParent.set(comment.parent_id, siblings);
	}

	for (const root of roots) {
		root.replies = byParent.get(root.id) || [];
	}

	return roots.sort((a, b) => {
		const at = new Date(a.date_created || "1970-01-01").getTime();
		const bt = new Date(b.date_created || "1970-01-01").getTime();
		return at - bt;
	});
}

function parseRouteId(input: string | undefined): string {
	return (input || "").trim();
}

function parseBodyTextField(body: JsonObject, key: string): string {
	return toStringValue(body[key]).trim();
}

function isHanCharacter(char: string): boolean {
	return /\p{Script=Han}/u.test(char);
}

function calculateTextWeight(value: string): number {
	let total = 0;
	for (const char of String(value || "")) {
		total += isHanCharacter(char) ? 2 : 1;
	}
	return total;
}

function parseProfileBioField(input: JsonValue | undefined): string | null {
	const value = toOptionalString(input);
	if (!value) {
		return null;
	}
	if (calculateTextWeight(value) > PROFILE_BIO_MAX_LENGTH) {
		throw new Error("PROFILE_BIO_TOO_LONG");
	}
	return value;
}

function hasNonBmpCharacters(input: string): boolean {
	return /[\u{10000}-\u{10FFFF}]/u.test(input);
}

function encodeCommentBodyForStorage(input: string): string {
	const text = String(input || "");
	if (!hasNonBmpCharacters(text)) {
		return text;
	}
	return `${COMMENT_BODY_BASE64_PREFIX}${Buffer.from(text, "utf8").toString("base64")}`;
}

function decodeCommentBodyFromStorage(
	input: string | null | undefined,
): string {
	const text = String(input || "");
	if (!text.startsWith(COMMENT_BODY_BASE64_PREFIX)) {
		return text;
	}
	const encoded = text.slice(COMMENT_BODY_BASE64_PREFIX.length);
	if (!encoded) {
		return "";
	}
	try {
		return Buffer.from(encoded, "base64").toString("utf8");
	} catch (error) {
		console.warn("[api/v1] failed to decode comment body:", error);
		return text;
	}
}

function parseBodyStatus(
	body: JsonObject,
	key: string,
	fallback: AppStatus,
): AppStatus {
	return normalizeStatus(parseBodyTextField(body, key), fallback);
}

function parseBodyCommentStatus(
	body: JsonObject,
	key: string,
	fallback: CommentStatus,
): CommentStatus {
	return normalizeCommentStatus(parseBodyTextField(body, key), fallback);
}

async function ensureUsernameAvailable(
	username: string,
	excludeProfileId?: string,
): Promise<void> {
	const filters: JsonObject[] = [{ username: { _eq: username } }];
	if (excludeProfileId) {
		filters.push({ id: { _neq: excludeProfileId } });
	}
	const rows = await readMany("app_user_profiles", {
		filter: { _and: filters } as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw new Error("USERNAME_EXISTS");
	}
}

function parseVisibilityPatch(body: JsonObject): JsonObject {
	const payload: JsonObject = {};
	if (hasOwn(body, "status")) {
		payload.status = normalizeStatus(
			parseBodyTextField(body, "status"),
			"draft",
		);
	}
	if (hasOwn(body, "is_public")) {
		payload.is_public = toBooleanValue(body.is_public, true);
	}
	if (hasOwn(body, "show_on_profile")) {
		payload.show_on_profile = toBooleanValue(body.show_on_profile, true);
	}
	return payload;
}

function toErrorResponse(error: unknown): Response {
	const message = String((error as Error)?.message ?? error);
	if (message.includes("FORBIDDEN")) {
		return fail("权限不足", 403);
	}
	if (message.includes("ACCOUNT_SUSPENDED")) {
		return fail("账号已被停用", 403);
	}
	if (message.includes("INVALID_JSON")) {
		return fail("请求体不是合法 JSON", 400);
	}
	if (message.includes("USERNAME_EXISTS")) {
		return fail("用户名已存在", 409);
	}
	if (message.includes("USERNAME_EMPTY")) {
		return fail("用户名不能为空", 400);
	}
	if (message.includes("USERNAME_INVALID")) {
		return fail("用户名仅支持中文、英文、数字、下划线和短横线", 400);
	}
	if (message.includes("USERNAME_TOO_LONG")) {
		return fail("用户名最多 14 字符（中文按 2 字符计）", 400);
	}
	if (message.includes("PROFILE_BIO_TOO_LONG")) {
		return fail("个人简介最多 30 字符（中文按 2 字符计）", 400);
	}
	if (message.includes("ITEM_NOT_FOUND")) {
		return fail("资源不存在", 404);
	}
	if (message.includes("UNAUTHORIZED")) {
		return fail("未登录", 401);
	}
	console.error("[api/v1] unexpected error:", error);
	return fail("服务端错误", 500);
}

async function loadPublicArticleBySlug(
	slug: string,
): Promise<AppArticle | null> {
	const rows = await readMany("app_articles", {
		filter: {
			_and: [{ slug: { _eq: slug } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

async function loadPublicDiaryById(id: string): Promise<AppDiary | null> {
	const rows = await readMany("app_diaries", {
		filter: {
			_and: [{ id: { _eq: id } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

async function loadPublicAlbumBySlug(slug: string): Promise<AppAlbum | null> {
	const rows = await readMany("app_albums", {
		filter: {
			_and: [{ slug: { _eq: slug } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

function toDirectusAssetQuery(
	query: URLSearchParams,
): Partial<Record<"width" | "height" | "fit" | "quality" | "format", string>> {
	const output: Partial<
		Record<"width" | "height" | "fit" | "quality" | "format", string>
	> = {};
	const passThroughKeys = ["width", "height", "fit", "quality", "format"];
	for (const key of passThroughKeys) {
		const value = query.get(key);
		if (value && value.trim()) {
			output[key as keyof typeof output] = value.trim();
		}
	}
	return output;
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
		const tag = context.url.searchParams.get("tag")?.trim() || "";
		const category = context.url.searchParams.get("category")?.trim() || "";
		const q = context.url.searchParams.get("q")?.trim() || "";

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

		const rows = await readMany("app_articles", {
			filter: {
				_and: andFilters,
			} as JsonObject,
			sort: ["-published_at", "-date_created"],
			limit,
			offset,
		});

		const authorIds = Array.from(
			new Set(rows.map((row) => row.author_id).filter(Boolean)),
		);
		const [profileMap, userMap] = await Promise.all([
			fetchProfilesByUserIds(authorIds),
			fetchUsersByIds(authorIds),
		]);

		const items = rows.map((row) => ({
			...row,
			tags: safeCsv(row.tags),
			author: buildAuthor(row.author_id, profileMap, userMap),
		}));

		return ok({
			items,
			page,
			limit,
			total: items.length,
		});
	}

	if (segments.length === 3) {
		const slug = parseRouteId(segments[2]);
		if (!slug) {
			return fail("缺少 slug", 400);
		}
		const article = await loadPublicArticleBySlug(slug);
		if (!article) {
			return fail("文章不存在", 404);
		}
		const [profileMap, userMap] = await Promise.all([
			fetchProfilesByUserIds([article.author_id]),
			fetchUsersByIds([article.author_id]),
		]);
		return ok({
			item: {
				...article,
				tags: safeCsv(article.tags),
				author: buildAuthor(article.author_id, profileMap, userMap),
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
		const rows = await readMany("app_diaries", {
			filter: filterPublicStatus(),
			sort: ["-happened_at", "-date_created"],
			limit,
			offset,
		});

		const diaryIds = rows.map((row) => row.id);
		const authorIds = Array.from(
			new Set(rows.map((row) => row.author_id).filter(Boolean)),
		);
		const [images, profileMap, userMap] = await Promise.all([
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
			fetchProfilesByUserIds(authorIds),
			fetchUsersByIds(authorIds),
		]);

		const imageMap = new Map<string, AppDiaryImage[]>();
		for (const image of images) {
			const list = imageMap.get(image.diary_id) || [];
			list.push(image);
			imageMap.set(image.diary_id, list);
		}

		const items = rows.map((row) => ({
			...row,
			author: buildAuthor(row.author_id, profileMap, userMap),
			images: imageMap.get(row.id) || [],
		}));

		return ok({
			items,
			page,
			limit,
			total: items.length,
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
		const [images, profileMap, userMap] = await Promise.all([
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
			fetchProfilesByUserIds([diary.author_id]),
			fetchUsersByIds([diary.author_id]),
		]);

		return ok({
			item: {
				...diary,
				author: buildAuthor(diary.author_id, profileMap, userMap),
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

	const rows = await readMany("app_anime_entries", {
		filter: {
			_and: andFilters,
		} as JsonObject,
		sort: ["-date_created"],
		limit,
		offset,
	});

	const authorIds = Array.from(
		new Set(rows.map((row) => row.author_id).filter(Boolean)),
	);
	const [profileMap, userMap] = await Promise.all([
		fetchProfilesByUserIds(authorIds),
		fetchUsersByIds(authorIds),
	]);

	const items = rows.map((row) => ({
		...row,
		genres: safeCsv(row.genres),
		author: buildAuthor(row.author_id, profileMap, userMap),
	}));

	return ok({
		items,
		page,
		limit,
		total: items.length,
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
		const rows = await readMany("app_albums", {
			filter: filterPublicStatus(),
			sort: ["-date", "-date_created"],
			limit,
			offset,
		});

		const authorIds = Array.from(
			new Set(rows.map((row) => row.author_id).filter(Boolean)),
		);
		const [profileMap, userMap] = await Promise.all([
			fetchProfilesByUserIds(authorIds),
			fetchUsersByIds(authorIds),
		]);

		const items = rows.map((row) => ({
			...row,
			tags: safeCsv(row.tags),
			author: buildAuthor(row.author_id, profileMap, userMap),
		}));

		return ok({
			items,
			page,
			limit,
			total: items.length,
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

		const [photos, profileMap, userMap] = await Promise.all([
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
			fetchProfilesByUserIds([album.author_id]),
			fetchUsersByIds([album.author_id]),
		]);

		return ok({
			item: {
				...album,
				tags: safeCsv(album.tags),
				author: buildAuthor(album.author_id, profileMap, userMap),
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
	const [users, articleComments, diaryComments] = await Promise.all([
		fetchUsersByIds([targetUserId]),
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

	const user = users.get(targetUserId);
	const base = {
		profile,
		owner: {
			id: targetUserId,
			name: profile.username || user?.name || user?.email || "user",
			username: profile.username,
			avatar_url:
				profile.avatar_url ||
				(profile.avatar_file
					? buildDirectusAssetUrl(profile.avatar_file, {
							width: 128,
							height: 128,
							fit: "cover",
						})
					: undefined),
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
						body: decodeCommentBodyFromStorage(comment.body),
					})),
					diary_comments: diaryComments.map((comment) => ({
						...comment,
						body: decodeCommentBodyFromStorage(comment.body),
					})),
				}
			: { article_comments: [], diary_comments: [] },
	});
}

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
			// Keep legacy display_name in sync to avoid stale email-like labels.
			payload.display_name = normalized;
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
			const created = await createOne("app_articles", {
				status,
				author_id: access.user.id,
				title,
				slug: sanitizeSlug(parseBodyTextField(body, "slug") || title),
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
			});
			return ok({ item: { ...created, tags: safeCsv(created.tags) } });
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
				payload.slug = sanitizeSlug(parseBodyTextField(body, "slug"));
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
			const created = await createOne("app_diaries", {
				status,
				author_id: access.user.id,
				content,
				mood: toOptionalString(body.mood),
				location: toOptionalString(body.location),
				happened_at: toOptionalString(body.happened_at) || nowIso(),
				allow_comments: toBooleanValue(body.allow_comments, true),
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			});
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
			const created = await createOne("app_albums", {
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
			});
			return ok({ item: { ...created, tags: safeCsv(created.tags) } });
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
			const [profileMap, userMap] = await Promise.all([
				fetchProfilesByUserIds(authorIds),
				fetchUsersByIds(authorIds),
			]);
			const tree = buildCommentTree(comments, profileMap, userMap);
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
				body: encodeCommentBodyForStorage(text),
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			});
			return ok({
				item: {
					...created,
					body: decodeCommentBodyFromStorage(created.body),
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
				payload.body = encodeCommentBodyForStorage(
					parseBodyTextField(body, "body"),
				);
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
					body: decodeCommentBodyFromStorage(updated.body),
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
			const [profileMap, userMap] = await Promise.all([
				fetchProfilesByUserIds(authorIds),
				fetchUsersByIds(authorIds),
			]);
			const tree = buildCommentTree(comments, profileMap, userMap);
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
				body: encodeCommentBodyForStorage(text),
				is_public: toBooleanValue(body.is_public, true),
				show_on_profile: toBooleanValue(body.show_on_profile, true),
			});
			return ok({
				item: {
					...created,
					body: decodeCommentBodyFromStorage(created.body),
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
				payload.body = encodeCommentBodyForStorage(
					parseBodyTextField(body, "body"),
				);
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
					body: decodeCommentBodyFromStorage(updated.body),
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

async function handleUploads(context: APIContext): Promise<Response> {
	if (context.request.method !== "POST") {
		return fail("方法不允许", 405);
	}
	const required = await requireAccess(context);
	if ("response" in required) {
		return required.response;
	}
	const access = required.access;
	assertCan(access, "can_upload_files");

	const formData = await context.request.formData();
	const file = formData.get("file");
	if (!(file instanceof File)) {
		return fail("缺少上传文件", 400);
	}

	const UPLOAD_MAX_SIZE = 1.5 * 1024 * 1024; // 1.5 MB
	if (file.size > UPLOAD_MAX_SIZE) {
		return fail("文件过大，最大允许 1.5 MB", 413);
	}

	const titleRaw = formData.get("title");
	const folderRaw = formData.get("folder");
	const uploaded = await uploadDirectusFile({
		file,
		title: typeof titleRaw === "string" ? titleRaw : undefined,
		folder: typeof folderRaw === "string" ? folderRaw : undefined,
	});
	return ok({ file: uploaded });
}

function extractPermissionPatch(body: JsonObject): JsonObject {
	const permissionFields: (keyof AppPermissions)[] = [
		"app_role",
		"can_publish_articles",
		"can_comment_articles",
		"can_manage_diaries",
		"can_comment_diaries",
		"can_manage_anime",
		"can_manage_albums",
		"can_upload_files",
		"is_suspended",
	];
	const payload: JsonObject = {};
	for (const field of permissionFields) {
		if (!hasOwn(body, field)) {
			continue;
		}
		if (field === "app_role") {
			payload.app_role = normalizeAppRole(
				parseBodyTextField(body, field),
			);
			continue;
		}
		payload[field] = toBooleanValue(body[field], true);
	}
	return payload;
}

async function ensureUserProfile(
	userId: string,
	fallbackName: string,
): Promise<AppProfile> {
	const rows = await readMany("app_user_profiles", {
		filter: { user_id: { _eq: userId } } as JsonObject,
		limit: 1,
	});
	if (rows[0]) {
		return rows[0];
	}

	const normalizedUsername = await createUniqueUsername(fallbackName);
	return await createOne("app_user_profiles", {
		status: "published",
		user_id: userId,
		username: normalizedUsername,
		display_name: normalizedUsername,
		bio: null,
		avatar_file: null,
		avatar_url: null,
		profile_public: true,
		show_articles_on_profile: true,
		show_diaries_on_profile: true,
		show_anime_on_profile: true,
		show_albums_on_profile: true,
		show_comments_on_profile: true,
	});
}

async function ensureUserPermissions(userId: string): Promise<AppPermissions> {
	const rows = await readMany("app_user_permissions", {
		filter: { user_id: { _eq: userId } } as JsonObject,
		limit: 1,
	});
	if (rows[0]) {
		return rows[0];
	}

	return await createOne("app_user_permissions", {
		status: "published",
		user_id: userId,
		app_role: "member",
		can_publish_articles: true,
		can_comment_articles: true,
		can_manage_diaries: true,
		can_comment_diaries: true,
		can_manage_anime: true,
		can_manage_albums: true,
		can_upload_files: true,
		is_suspended: false,
	});
}

async function handleAdminUsers(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	const required = await requireAdmin(context);
	if ("response" in required) {
		return required.response;
	}

	if (segments.length === 1) {
		if (context.request.method === "GET") {
			const { page, limit, offset } = parsePagination(context.url);
			const users = await listDirectusUsers({
				limit,
				offset,
				search: context.url.searchParams.get("q") || undefined,
			});
			const userIds = users.map((user) => user.id);
			const [profiles, permissions] = await Promise.all([
				readMany("app_user_profiles", {
					filter:
						userIds.length > 0
							? ({ user_id: { _in: userIds } } as JsonObject)
							: ({ id: { _null: true } } as JsonObject),
					limit: Math.max(userIds.length, DEFAULT_LIST_LIMIT),
				}),
				readMany("app_user_permissions", {
					filter:
						userIds.length > 0
							? ({ user_id: { _in: userIds } } as JsonObject)
							: ({ id: { _null: true } } as JsonObject),
					limit: Math.max(userIds.length, DEFAULT_LIST_LIMIT),
				}),
			]);

			const profileMap = new Map<string, AppProfile>();
			for (const profile of profiles) {
				profileMap.set(profile.user_id, profile);
			}
			const permissionMap = new Map<string, AppPermissions>();
			for (const permission of permissions) {
				permissionMap.set(permission.user_id, permission);
			}

			return ok({
				items: users.map((user) => ({
					user,
					profile: profileMap.get(user.id) || null,
					permissions: permissionMap.get(user.id) || null,
				})),
				page,
				limit,
				total: users.length,
			});
		}

		if (context.request.method === "POST") {
			const body = await parseJsonBody(context.request);
			const email = parseBodyTextField(body, "email");
			const password = parseBodyTextField(body, "password");
			if (!email || !password) {
				return fail("邮箱和密码必填", 400);
			}
			const firstName = parseBodyTextField(body, "first_name");
			const lastName = parseBodyTextField(body, "last_name");
			const createdUser = await createDirectusUser({
				email,
				password,
				first_name: firstName || undefined,
				last_name: lastName || undefined,
				status: parseBodyTextField(body, "status") || "active",
			});

			const displayName =
				[firstName, lastName].filter(Boolean).join(" ").trim() ||
				email.split("@")[0] ||
				"Member";
			const requestedUsername = parseBodyTextField(body, "username");
			let normalizedUsername = "";
			if (requestedUsername) {
				normalizedUsername =
					normalizeRequestedUsername(requestedUsername);
				await ensureUsernameAvailable(normalizedUsername);
			} else {
				normalizedUsername = await createUniqueUsername(displayName);
			}
			const profile = await createOne("app_user_profiles", {
				status: "published",
				user_id: createdUser.id,
				username: normalizedUsername,
				display_name: normalizedUsername,
				bio: parseProfileBioField(body.bio),
				avatar_file: toOptionalString(body.avatar_file),
				avatar_url: toOptionalString(body.avatar_url),
				profile_public: toBooleanValue(body.profile_public, true),
				show_articles_on_profile: toBooleanValue(
					body.show_articles_on_profile,
					true,
				),
				show_diaries_on_profile: toBooleanValue(
					body.show_diaries_on_profile,
					true,
				),
				show_anime_on_profile: toBooleanValue(
					body.show_anime_on_profile,
					true,
				),
				show_albums_on_profile: toBooleanValue(
					body.show_albums_on_profile,
					true,
				),
				show_comments_on_profile: toBooleanValue(
					body.show_comments_on_profile,
					true,
				),
			});

			const permissions = await createOne("app_user_permissions", {
				status: "published",
				user_id: createdUser.id,
				app_role: normalizeAppRole(
					parseBodyTextField(body, "app_role"),
				),
				can_publish_articles: toBooleanValue(
					body.can_publish_articles,
					true,
				),
				can_comment_articles: toBooleanValue(
					body.can_comment_articles,
					true,
				),
				can_manage_diaries: toBooleanValue(
					body.can_manage_diaries,
					true,
				),
				can_comment_diaries: toBooleanValue(
					body.can_comment_diaries,
					true,
				),
				can_manage_anime: toBooleanValue(body.can_manage_anime, true),
				can_manage_albums: toBooleanValue(body.can_manage_albums, true),
				can_upload_files: toBooleanValue(body.can_upload_files, true),
				is_suspended: toBooleanValue(body.is_suspended, false),
			});

			return ok({ user: createdUser, profile, permissions });
		}
	}

	if (segments.length === 2) {
		const userId = parseRouteId(segments[1]);
		if (!userId) {
			return fail("缺少用户 ID", 400);
		}

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const directusPayload: JsonObject = {};
			if (hasOwn(body, "email")) {
				directusPayload.email = parseBodyTextField(body, "email");
			}
			if (hasOwn(body, "first_name")) {
				directusPayload.first_name = toOptionalString(body.first_name);
			}
			if (hasOwn(body, "last_name")) {
				directusPayload.last_name = toOptionalString(body.last_name);
			}
			if (hasOwn(body, "status")) {
				directusPayload.status = parseBodyTextField(body, "status");
			}
			if (hasOwn(body, "role")) {
				directusPayload.role = toOptionalString(body.role);
			}
			if (
				hasOwn(body, "password") &&
				parseBodyTextField(body, "password")
			) {
				directusPayload.password = parseBodyTextField(body, "password");
			}

			if (Object.keys(directusPayload).length > 0) {
				await updateDirectusUser(userId, directusPayload);
			}

			const profile = await ensureUserProfile(
				userId,
				parseBodyTextField(body, "username") || "Member",
			);
			const permissions = await ensureUserPermissions(userId);

			const profilePayload: JsonObject = {};
			if (hasOwn(body, "username")) {
				const normalized = normalizeRequestedUsername(
					parseBodyTextField(body, "username"),
				);
				await ensureUsernameAvailable(normalized, profile.id);
				profilePayload.username = normalized;
				profilePayload.display_name = normalized;
			}
			if (hasOwn(body, "bio")) {
				profilePayload.bio = parseProfileBioField(body.bio);
			}
			if (hasOwn(body, "avatar_file")) {
				profilePayload.avatar_file = toOptionalString(body.avatar_file);
			}
			if (hasOwn(body, "avatar_url")) {
				profilePayload.avatar_url = toOptionalString(body.avatar_url);
			}
			if (hasOwn(body, "profile_public")) {
				profilePayload.profile_public = toBooleanValue(
					body.profile_public,
					profile.profile_public,
				);
			}
			if (hasOwn(body, "show_articles_on_profile")) {
				profilePayload.show_articles_on_profile = toBooleanValue(
					body.show_articles_on_profile,
					profile.show_articles_on_profile,
				);
			}
			if (hasOwn(body, "show_diaries_on_profile")) {
				profilePayload.show_diaries_on_profile = toBooleanValue(
					body.show_diaries_on_profile,
					profile.show_diaries_on_profile,
				);
			}
			if (hasOwn(body, "show_anime_on_profile")) {
				profilePayload.show_anime_on_profile = toBooleanValue(
					body.show_anime_on_profile,
					profile.show_anime_on_profile,
				);
			}
			if (hasOwn(body, "show_albums_on_profile")) {
				profilePayload.show_albums_on_profile = toBooleanValue(
					body.show_albums_on_profile,
					profile.show_albums_on_profile,
				);
			}
			if (hasOwn(body, "show_comments_on_profile")) {
				profilePayload.show_comments_on_profile = toBooleanValue(
					body.show_comments_on_profile,
					profile.show_comments_on_profile,
				);
			}

			const permissionsPayload = extractPermissionPatch(body);
			const [updatedProfile, updatedPermissions] = await Promise.all([
				Object.keys(profilePayload).length > 0
					? updateOne("app_user_profiles", profile.id, profilePayload)
					: Promise.resolve(profile),
				Object.keys(permissionsPayload).length > 0
					? updateOne(
							"app_user_permissions",
							permissions.id,
							permissionsPayload,
						)
					: Promise.resolve(permissions),
			]);

			return ok({
				id: userId,
				profile: updatedProfile,
				permissions: updatedPermissions,
			});
		}
	}

	if (segments.length === 3 && segments[2] === "reset-password") {
		if (context.request.method !== "POST") {
			return fail("方法不允许", 405);
		}
		const userId = parseRouteId(segments[1]);
		if (!userId) {
			return fail("缺少用户 ID", 400);
		}
		const body = await parseJsonBody(context.request);
		const newPassword = parseBodyTextField(body, "new_password");
		if (!newPassword) {
			return fail("新密码不能为空", 400);
		}
		await updateDirectusUser(userId, {
			password: newPassword,
		});
		return ok({ id: userId, reset: true });
	}

	return fail("未找到接口", 404);
}

async function handleAdminContent(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	const required = await requireAdmin(context);
	if ("response" in required) {
		return required.response;
	}

	if (segments.length === 1 && context.request.method === "GET") {
		const module = context.url.searchParams.get("module")?.trim() as
			| AdminModuleKey
			| undefined;

		const modules: AdminModuleKey[] = module
			? ([module] as AdminModuleKey[])
			: (Object.keys(ADMIN_MODULE_COLLECTION) as AdminModuleKey[]);

		const items: Array<{
			module: AdminModuleKey;
			id: string;
			author_id?: string;
			title?: string;
			status?: string;
			is_public?: boolean;
			show_on_profile?: boolean;
			date_created?: string | null;
		}> = [];

		for (const key of modules) {
			const collection = ADMIN_MODULE_COLLECTION[key];
			const rows = await readMany(collection, {
				sort: ["-date_created"],
				limit: 40,
			});
			for (const row of rows as JsonObject[]) {
				const rowBody = toOptionalString(row.body);
				items.push({
					module: key,
					id: toStringValue(row.id),
					author_id: toOptionalString(row.author_id) || undefined,
					title:
						toOptionalString(row.title) ||
						toOptionalString(row.slug) ||
						(rowBody
							? decodeCommentBodyFromStorage(rowBody)
							: null) ||
						toOptionalString(row.content) ||
						undefined,
					status: toOptionalString(row.status) || undefined,
					is_public:
						typeof row.is_public === "boolean"
							? row.is_public
							: undefined,
					show_on_profile:
						typeof row.show_on_profile === "boolean"
							? row.show_on_profile
							: undefined,
					date_created: toOptionalString(row.date_created),
				});
			}
		}

		items.sort((a, b) => {
			const at = new Date(a.date_created || "1970-01-01").getTime();
			const bt = new Date(b.date_created || "1970-01-01").getTime();
			return bt - at;
		});
		return ok({ items });
	}

	if (segments.length === 3) {
		const module = parseRouteId(segments[1]) as AdminModuleKey;
		const id = parseRouteId(segments[2]);
		if (!module || !id) {
			return fail("参数不完整", 400);
		}
		if (!(module in ADMIN_MODULE_COLLECTION)) {
			return fail("不支持的模块", 400);
		}
		const collection = ADMIN_MODULE_COLLECTION[module];

		if (context.request.method === "PATCH") {
			const body = await parseJsonBody(context.request);
			const payload: JsonObject = {};
			if (hasOwn(body, "status")) {
				payload.status = parseBodyTextField(body, "status");
			}
			if (hasOwn(body, "is_public")) {
				payload.is_public = toBooleanValue(body.is_public, true);
			}
			if (hasOwn(body, "show_on_profile")) {
				payload.show_on_profile = toBooleanValue(
					body.show_on_profile,
					true,
				);
			}
			if (hasOwn(body, "allow_comments")) {
				payload.allow_comments = toBooleanValue(
					body.allow_comments,
					true,
				);
			}
			const updated = await updateOne(collection, id, payload);
			return ok({ item: updated });
		}

		if (context.request.method === "DELETE") {
			await deleteOne(collection, id);
			return ok({ id, module });
		}
	}

	return fail("未找到接口", 404);
}

async function handleMe(
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
		return toErrorResponse(error);
	}
}
