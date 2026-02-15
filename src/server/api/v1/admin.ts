import type { APIContext } from "astro";

import type {
	AppPermissions,
	AppProfile,
	AppUserRegistrationRequest,
	RegistrationRequestStatus,
} from "@/types/app";
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
	countItems,
	createDirectusUser,
	createOne,
	deleteDirectusUser,
	deleteOne,
	listDirectusUsers,
	readMany,
	updateDirectusFileMetadata,
	updateManyItemsByFilter,
	updateDirectusUser,
	updateOne,
} from "@/server/directus/client";
import { badRequest, conflict, notFound } from "@/server/api/errors";
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
	cleanupOrphanDirectusFiles,
	collectAlbumFileIds,
	collectDiaryFileIds,
	collectUserOwnedFileIds,
	normalizeDirectusFileId,
} from "./shared/file-cleanup";

import {
	ADMIN_MODULE_COLLECTION,
	DEFAULT_LIST_LIMIT,
	type AdminModuleKey,
	ensureUsernameAvailable,
	hasOwn,
	normalizeAppRole,
	normalizeRegistrationRequestStatus,
	parseBodyTextField,
	parseProfileBioField,
	parseProfileTypewriterSpeedField,
	parseRouteId,
	parseSocialLinks,
	requireAdmin,
} from "./shared";
import { invalidateAuthorCache } from "./shared/author-cache";
import { cacheManager } from "@/server/cache/manager";

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
	return [];
}

function collectSettingsFileIds(settings: SiteSettingsPayload): Set<string> {
	const ids = new Set<string>();
	const collectSingleAsset = (value: unknown): void => {
		const fileId = extractDirectusFileIdFromAssetValue(value);
		if (fileId) {
			ids.add(fileId);
		}
	};

	for (const item of settings.site.favicon || []) {
		collectSingleAsset(item.src);
	}
	for (const source of collectBannerAssetValues(settings.banner.src)) {
		collectSingleAsset(source);
	}
	collectSingleAsset(settings.navbarTitle.icon);
	collectSingleAsset(settings.navbarTitle.logo);
	collectSingleAsset(settings.profile.avatar);
	return ids;
}

const REGISTRATION_REASON_MAX_LENGTH = 500;

function parseOptionalRegistrationReason(raw: unknown): string | null {
	const reason = String(raw ?? "").trim() || null;
	if (!reason) {
		return null;
	}
	if (reason.length > REGISTRATION_REASON_MAX_LENGTH) {
		throw badRequest(
			"REGISTRATION_REASON_TOO_LONG",
			"注册理由最多 500 字符",
		);
	}
	return reason;
}

