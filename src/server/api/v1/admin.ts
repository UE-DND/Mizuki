import type { APIContext } from "astro";

import type { AppPermissions, AppProfile } from "@/types/app";
import type { JsonObject } from "@/types/json";
import type {
	EditableSiteSettings,
	SiteSettingsPayload,
} from "@/types/site-settings";
import { createUniqueUsername } from "@/server/auth/acl";
import {
	normalizeRequestedUsername,
	validateDisplayName,
} from "@/server/auth/username";
import {
	createDirectusUser,
	createOne,
	deleteDirectusFile,
	deleteOne,
	listDirectusUsers,
	readMany,
	updateDirectusUser,
	updateOne,
} from "@/server/directus/client";
import { fail, ok } from "@/server/api/response";
import {
	parseJsonBody,
	parsePagination,
	toBooleanValue,
	toOptionalString,
	toStringValue,
} from "@/server/api/utils";
import {
	getResolvedSiteSettings,
	invalidateSiteSettingsCache,
	resolveSiteSettingsPayload,
} from "@/server/site-settings/service";
import { invalidateOfficialSidebarCache } from "./public-data";

import {
	ADMIN_MODULE_COLLECTION,
	DEFAULT_LIST_LIMIT,
	type AdminModuleKey,
	ensureUsernameAvailable,
	hasOwn,
	normalizeAppRole,
	parseBodyTextField,
	parseProfileBioField,
	parseProfileTypewriterSpeedField,
	parseRouteId,
	parseSocialLinks,
	requireAdmin,
} from "./shared";
import { invalidateAuthorCache } from "./shared/author-cache";

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
	const created = await createOne("app_user_profiles", {
		status: "published",
		user_id: userId,
		username: normalizedUsername,
		display_name: normalizedUsername,
		bio: null,
		bio_typewriter_enable: true,
		bio_typewriter_speed: 80,
		avatar_file: null,
		avatar_url: null,
		profile_public: true,
		show_articles_on_profile: true,
		show_diaries_on_profile: true,
		show_anime_on_profile: true,
		show_albums_on_profile: true,
		show_comments_on_profile: true,
	});
	invalidateAuthorCache(userId);
	return created;
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

async function readSiteSettingsRowMeta(): Promise<{
	id: string;
	updatedAt: string | null;
} | null> {
	const rows = await readMany("app_site_settings", {
		filter: { key: { _eq: "default" } } as JsonObject,
		limit: 1,
		sort: ["-date_updated", "-date_created"],
		fields: ["id", "date_updated", "date_created"],
	});
	const row = rows[0];
	if (!row) {
		return null;
	}
	return {
		id: row.id,
		updatedAt: row.date_updated || row.date_created || null,
	};
}

async function upsertSiteSettings(
	settings: SiteSettingsPayload,
): Promise<{ updatedAt: string | null }> {
	const existing = await readSiteSettingsRowMeta();
	if (!existing) {
		const created = await createOne("app_site_settings", {
			key: "default",
			status: "published",
			settings,
		});
		return {
			updatedAt: created.date_updated || created.date_created || null,
		};
	}

	const updated = await updateOne("app_site_settings", existing.id, {
		key: "default",
		status: "published",
		settings,
	});
	return {
		updatedAt: updated.date_updated || updated.date_created || null,
	};
}

