import type { APIContext } from "astro";

import type {
	AppAlbum,
	AppArticle,
	AppArticleComment,
	ContentReportReason,
	ContentReportTargetType,
	AppDiary,
	AppDiaryComment,
	AppRole,
	AppStatus,
	CommentStatus,
	SocialLink,
} from "@/types/app";
import type { JsonObject, JsonValue } from "@/types/json";
import { assertNotSuspended, getAppAccessContext } from "@/server/auth/acl";
import {
	weightedCharLength,
	PROFILE_BIO_MAX_LENGTH,
} from "@/constants/text-limits";
import { fail } from "@/server/api/response";
import {
	toBooleanValue,
	toNumberValue,
	toOptionalString,
	toStringValue,
} from "@/server/api/utils";
import { readMany } from "@/server/directus/client";
import { getSessionUser } from "@/server/auth/session";

import type { AuthorBundleItem } from "./shared/author-cache";

export const DEFAULT_LIST_LIMIT = 20;
export const ADMIN_MODULE_COLLECTION = {
	articles: "app_articles",
	diaries: "app_diaries",
	anime: "app_anime_entries",
	albums: "app_albums",
	"article-comments": "app_article_comments",
	"diary-comments": "app_diary_comments",
} as const;

const SPECIAL_ARTICLE_SLUG_SET = new Set(["about", "friends"]);
const COMMENT_BODY_BASE64_PREFIX = "__MZK_UTF8_B64__:";

export type AdminModuleKey = keyof typeof ADMIN_MODULE_COLLECTION;

export type AppAccess = Awaited<ReturnType<typeof getAppAccessContext>>;

export type CommentRecord = AppArticleComment | AppDiaryComment;

export type CommentTreeNode = {
	id: string;
	parent_id: string | null;
	body: string;
	body_html: string;
	status: CommentStatus;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	author_id: string;
	author: AuthorBundleItem;
	replies: CommentTreeNode[];
};

export function isWriteMethod(method: string): boolean {
	return method === "POST" || method === "PATCH" || method === "DELETE";
}

export function assertSameOrigin(context: APIContext): Response | null {
	const origin = context.request.headers.get("origin");
	if (!origin) {
		return fail("缺少 Origin 头", 403);
	}
	if (origin !== context.url.origin) {
		return fail("非法来源请求", 403);
	}
	return null;
}

export function parseSegments(context: APIContext): string[] {
	const raw = context.params.segments;
	if (!raw) {
		return [];
	}
	return raw
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function sanitizeSlug(input: string): string {
	const value = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5\s\-_]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-_]+|[-_]+$/g, "");
	return value || `item-${Date.now()}`;
}

function normalizePlainSlug(input: string | null | undefined): string {
	return String(input || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5\s\-_]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-_]+|[-_]+$/g, "");
}

export function isSpecialArticleSlug(input: string): boolean {
	const normalized = normalizePlainSlug(input);
	return SPECIAL_ARTICLE_SLUG_SET.has(normalized);
}

export function toSpecialArticleSlug(
	input: string | null | undefined,
): string | null {
	const normalized = normalizePlainSlug(input);
	if (!normalized) {
		return null;
	}
	return SPECIAL_ARTICLE_SLUG_SET.has(normalized) ? normalized : null;
}

export function normalizeStatus(
	input: string,
	fallback: AppStatus = "draft",
): AppStatus {
	if (input === "published" || input === "draft" || input === "archived") {
		return input;
	}
	return fallback;
}

export function normalizeAppRole(input: string): AppRole {
	return input === "admin" ? "admin" : "member";
}

