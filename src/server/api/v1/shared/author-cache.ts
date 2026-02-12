import type { AppProfile, AppUser } from "@/types/app";
import type { JsonObject } from "@/types/json";
import { readMany } from "@/server/directus/client";
import { buildDirectusAssetUrl } from "@/server/directus-auth";

const AUTHOR_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedAuthorBundle = {
	expiresAt: number;
	value: AuthorBundleItem;
};

export type AuthorBundleItem = {
	id: string;
	name: string;
	display_name?: string;
	username?: string;
	avatar_url?: string;
};

type ProfileWithRelationUser = AppProfile & {
	user?: Partial<AppUser> | null;
};

const authorCache = new Map<string, CachedAuthorBundle>();

function nowMs(): number {
	return Date.now();
}

function computeDisplayName(
	user?: Partial<AppUser> | null,
): string | undefined {
	if (!user) {
		return undefined;
	}
	const fullName = [user.first_name, user.last_name]
		.map((entry) => (entry || "").trim())
		.filter(Boolean)
		.join(" ")
		.trim();
	if (fullName) {
		return fullName;
	}
	const email = typeof user.email === "string" ? user.email.trim() : "";
	if (email) {
		return email.split("@")[0] || email;
	}
	return undefined;
}

function normalizeUsername(
	rawUsername: string | null | undefined,
	userId: string,
): string {
	const raw = String(rawUsername || "").trim();
	if (!raw) {
		return `user-${String(userId || "").slice(0, 8)}`;
	}
	if (!raw.includes("@")) {
		return raw;
	}
	return (
		(raw.split("@")[0] || "").trim() ||
		`user-${String(userId || "").slice(0, 8)}`
	);
}

function resolveAvatarUrl(
	profile: AppProfile | null,
	user: Partial<AppUser> | null,
): string | undefined {
	if (profile?.avatar_url?.trim()) {
		return profile.avatar_url;
	}
	if (profile?.avatar_file) {
		return buildDirectusAssetUrl(profile.avatar_file, {
			width: 96,
			height: 96,
			fit: "cover",
		});
	}
	if (user?.avatar) {
		return buildDirectusAssetUrl(user.avatar, {
			width: 96,
			height: 96,
			fit: "cover",
		});
	}
	return undefined;
}

function toAuthorBundle(
	userId: string,
	profile: AppProfile | null,
	user: Partial<AppUser> | null,
): AuthorBundleItem {
	const username = normalizeUsername(profile?.username, userId);
	const displayName =
		String(profile?.display_name || "").trim() || computeDisplayName(user);
	return {
		id: userId,
		name: username || displayName || "Member",
		display_name: displayName || username || "Member",
		username,
		avatar_url: resolveAvatarUrl(profile, user),
	};
}

function getCached(userId: string): AuthorBundleItem | null {
	const cached = authorCache.get(userId);
	if (!cached) {
		return null;
	}
	if (cached.expiresAt <= nowMs()) {
		authorCache.delete(userId);
		return null;
	}
	return cached.value;
}

function setCached(userId: string, value: AuthorBundleItem): void {
	authorCache.set(userId, {
		expiresAt: nowMs() + AUTHOR_CACHE_TTL_MS,
		value,
	});
}

function pruneExpiredCache(): void {
	const now = nowMs();
	for (const [key, value] of authorCache.entries()) {
		if (value.expiresAt <= now) {
			authorCache.delete(key);
		}
	}
}

function uniqueUserIds(userIds: string[]): string[] {
	return Array.from(
		new Set(
			userIds.map((entry) => String(entry || "").trim()).filter(Boolean),
		),
	);
}

async function readProfiles(
	userIds: string[],
): Promise<ProfileWithRelationUser[]> {
	try {
		return (await readMany("app_user_profiles", {
			filter: {
				user_id: { _in: userIds },
			} as JsonObject,
			fields: [
				"user_id",
				"username",
				"display_name",
				"avatar_url",
				"avatar_file",
				"user.id",
				"user.email",
				"user.first_name",
				"user.last_name",
				"user.avatar",
			],
			limit: Math.max(userIds.length, 20),
		})) as ProfileWithRelationUser[];
	} catch (error) {
		console.warn(
			"[api/v1/author-cache] profile relation query failed, fallback:",
			error,
		);
		return (await readMany("app_user_profiles", {
			filter: {
				user_id: { _in: userIds },
			} as JsonObject,
			fields: [
				"user_id",
				"username",
				"display_name",
				"avatar_url",
				"avatar_file",
			],
			limit: Math.max(userIds.length, 20),
		})) as ProfileWithRelationUser[];
	}
}

async function fetchAuthorsForUsers(
	userIds: string[],
): Promise<Map<string, AuthorBundleItem>> {
	const result = new Map<string, AuthorBundleItem>();
	if (userIds.length === 0) {
		return result;
	}

	const profiles = await readProfiles(userIds);
	const profileMap = new Map<string, ProfileWithRelationUser>();
	const relationUserMap = new Map<string, Partial<AppUser>>();

	for (const profile of profiles) {
		if (!profile.user_id) {
			continue;
		}
		profileMap.set(profile.user_id, profile);
		if (profile.user) {
			relationUserMap.set(profile.user_id, profile.user);
		}
	}

	const missingUserIds = userIds.filter(
		(userId) => !relationUserMap.has(userId),
	);
	const userMap = new Map<string, Partial<AppUser>>();
	for (const [userId, relationUser] of relationUserMap.entries()) {
		userMap.set(userId, relationUser);
	}

	if (missingUserIds.length > 0) {
		const users = await readMany("directus_users", {
			filter: {
				id: { _in: missingUserIds },
			} as JsonObject,
			fields: ["id", "email", "first_name", "last_name", "avatar"],
			limit: Math.max(missingUserIds.length, 20),
		});
		for (const user of users) {
			userMap.set(user.id, user);
		}
	}

	for (const userId of userIds) {
		result.set(
			userId,
			toAuthorBundle(
				userId,
				profileMap.get(userId) || null,
				userMap.get(userId) || null,
			),
		);
	}

	return result;
}

export function invalidateAuthorCache(userId: string): void {
	authorCache.delete(String(userId || "").trim());
}

export function invalidateAuthorCacheByUsers(userIds: string[]): void {
	for (const userId of userIds) {
		invalidateAuthorCache(userId);
	}
}

export async function getAuthorBundle(
	userIds: string[],
): Promise<Map<string, AuthorBundleItem>> {
	pruneExpiredCache();

	const normalizedIds = uniqueUserIds(userIds);
	const result = new Map<string, AuthorBundleItem>();
	const missIds: string[] = [];

	for (const userId of normalizedIds) {
		const cached = getCached(userId);
		if (cached) {
			result.set(userId, cached);
			continue;
		}
		missIds.push(userId);
	}

	if (missIds.length > 0) {
		const fetched = await fetchAuthorsForUsers(missIds);
		for (const [userId, bundle] of fetched.entries()) {
			setCached(userId, bundle);
			result.set(userId, bundle);
		}
	}

	return result;
}