function parseNormalizedEmail(raw: unknown): string {
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

async function assertDirectusEmailAvailable(email: string): Promise<void> {
	const rows = await readMany("directus_users", {
		filter: { email: { _eq: email } } as JsonObject,
		limit: 1,
		fields: ["id"],
	});
	if (rows.length > 0) {
		throw conflict("EMAIL_EXISTS", "邮箱已存在");
	}
}

type ManagedUserCreateInput = {
	email: string;
	password: string;
	requestedUsername: string;
	displayName: string;
	avatarFile?: string | null;
	appRole?: AppPermissions["app_role"];
};

type ManagedUserCreateResult = {
	user: { id: string };
	profile: AppProfile;
	permissions: AppPermissions;
};

async function createManagedUser(
	input: ManagedUserCreateInput,
): Promise<ManagedUserCreateResult> {
	await Promise.all([
		assertDirectusEmailAvailable(input.email),
		ensureUsernameAvailable(input.requestedUsername),
	]);

	const createdUser = await createDirectusUser({
		email: input.email,
		password: input.password,
		first_name: input.displayName || undefined,
		status: "active",
	});

	const profile = await createOne("app_user_profiles", {
		status: "published",
		user_id: createdUser.id,
		username: input.requestedUsername,
		display_name: input.displayName,
		bio: null,
		bio_typewriter_enable: true,
		bio_typewriter_speed: 80,
		avatar_file: input.avatarFile || null,
		avatar_url: null,
		profile_public: true,
		show_articles_on_profile: true,
		show_diaries_on_profile: true,
		show_anime_on_profile: true,
		show_albums_on_profile: true,
		show_comments_on_profile: true,
	});

	const permissions = await createOne("app_user_permissions", {
		status: "published",
		user_id: createdUser.id,
		app_role: normalizeAppRole(input.appRole || "member"),
		can_publish_articles: true,
		can_comment_articles: true,
		can_manage_diaries: true,
		can_comment_diaries: true,
		can_manage_anime: true,
		can_manage_albums: true,
		can_upload_files: true,
	});

	invalidateAuthorCache(createdUser.id);
	invalidateOfficialSidebarCache();
	return { user: createdUser, profile, permissions };
}

async function readRegistrationRequestById(
	requestId: string,
): Promise<AppUserRegistrationRequest | null> {
	const rows = await readMany("app_user_registration_requests", {
		filter: { id: { _eq: requestId } } as JsonObject,
		limit: 1,
		fields: [
			"id",
			"email",
			"username",
			"display_name",
			"avatar_file",
			"registration_password",
			"registration_reason",
			"request_status",
			"reviewed_by",
			"reviewed_at",
			"reject_reason",
			"approved_user_id",
			"status",
			"sort",
			"user_created",
			"date_created",
			"user_updated",
			"date_updated",
		],
	});
	return rows[0] || null;
}

function ensurePendingRegistrationStatus(
	status: RegistrationRequestStatus,
): void {
	if (status !== "pending") {
		throw conflict(
			"REGISTRATION_STATUS_CONFLICT",
			"申请状态冲突，请刷新后重试",
		);
	}
}

const USER_DELETE_NULLIFY_REFERENCES: Array<{
	collection: string;
	field: string;
}> = [
	{ collection: "directus_notifications", field: "sender" },
	{ collection: "directus_versions", field: "user_updated" },
	{ collection: "directus_comments", field: "user_updated" },
	{ collection: "app_site_settings", field: "user_created" },
	{ collection: "app_site_settings", field: "user_updated" },
	{ collection: "app_diary_likes", field: "user_created" },
	{ collection: "app_diary_likes", field: "user_updated" },
	{ collection: "ai_prompts", field: "user_created" },
	{ collection: "ai_prompts", field: "user_updated" },
];

async function nullifyUserReferenceField(
	collection: string,
	field: string,
	userId: string,
): Promise<void> {
	try {
		await updateManyItemsByFilter({
			collection,
			filter: { [field]: { _eq: userId } } as JsonObject,
			data: { [field]: null } as JsonObject,
		});
	} catch (error) {
		const message = String(error);
		if (
			message.includes("COLLECTION_NOT_FOUND") ||
			message.includes("ITEM_NOT_FOUND") ||
			message.includes("404")
		) {
			return;
		}
		if (
			/forbidden|permission|readonly|read-only|invalid payload|field/i.test(
				message,
			)
		) {
			console.warn(
				`[admin/users] skip nullify reference ${collection}.${field}:`,
				message,
			);
			return;
		}
		throw error;
	}
}

async function clearBlockingUserReferences(userId: string): Promise<void> {
	for (const target of USER_DELETE_NULLIFY_REFERENCES) {
		await nullifyUserReferenceField(
			target.collection,
			target.field,
			userId,
		);
	}
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
			return fail("接口不存在", 404, "LEGACY_ENDPOINT_DISABLED");
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
			const prevAvatarFile = normalizeDirectusFileId(profile.avatar_file);
			let nextAvatarFile = prevAvatarFile;

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
				nextAvatarFile = normalizeDirectusFileId(body.avatar_file);
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
			if (hasOwn(body, "avatar_file") && nextAvatarFile) {
				await updateDirectusFileMetadata(nextAvatarFile, {
					uploaded_by: userId,
				});
			}
			if (
				hasOwn(body, "avatar_file") &&
				prevAvatarFile &&
				prevAvatarFile !== nextAvatarFile
			) {
				await cleanupOrphanDirectusFiles([prevAvatarFile]);
			}
			return ok({
				id: userId,
				profile: updatedProfile,
				permissions: updatedPermissions,
			});
		}

		if (context.request.method === "DELETE") {
			if (required.access.user.id === userId) {
				throw badRequest(
					"USER_DELETE_SELF_FORBIDDEN",
					"不能删除当前登录账号",
				);
			}
			let candidateFileIds: string[] = [];
			try {
				candidateFileIds = await collectUserOwnedFileIds(userId);
			} catch (error) {
				const message = String(error);
				if (/forbidden|permission/i.test(message)) {
					console.warn(
						"[admin/users] skip collectUserOwnedFileIds due to permission:",
						message,
					);
				} else {
					throw error;
				}
			}

			const referencedFilesPromise = readMany("directus_files", {
				filter: {
					_or: [
						{ uploaded_by: { _eq: userId } },
						{ modified_by: { _eq: userId } },
					],
				} as JsonObject,
				limit: 5000,
				fields: ["id", "uploaded_by", "modified_by"],
			}).catch((error) => {
				const message = String(error);
				if (/forbidden|permission/i.test(message)) {
					console.warn(
						"[admin/users] skip read referenced directus_files due to permission:",
						message,
					);
					return [];
				}
				throw error;
			});

			const [
				profiles,
				permissions,
				registrationRequests,
				referencedFiles,
			] = await Promise.all([
				readMany("app_user_profiles", {
					filter: { user_id: { _eq: userId } } as JsonObject,
					limit: 10,
					fields: ["id"],
				}),
				readMany("app_user_permissions", {
					filter: { user_id: { _eq: userId } } as JsonObject,
					limit: 10,
					fields: ["id"],
				}),
				readMany("app_user_registration_requests", {
					filter: {
						approved_user_id: { _eq: userId },
					} as JsonObject,
					limit: 200,
					fields: ["id", "avatar_file"],
				}),
				referencedFilesPromise,
			]);

			for (const profile of profiles) {
				await deleteOne("app_user_profiles", profile.id);
			}
			for (const permission of permissions) {
				await deleteOne("app_user_permissions", permission.id);
			}
			for (const request of registrationRequests) {
				if (!request.avatar_file) {
					continue;
				}
				await updateOne("app_user_registration_requests", request.id, {
					avatar_file: null,
				});
			}
			for (const file of referencedFiles) {
				const payload: {
					uploaded_by?: null;
					modified_by?: null;
				} = {};
				if (String(file.uploaded_by || "").trim() === userId) {
					payload.uploaded_by = null;
				}
				if (String(file.modified_by || "").trim() === userId) {
					payload.modified_by = null;
				}
				if (Object.keys(payload).length === 0) {
					continue;
				}
				try {
					await updateDirectusFileMetadata(file.id, payload);
				} catch (error) {
					const message = String(error);
					if (
						payload.uploaded_by === null &&
						payload.modified_by === null
					) {
						try {
							await updateDirectusFileMetadata(file.id, {
								uploaded_by: null,
							});
							continue;
						} catch (fallbackError) {
							console.warn(
								`[admin/users] skip file cleanup ${file.id}:`,
								String(fallbackError),
							);
							continue;
						}
					}
					console.warn(
						`[admin/users] skip file cleanup ${file.id}:`,
						message,
					);
				}
			}
			await clearBlockingUserReferences(userId);

			await deleteDirectusUser(userId);
			await cleanupOrphanDirectusFiles(candidateFileIds);
			invalidateAuthorCache(userId);
			invalidateOfficialSidebarCache();
			return ok({ id: userId, deleted: true });
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

export async function handleAdminRegistrationRequests(
	context: APIContext,
	segments: string[],
): Promise<Response> {
	const required = await requireAdmin(context);
	if ("response" in required) {
		return required.response;
	}

	if (segments.length === 1 && context.request.method === "GET") {
		const { page, limit, offset } = parsePagination(context.url);
		const statusRaw = String(
			context.url.searchParams.get("status") || "",
		).trim();

		let statusFilter: RegistrationRequestStatus | null = null;
		if (statusRaw && statusRaw !== "all") {
			const normalized = normalizeRegistrationRequestStatus(
				statusRaw,
				"pending",
			);
			if (normalized !== statusRaw) {
				throw badRequest(
					"REGISTRATION_STATUS_INVALID",
					"申请状态参数无效",
				);
			}
			statusFilter = normalized;
		}

		const filter = statusFilter
			? ({ request_status: { _eq: statusFilter } } as JsonObject)
			: undefined;
		const [items, total] = await Promise.all([
			readMany("app_user_registration_requests", {
				filter,
				sort: ["-date_created"],
				limit,
				offset,
				fields: [
					"id",
					"email",
					"username",
					"display_name",
					"avatar_file",
					"registration_reason",
					"request_status",
					"reviewed_by",
					"reviewed_at",
					"reject_reason",
					"approved_user_id",
					"status",
					"sort",
					"user_created",
					"date_created",
					"user_updated",
					"date_updated",
				],
			}),
			countItems("app_user_registration_requests", filter),
		]);

		return ok({
			items,
			page,
			limit,
			total,
		});
	}

	if (segments.length === 2 && context.request.method === "PATCH") {
		const requestId = parseRouteId(segments[1]);
		if (!requestId) {
			return fail("缺少申请 ID", 400);
		}
		const body = await parseJsonBody(context.request);
		const action = parseBodyTextField(body, "action");
		const target = await readRegistrationRequestById(requestId);
		if (!target) {
			throw notFound("REGISTRATION_NOT_FOUND", "申请不存在");
		}
		ensurePendingRegistrationStatus(
			normalizeRegistrationRequestStatus(
				target.request_status,
				"pending",
			),
		);

		const reviewedBy = required.access.user.id;
		const reviewedAt = new Date().toISOString();

		if (action === "approve") {
			const password = String(target.registration_password || "");
			if (!password) {
				throw badRequest(
					"REGISTRATION_PASSWORD_MISSING",
					"申请缺少密码，请让用户重新提交申请",
				);
			}

			const created = await createManagedUser({
				email: parseNormalizedEmail(target.email),
				password,
				requestedUsername: normalizeRequestedUsername(target.username),
				displayName: validateDisplayName(target.display_name),
				avatarFile: target.avatar_file,
				appRole: "member",
			});
			const registrationAvatarFileId = normalizeDirectusFileId(
				target.avatar_file,
			);
			if (registrationAvatarFileId) {
				await updateDirectusFileMetadata(registrationAvatarFileId, {
					uploaded_by: created.user.id,
				});
			}

			const updated = await updateOne(
				"app_user_registration_requests",
				target.id,
				{
					request_status: "approved",
					reviewed_by: reviewedBy,
					reviewed_at: reviewedAt,
					approved_user_id: created.user.id,
					registration_password: null,
					reject_reason: null,
				},
			);
			return ok({
				item: updated,
				user: created.user,
				profile: created.profile,
				permissions: created.permissions,
			});
		}

		if (action === "reject" || action === "cancel") {
			const reason =
				action === "reject"
					? parseOptionalRegistrationReason(body.reason)
					: null;
			const updated = await updateOne(
				"app_user_registration_requests",
				target.id,
				{
					request_status:
						action === "reject" ? "rejected" : "cancelled",
					reviewed_by: reviewedBy,
					reviewed_at: reviewedAt,
					registration_password: null,
					reject_reason: action === "reject" ? reason : null,
				},
			);
			return ok({ item: updated });
		}

		throw badRequest("REGISTRATION_ACTION_INVALID", "不支持的申请操作");
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
			// 失效缓存
			if (module === "articles") {
				void cacheManager.invalidateByDomain("article-list");
				void cacheManager.invalidate("article-detail", id);
			} else if (module === "diaries") {
				void cacheManager.invalidateByDomain("diary-list");
				void cacheManager.invalidate("diary-detail", id);
			} else if (module === "albums") {
				void cacheManager.invalidateByDomain("album-list");
				void cacheManager.invalidate("album-detail", id);
			}
			return ok({ item: updated });
		}

		if (context.request.method === "DELETE") {
			const candidateFileIds: string[] = [];
			if (module === "articles") {
				const rows = await readMany("app_articles", {
					filter: { id: { _eq: id } } as JsonObject,
					fields: ["cover_file"],
					limit: 1,
				});
				const coverFile = normalizeDirectusFileId(rows[0]?.cover_file);
				if (coverFile) {
					candidateFileIds.push(coverFile);
				}
			}
			if (module === "anime") {
				const rows = await readMany("app_anime_entries", {
					filter: { id: { _eq: id } } as JsonObject,
					fields: ["cover_file"],
					limit: 1,
				});
				const coverFile = normalizeDirectusFileId(rows[0]?.cover_file);
				if (coverFile) {
					candidateFileIds.push(coverFile);
				}
			}
			if (module === "albums") {
				const rows = await readMany("app_albums", {
					filter: { id: { _eq: id } } as JsonObject,
					fields: ["cover_file"],
					limit: 1,
				});
				const fileIds = await collectAlbumFileIds(
					id,
					rows[0]?.cover_file,
				);
				candidateFileIds.push(...fileIds);
			}
			if (module === "diaries") {
				const fileIds = await collectDiaryFileIds(id);
				candidateFileIds.push(...fileIds);
			}
			await deleteOne(collection, id);
			await cleanupOrphanDirectusFiles(candidateFileIds);
			// 失效缓存
			if (module === "articles") {
				void cacheManager.invalidateByDomain("article-list");
				void cacheManager.invalidate("article-detail", id);
			} else if (module === "diaries") {
				void cacheManager.invalidateByDomain("diary-list");
				void cacheManager.invalidate("diary-detail", id);
			} else if (module === "albums") {
				void cacheManager.invalidateByDomain("album-list");
				void cacheManager.invalidate("album-detail", id);
			}
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
		await cleanupOrphanDirectusFiles(removedFileIds);
		return ok({
			settings,
			updated_at: updatedAt,
		});
	}

	return fail("方法不允许", 405);
}