export function normalizeWatchStatus(
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

export function normalizeAlbumLayout(input: string): "grid" | "masonry" {
	return input === "masonry" ? "masonry" : "grid";
}

export function normalizeCommentStatus(
	input: string,
	fallback: CommentStatus = "published",
): CommentStatus {
	if (input === "published" || input === "hidden" || input === "archived") {
		return input;
	}
	return fallback;
}

export function normalizeReportTargetType(
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

export function normalizeReportReason(input: string): ContentReportReason {
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

export function safeCsv(value: string[] | string | null | undefined): string[] {
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

export function hasOwn<T extends object, K extends PropertyKey>(
	object: T,
	key: K,
): key is K & keyof T {
	return Object.prototype.hasOwnProperty.call(object, key);
}

export async function requireAccess(context: APIContext): Promise<
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

export async function requireAdmin(context: APIContext): Promise<
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

export function filterPublicStatus(): JsonObject {
	return {
		status: { _eq: "published" },
		is_public: { _eq: true },
	};
}

function createFallbackAuthor(userId: string): AuthorBundleItem {
	const normalizedId = String(userId || "").trim();
	const suffix = (normalizedId || "unknown").slice(0, 8);
	return {
		id: normalizedId,
		name: `user-${suffix}`,
		username: `user-${suffix}`,
	};
}

function decodeLegacyCommentBody(input: string | null | undefined): string {
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
		console.warn("[api/v1] failed to decode legacy comment body:", error);
		return text;
	}
}

export function buildCommentTree(
	comments: CommentRecord[],
	authorMap: Map<string, AuthorBundleItem>,
): CommentTreeNode[] {
	const byParent = new Map<string, CommentTreeNode[]>();
	const roots: CommentTreeNode[] = [];

	for (const comment of comments) {
		const node: CommentTreeNode = {
			id: comment.id,
			parent_id: comment.parent_id,
			body: decodeLegacyCommentBody(comment.body),
			body_html: "",
			status: comment.status,
			is_public: comment.is_public,
			show_on_profile: comment.show_on_profile,
			date_created: comment.date_created,
			author_id: comment.author_id,
			author:
				authorMap.get(comment.author_id) ||
				createFallbackAuthor(comment.author_id),
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

export function parseRouteId(input: string | undefined): string {
	return (input || "").trim();
}

export function parseBodyTextField(body: JsonObject, key: string): string {
	return toStringValue(body[key]).trim();
}

export function parseProfileBioField(
	input: JsonValue | undefined,
): string | null {
	const value = toOptionalString(input);
	if (!value) {
		return null;
	}
	if (weightedCharLength(value) > PROFILE_BIO_MAX_LENGTH) {
		throw new Error("PROFILE_BIO_TOO_LONG");
	}
	return value;
}

export function parseProfileTypewriterSpeedField(
	input: JsonValue | undefined,
	fallback = 80,
): number {
	const value = toNumberValue(input, fallback) ?? fallback;
	return Math.max(10, Math.min(500, Math.floor(value)));
}

const SOCIAL_LINKS_MAX = 20;
const SOCIAL_LINK_URL_MAX_LENGTH = 500;

export function parseSocialLinks(
	input: JsonValue | undefined,
): SocialLink[] | null {
	if (input === null || input === undefined) {
		return null;
	}
	if (!Array.isArray(input)) {
		throw new Error("SOCIAL_LINKS_INVALID");
	}
	if (input.length > SOCIAL_LINKS_MAX) {
		throw new Error("SOCIAL_LINKS_TOO_MANY");
	}
	const result: SocialLink[] = [];
	for (const item of input) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			throw new Error("SOCIAL_LINKS_INVALID");
		}
		const record = item as Record<string, unknown>;
		const platform = String(record.platform || "").trim();
		const url = String(record.url || "").trim();
		if (!platform || !url) {
			continue;
		}
		if (url.length > SOCIAL_LINK_URL_MAX_LENGTH) {
			throw new Error("SOCIAL_LINKS_INVALID");
		}
		const enabled =
			record.enabled === undefined ? true : Boolean(record.enabled);
		result.push({ platform, url, enabled });
	}
	return result;
}

export function parseBodyStatus(
	body: JsonObject,
	key: string,
	fallback: AppStatus,
): AppStatus {
	return normalizeStatus(parseBodyTextField(body, key), fallback);
}

export function parseBodyCommentStatus(
	body: JsonObject,
	key: string,
	fallback: CommentStatus,
): CommentStatus {
	return normalizeCommentStatus(parseBodyTextField(body, key), fallback);
}

export async function ensureUsernameAvailable(
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

export function parseVisibilityPatch(body: JsonObject): JsonObject {
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

export function toErrorResponse(
	error: unknown,
	context?: APIContext,
): Response {
	const message = String((error as Error)?.message ?? error);
	if (message.includes("FORBIDDEN")) {
		return fail("权限不足", 403, "FORBIDDEN");
	}
	if (message.includes("ACCOUNT_SUSPENDED")) {
		return fail("账号已被停用", 403, "ACCOUNT_SUSPENDED");
	}
	if (message.includes("INVALID_JSON")) {
		return fail("请求体不是合法 JSON", 400, "INVALID_JSON");
	}
	if (message.includes("USERNAME_EXISTS")) {
		return fail("用户名已存在", 409, "USERNAME_EXISTS");
	}
	if (message.includes("USERNAME_EMPTY")) {
		return fail("用户名不能为空", 400, "USERNAME_EMPTY");
	}
	if (message.includes("USERNAME_INVALID")) {
		return fail(
			"用户名仅支持英文、数字、下划线和短横线",
			400,
			"USERNAME_INVALID",
		);
	}
	if (message.includes("USERNAME_TOO_LONG")) {
		return fail("用户名最多 14 字符", 400, "USERNAME_TOO_LONG");
	}
	if (message.includes("PROFILE_BIO_TOO_LONG")) {
		return fail(
			"个人简介最多 30 字符（中文按 2 字符计）",
			400,
			"PROFILE_BIO_TOO_LONG",
		);
	}
	if (message.includes("DISPLAY_NAME_EMPTY")) {
		return fail("昵称不能为空", 400, "DISPLAY_NAME_EMPTY");
	}
	if (message.includes("DISPLAY_NAME_INVALID")) {
		return fail("昵称包含非法字符", 400, "DISPLAY_NAME_INVALID");
	}
	if (message.includes("DISPLAY_NAME_TOO_LONG")) {
		return fail(
			"昵称最多 20 字符（中文按 2 字符计）",
			400,
			"DISPLAY_NAME_TOO_LONG",
		);
	}
	if (message.includes("SOCIAL_LINKS_INVALID")) {
		return fail("社交链接格式不正确", 400, "SOCIAL_LINKS_INVALID");
	}
	if (message.includes("SOCIAL_LINKS_TOO_MANY")) {
		return fail("社交链接最多 20 条", 400, "SOCIAL_LINKS_TOO_MANY");
	}
	if (message.includes("ITEM_NOT_FOUND")) {
		return fail("资源不存在", 404, "ITEM_NOT_FOUND");
	}
	if (message.includes("UNAUTHORIZED")) {
		return fail("未登录", 401, "UNAUTHORIZED");
	}
	console.error("[api/v1] unexpected error:", {
		method: context?.request.method,
		url: context?.url.pathname,
		error:
			error instanceof Error
				? { message: error.message, stack: error.stack }
				: error,
	});
	return fail("服务端错误", 500, "INTERNAL_ERROR");
}

export async function loadPublicArticleById(
	id: string,
): Promise<AppArticle | null> {
	const normalizedId = String(id || "").trim();
	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			normalizedId,
		);
	if (!isUuid) {
		return null;
	}

	const rows = await readMany("app_articles", {
		filter: {
			_and: [{ id: { _eq: normalizedId } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export async function loadPublicArticleBySlug(
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

/** Loose variant: load article by slug without status/is_public filter (for owner fallback) */
export async function loadArticleBySlugLoose(
	slug: string,
): Promise<AppArticle | null> {
	const rows = await readMany("app_articles", {
		filter: { slug: { _eq: slug } } as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export async function loadPublicArticleByShortId(
	shortId: string,
): Promise<AppArticle | null> {
	const rows = await readMany("app_articles", {
		filter: {
			_and: [{ short_id: { _eq: shortId } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

/** Loose variant: load article by short_id without status/is_public filter (for owner fallback) */
export async function loadArticleByShortIdLoose(
	shortId: string,
): Promise<AppArticle | null> {
	const rows = await readMany("app_articles", {
		filter: { short_id: { _eq: shortId } } as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export async function loadPublicDiaryById(
	id: string,
): Promise<AppDiary | null> {
	const rows = await readMany("app_diaries", {
		filter: {
			_and: [{ id: { _eq: id } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export async function loadPublicDiaryByShortId(
	shortId: string,
): Promise<AppDiary | null> {
	const rows = await readMany("app_diaries", {
		filter: {
			_and: [{ short_id: { _eq: shortId } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export async function loadPublicAlbumById(
	id: string,
): Promise<AppAlbum | null> {
	const normalizedId = String(id || "").trim();
	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			normalizedId,
		);
	if (!isUuid) {
		return null;
	}

	const rows = await readMany("app_albums", {
		filter: {
			_and: [{ id: { _eq: normalizedId } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export async function loadPublicAlbumByShortId(
	shortId: string,
): Promise<AppAlbum | null> {
	const rows = await readMany("app_albums", {
		filter: {
			_and: [{ short_id: { _eq: shortId } }, filterPublicStatus()],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

export function toDirectusAssetQuery(
	query: URLSearchParams,
): Partial<Record<"width" | "height" | "fit" | "quality" | "format", string>> {
	const output: Partial<
		Record<"width" | "height" | "fit" | "quality" | "format", string>
	> = {};
	const ALLOWED_FORMATS = ["jpeg", "png", "webp", "avif", "tiff"];
	const ALLOWED_FITS = ["cover", "contain", "inside", "outside"];
	const MAX_DIMENSION = 4096;
	const widthRaw = parseInt(query.get("width") || "", 10);
	if (widthRaw > 0) {
		output.width = String(Math.min(widthRaw, MAX_DIMENSION));
	}
	const heightRaw = parseInt(query.get("height") || "", 10);
	if (heightRaw > 0) {
		output.height = String(Math.min(heightRaw, MAX_DIMENSION));
	}
	const fit = query.get("fit")?.trim() || "";
	if (fit && ALLOWED_FITS.includes(fit)) {
		output.fit = fit;
	}
	const qualityRaw = parseInt(query.get("quality") || "", 10);
	if (qualityRaw > 0) {
		output.quality = String(Math.min(Math.max(qualityRaw, 1), 100));
	}
	const format = query.get("format")?.trim() || "";
	if (format && ALLOWED_FORMATS.includes(format)) {
		output.format = format;
	}
	return output;
}