const DIRECTUS_FILE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractDirectusFileIdFromAssetValue(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const raw = value.trim();
	if (!raw) {
		return null;
	}
	if (DIRECTUS_FILE_ID_PATTERN.test(raw)) {
		return raw;
	}
	try {
		const parsed = new URL(raw, "http://localhost");
		const path = parsed.pathname;
		const directPattern = /^\/api\/v1\/public\/assets\/([^/?#]+)\/?$/;
		const assetPattern = /^\/assets\/([^/?#]+)\/?$/;
		const matched =
			path.match(directPattern)?.[1] ||
			path.match(assetPattern)?.[1] ||
			"";
		if (!matched) {
			return null;
		}
		const decoded = decodeURIComponent(matched).trim();
		return DIRECTUS_FILE_ID_PATTERN.test(decoded) ? decoded : null;
	} catch {
		return null;
	}
}

function collectBannerAssetValues(value: unknown): string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value
			.map((entry) => (typeof entry === "string" ? entry : ""))
			.filter(Boolean);
	}
	if (value && typeof value === "object") {
		const record = value as {
			desktop?: string | string[];
			mobile?: string | string[];
		};
		const collected: string[] = [];
		const append = (input: unknown): void => {
			if (typeof input === "string") {
				if (input.trim()) {
					collected.push(input);
				}
				return;
			}
			if (Array.isArray(input)) {
				for (const item of input) {
					if (typeof item === "string" && item.trim()) {
						collected.push(item);
					}
				}
			}
		};
		append(record.desktop);
		append(record.mobile);
		return collected;
	}
	return [];
}

function collectSettingsFileIds(settings: SiteSettingsPayload): Set<string> {
	const ids = new Set<string>();
	for (const item of settings.site.favicon || []) {
		const fileId = extractDirectusFileIdFromAssetValue(item.src);
		if (fileId) {
			ids.add(fileId);
		}
	}
	for (const source of collectBannerAssetValues(settings.banner.src)) {
		const fileId = extractDirectusFileIdFromAssetValue(source);
		if (fileId) {
			ids.add(fileId);
		}
	}
	return ids;
}

export async function handleAdminUsers(
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
				bio_typewriter_enable: toBooleanValue(
					body.bio_typewriter_enable,
					true,
				),
				bio_typewriter_speed: parseProfileTypewriterSpeedField(
					body.bio_typewriter_speed,
					80,
				),
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

			invalidateAuthorCache(createdUser.id);
			invalidateOfficialSidebarCache();
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
			}
			if (hasOwn(body, "display_name")) {
				profilePayload.display_name = validateDisplayName(
					parseBodyTextField(body, "display_name"),
				);
			}
			if (hasOwn(body, "social_links")) {
				profilePayload.social_links = parseSocialLinks(
					body.social_links,
				);
			}
			if (hasOwn(body, "bio")) {
				profilePayload.bio = parseProfileBioField(body.bio);
			}
			if (hasOwn(body, "bio_typewriter_enable")) {
				profilePayload.bio_typewriter_enable = toBooleanValue(
					body.bio_typewriter_enable,
					profile.bio_typewriter_enable,
				);
			}
			if (hasOwn(body, "bio_typewriter_speed")) {
				profilePayload.bio_typewriter_speed =
					parseProfileTypewriterSpeedField(
						body.bio_typewriter_speed,
						profile.bio_typewriter_speed,
					);
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

			invalidateAuthorCache(userId);
			invalidateOfficialSidebarCache();
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

export async function handleAdminContent(
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
						rowBody ||
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

export async function handleAdminSettings(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	const required = await requireAdmin(context);
	if ("response" in required) {
		return required.response;
	}

	if (segments.length !== 2 || segments[1] !== "site") {
		return fail("未找到接口", 404);
	}

	if (context.request.method === "GET") {
		const [resolved, rowMeta] = await Promise.all([
			getResolvedSiteSettings(),
			readSiteSettingsRowMeta(),
		]);
		return ok({
			settings: resolved.settings,
			updated_at: rowMeta?.updatedAt || null,
		});
	}

	if (context.request.method === "PATCH") {
		const body = await parseJsonBody(context.request);
		const patch = body as Partial<EditableSiteSettings>;
		const current = await getResolvedSiteSettings();
		const settings = resolveSiteSettingsPayload(patch, current.settings);
		const prevFileIds = collectSettingsFileIds(current.settings);
		const nextFileIds = collectSettingsFileIds(settings);
		const removedFileIds = [...prevFileIds].filter(
			(fileId) => !nextFileIds.has(fileId),
		);
		const { updatedAt } = await upsertSiteSettings(settings);
		invalidateSiteSettingsCache();
		for (const fileId of removedFileIds) {
			await deleteDirectusFile(fileId);
		}
		return ok({
			settings,
			updated_at: updatedAt,
		});
	}

	return fail("方法不允许", 405);
}
