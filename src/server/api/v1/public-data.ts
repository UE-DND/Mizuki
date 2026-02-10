import type {
	AppAlbum,
	AppAlbumPhoto,
	AppAnimeEntry,
	AppArticle,
	AppArticleComment,
	AppDiary,
	AppDiaryComment,
	AppDiaryImage,
	AppProfile,
	SidebarProfileData,
} from "@/types/app";
import type { JsonObject } from "@/types/json";
import { countItems, readMany } from "@/server/directus/client";
import { buildDirectusAssetUrl } from "@/server/directus-auth";
import { isShortId } from "@/server/utils/short-id";

import type { AuthorBundleItem } from "./shared/author-cache";
import { getAuthorBundle } from "./shared/author-cache";
import {
	DEFAULT_LIST_LIMIT,
	filterPublicStatus,
	loadPublicAlbumByShortId,
	loadPublicDiaryByShortId,
	safeCsv,
} from "./shared";

// ---------------------------------------------------------------------------
// ContentLoadResult — distinguish "not found" from "permission denied"
// ---------------------------------------------------------------------------

export type ContentLoadResult<T> =
	| { status: "ok"; data: T }
	| { status: "not_found" }
	| { status: "permission_denied"; reason: string };

// ---------------------------------------------------------------------------
// ViewerOptions — pass current viewer to bypass privacy for owner
// ---------------------------------------------------------------------------

export type ViewerOptions = { viewerId?: string | null };

/** Owner sees everything; non-owner sees published + public + show_on_profile */
function itemFilters(isOwner: boolean): JsonObject[] {
	return isOwner
		? []
		: [filterPublicStatus(), { show_on_profile: { _eq: true } }];
}

// ---------------------------------------------------------------------------
// Internal helper: load profile by username WITHOUT filtering profile_public
// ---------------------------------------------------------------------------

async function loadProfileByUsername(
	username: string,
): Promise<AppProfile | null> {
	const rows = await readMany("app_user_profiles", {
		filter: { username: { _eq: username } } as JsonObject,
		limit: 1,
	});
	return (rows[0] as AppProfile | undefined) ?? null;
}

function toAuthorFallback(userId: string): AuthorBundleItem {
	const normalized = String(userId || "").trim();
	const shortId = (normalized || "user").slice(0, 8);
	return {
		id: normalized,
		name: `user-${shortId}`,
		username: `user-${shortId}`,
	};
}

export function readAuthor(
	authorMap: Map<string, AuthorBundleItem>,
	userId: string,
): AuthorBundleItem {
	return authorMap.get(userId) || toAuthorFallback(userId);
}

export async function loadPublicProfileByUsername(
	username: string,
): Promise<AppProfile | null> {
	const rows = await readMany("app_user_profiles", {
		filter: {
			_and: [
				{ username: { _eq: username } },
				{ profile_public: { _eq: true } },
			],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

/**
 * Load profile for a specific viewer.
 * Owner always gets the profile; non-owner requires profile_public=true.
 */
export async function loadProfileForViewer(
	username: string,
	viewerId?: string | null,
): Promise<AppProfile | null> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return null;
	}
	const isOwner = Boolean(viewerId) && viewerId === profile.user_id;
	if (isOwner || profile.profile_public) {
		return profile;
	}
	return null;
}

export type UserHomeData = {
	profile: AppProfile;
	owner: {
		id: string;
		name: string;
		username?: string;
		avatar_url?: string;
	};
	articles: Array<AppArticle & { tags: string[] }>;
	diaries: AppDiary[];
	anime: Array<AppAnimeEntry & { genres: string[] }>;
	albums: Array<AppAlbum & { tags: string[] }>;
	comments: {
		article_comments: AppArticleComment[];
		diary_comments: AppDiaryComment[];
	};
};

export async function loadUserHomeData(
	username: string,
	options?: ViewerOptions,
): Promise<ContentLoadResult<UserHomeData>> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return { status: "not_found" };
	}
	const isOwnerViewing =
		Boolean(options?.viewerId) && options?.viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return { status: "permission_denied", reason: "profile_not_public" };
	}

	const targetUserId = profile.user_id;
	const [authorMap, articleComments, diaryComments] = await Promise.all([
		getAuthorBundle([targetUserId]),
		isOwnerViewing || profile.show_comments_on_profile
			? readMany("app_article_comments", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFilters(isOwnerViewing),
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
							...itemFilters(isOwnerViewing),
						],
					} as JsonObject,
					sort: ["-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppDiaryComment[]),
	]);

	const owner = readAuthor(authorMap, targetUserId);
	const ownerData = {
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
	};

	const [articles, diaries, anime, albums] = await Promise.all([
		isOwnerViewing || profile.show_articles_on_profile
			? readMany("app_articles", {
					filter: {
						_and: [
							{ author_id: { _eq: targetUserId } },
							...itemFilters(isOwnerViewing),
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
							...itemFilters(isOwnerViewing),
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
							...itemFilters(isOwnerViewing),
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
							...itemFilters(isOwnerViewing),
						],
					} as JsonObject,
					sort: ["-date", "-date_created"],
					limit: 20,
				})
			: Promise.resolve([] as AppAlbum[]),
	]);

	return {
		status: "ok",
		data: {
			profile,
			owner: ownerData,
			articles: articles.map((item) => ({
				...item,
				tags: safeCsv(item.tags),
			})),
			diaries,
			anime: anime.map((item) => ({
				...item,
				genres: safeCsv(item.genres),
			})),
			albums: albums.map((item) => ({
				...item,
				tags: safeCsv(item.tags),
			})),
			comments:
				isOwnerViewing || profile.show_comments_on_profile
					? {
							article_comments:
								articleComments as AppArticleComment[],
							diary_comments: diaryComments as AppDiaryComment[],
						}
					: { article_comments: [], diary_comments: [] },
		},
	};
}

export type PaginatedResult<T> = {
	items: T[];
	page: number;
	limit: number;
	total: number;
};

export type UserAnimeListOptions = {
	page?: number;
	limit?: number;
	status?: string;
};

export async function loadUserAnimeList(
	username: string,
	options: UserAnimeListOptions & ViewerOptions = {},
): Promise<
	ContentLoadResult<
		PaginatedResult<
			AppAnimeEntry & { genres: string[]; author: AuthorBundleItem }
		>
	>
> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return { status: "not_found" };
	}
	const isOwnerViewing =
		Boolean(options.viewerId) && options.viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return { status: "permission_denied", reason: "profile_not_public" };
	}
	if (!isOwnerViewing && !profile.show_anime_on_profile) {
		return { status: "permission_denied", reason: "anime_not_public" };
	}
	const userId = profile.user_id;

	const page =
		options.page && options.page > 0 ? Math.floor(options.page) : 1;
	const limit =
		options.limit && options.limit > 0
			? Math.min(100, Math.floor(options.limit))
			: 20;
	const offset = (page - 1) * limit;

	const andFilters: JsonObject[] = [
		...itemFilters(isOwnerViewing),
		{ author_id: { _eq: userId } },
	];
	if (options.status) {
		andFilters.push({ watch_status: { _eq: options.status } });
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

	return { status: "ok", data: { items, page, limit, total } };
}

async function fetchDiaryCommentCountMap(
	diaryIds: string[],
): Promise<Map<string, number>> {
	if (diaryIds.length === 0) {
		return new Map();
	}
	const map = new Map<string, number>();
	await Promise.all(
		diaryIds.map(async (diaryId) => {
			try {
				const count = await countItems("app_diary_comments", {
					_and: [
						{ diary_id: { _eq: diaryId } },
						{ status: { _eq: "published" } },
						{ is_public: { _eq: true } },
					],
				} as JsonObject);
				map.set(diaryId, count);
			} catch (error) {
				console.warn(
					`[public-data] failed to load diary comment count: ${diaryId}`,
					error,
				);
				map.set(diaryId, 0);
			}
		}),
	);
	return map;
}

async function fetchDiaryLikeCountMap(
	diaryIds: string[],
): Promise<Map<string, number>> {
	if (diaryIds.length === 0) {
		return new Map();
	}
	const map = new Map<string, number>();
	await Promise.all(
		diaryIds.map(async (diaryId) => {
			try {
				const count = await countItems("app_diary_likes", {
					_and: [
						{ diary_id: { _eq: diaryId } },
						{ status: { _eq: "published" } },
					],
				} as JsonObject);
				map.set(diaryId, count);
			} catch (error) {
				console.warn(
					`[public-data] failed to load diary like count: ${diaryId}`,
					error,
				);
				map.set(diaryId, 0);
			}
		}),
	);
	return map;
}

export type UserDiaryListOptions = {
	page?: number;
	limit?: number;
};

export async function loadUserDiaryList(
	username: string,
	options: UserDiaryListOptions & ViewerOptions = {},
): Promise<
	ContentLoadResult<
		PaginatedResult<
			AppDiary & {
				author: AuthorBundleItem;
				images: AppDiaryImage[];
				comment_count: number;
				like_count: number;
			}
		>
	>
> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return { status: "not_found" };
	}
	const isOwnerViewing =
		Boolean(options.viewerId) && options.viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return { status: "permission_denied", reason: "profile_not_public" };
	}
	if (!isOwnerViewing && !profile.show_diaries_on_profile) {
		return { status: "permission_denied", reason: "diaries_not_public" };
	}
	const userId = profile.user_id;

	const page =
		options.page && options.page > 0 ? Math.floor(options.page) : 1;
	const limit =
		options.limit && options.limit > 0
			? Math.min(100, Math.floor(options.limit))
			: 20;
	const offset = (page - 1) * limit;

	const diaryFilter = {
		_and: [...itemFilters(isOwnerViewing), { author_id: { _eq: userId } }],
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
	const diaryImageFilters: JsonObject[] = [{ diary_id: { _in: diaryIds } }];
	if (!isOwnerViewing) {
		diaryImageFilters.push(
			{ status: { _eq: "published" } },
			{ is_public: { _eq: true } },
		);
	}
	const [images, authorMap, commentCountMap, likeCountMap] =
		await Promise.all([
			readMany("app_diary_images", {
				filter:
					diaryIds.length > 0
						? ({ _and: diaryImageFilters } as JsonObject)
						: ({ id: { _null: true } } as JsonObject),
				sort: ["sort", "-date_created"],
				limit: Math.max(diaryIds.length * 6, DEFAULT_LIST_LIMIT),
			}),
			getAuthorBundle([userId]),
			fetchDiaryCommentCountMap(diaryIds),
			fetchDiaryLikeCountMap(diaryIds),
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
		comment_count: commentCountMap.get(row.id) || 0,
		like_count: likeCountMap.get(row.id) || 0,
	}));

	return { status: "ok", data: { items, page, limit, total } };
}

export type DiaryDetail = AppDiary & {
	author: AuthorBundleItem;
	images: AppDiaryImage[];
};

export async function loadUserDiaryDetail(
	username: string,
	diaryId: string,
	options?: ViewerOptions,
): Promise<ContentLoadResult<DiaryDetail>> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return { status: "not_found" };
	}
	const isOwnerViewing =
		Boolean(options?.viewerId) && options?.viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return { status: "permission_denied", reason: "profile_not_public" };
	}
	if (!isOwnerViewing && !profile.show_diaries_on_profile) {
		return { status: "permission_denied", reason: "diaries_not_public" };
	}
	const userId = profile.user_id;

	if (!isShortId(diaryId)) {
		return { status: "not_found" };
	}

	let diary: AppDiary | null;
	if (isOwnerViewing) {
		// Owner: load without status/is_public filter
		const rows = await readMany("app_diaries", {
			filter: { short_id: { _eq: diaryId } } as JsonObject,
			limit: 1,
		});
		diary = (rows[0] as AppDiary | undefined) ?? null;
	} else {
		diary = await loadPublicDiaryByShortId(diaryId);
	}
	if (!diary || diary.author_id !== userId) {
		return { status: "not_found" };
	}
	if (!isOwnerViewing && !diary.show_on_profile) {
		return { status: "not_found" };
	}

	const diaryImageFilters: JsonObject[] = [{ diary_id: { _eq: diary.id } }];
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

	return {
		status: "ok",
		data: {
			...diary,
			author: readAuthor(authorMap, diary.author_id),
			images,
		},
	};
}

export type UserAlbumListOptions = {
	page?: number;
	limit?: number;
};

export async function loadUserAlbumList(
	username: string,
	options: UserAlbumListOptions & ViewerOptions = {},
): Promise<
	ContentLoadResult<
		PaginatedResult<AppAlbum & { tags: string[]; author: AuthorBundleItem }>
	>
> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return { status: "not_found" };
	}
	const isOwnerViewing =
		Boolean(options.viewerId) && options.viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return { status: "permission_denied", reason: "profile_not_public" };
	}
	if (!isOwnerViewing && !profile.show_albums_on_profile) {
		return { status: "permission_denied", reason: "albums_not_public" };
	}
	const userId = profile.user_id;

	const page =
		options.page && options.page > 0 ? Math.floor(options.page) : 1;
	const limit =
		options.limit && options.limit > 0
			? Math.min(100, Math.floor(options.limit))
			: 20;
	const offset = (page - 1) * limit;

	const albumFilter = {
		_and: [...itemFilters(isOwnerViewing), { author_id: { _eq: userId } }],
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

	return { status: "ok", data: { items, page, limit, total } };
}

export type AlbumDetail = AppAlbum & {
	tags: string[];
	author: AuthorBundleItem;
	photos: Array<AppAlbumPhoto & { tags: string[] }>;
};

export async function loadUserAlbumDetail(
	username: string,
	albumId: string,
	options?: ViewerOptions,
): Promise<ContentLoadResult<AlbumDetail>> {
	const profile = await loadProfileByUsername(username);
	if (!profile) {
		return { status: "not_found" };
	}
	const isOwnerViewing =
		Boolean(options?.viewerId) && options?.viewerId === profile.user_id;
	if (!isOwnerViewing && !profile.profile_public) {
		return { status: "permission_denied", reason: "profile_not_public" };
	}
	if (!isOwnerViewing && !profile.show_albums_on_profile) {
		return { status: "permission_denied", reason: "albums_not_public" };
	}
	const userId = profile.user_id;

	if (!isShortId(albumId)) {
		return { status: "not_found" };
	}

	let album: AppAlbum | null;
	if (isOwnerViewing) {
		// Owner: load without status/is_public filter
		const rows = await readMany("app_albums", {
			filter: { short_id: { _eq: albumId } } as JsonObject,
			limit: 1,
		});
		album = (rows[0] as AppAlbum | undefined) ?? null;
	} else {
		album = await loadPublicAlbumByShortId(albumId);
	}
	if (!album || album.author_id !== userId) {
		return { status: "not_found" };
	}
	if (!isOwnerViewing && !album.show_on_profile) {
		return { status: "not_found" };
	}

	const photoFilters: JsonObject[] = [{ album_id: { _eq: album.id } }];
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
		}) as Promise<AppAlbumPhoto[]>,
		getAuthorBundle([userId]),
	]);

	return {
		status: "ok",
		data: {
			...album,
			tags: safeCsv(album.tags),
			author: readAuthor(authorMap, album.author_id),
			photos: photos.map((photo) => ({
				...photo,
				tags: safeCsv(photo.tags),
			})),
		},
	};
}

export function profileToSidebarData(profile: AppProfile): SidebarProfileData {
	const avatarUrl = profile.avatar_file
		? buildDirectusAssetUrl(profile.avatar_file)
		: profile.avatar_url || null;

	return {
		display_name: profile.display_name || profile.username || "user",
		bio: profile.bio ?? null,
		bio_typewriter_enable: profile.bio_typewriter_enable ?? true,
		bio_typewriter_speed: Math.max(
			10,
			Math.min(
				500,
				Math.floor(Number(profile.bio_typewriter_speed) || 80),
			),
		),
		avatar_url: avatarUrl,
		username: profile.username || null,
		social_links: profile.social_links ?? null,
		is_official: profile.is_official ?? false,
	};
}

export async function loadPublicProfileByUserId(
	userId: string,
): Promise<AppProfile | null> {
	const rows = await readMany("app_user_profiles", {
		filter: {
			_and: [
				{ user_id: { _eq: userId } },
				{ profile_public: { _eq: true } },
			],
		} as JsonObject,
		limit: 1,
	});
	return rows[0] || null;
}

/**
 * Load profile by userId for a specific viewer.
 * Owner always gets the profile; non-owner requires profile_public=true.
 */
export async function loadProfileForViewerByUserId(
	userId: string,
	viewerId?: string | null,
): Promise<AppProfile | null> {
	const isOwner = Boolean(viewerId) && viewerId === userId;
	if (isOwner) {
		const rows = await readMany("app_user_profiles", {
			filter: { user_id: { _eq: userId } } as JsonObject,
			limit: 1,
		});
		return (rows[0] as AppProfile | undefined) ?? null;
	}
	return loadPublicProfileByUserId(userId);
}

let officialSidebarCache: {
	data: SidebarProfileData;
	expiry: number;
} | null = null;

const OFFICIAL_CACHE_TTL = 10 * 60 * 1000;

export function invalidateOfficialSidebarCache(): void {
	officialSidebarCache = null;
}

export async function loadOfficialSidebarProfile(): Promise<SidebarProfileData> {
	if (officialSidebarCache && Date.now() < officialSidebarCache.expiry) {
		return officialSidebarCache.data;
	}

	const rows = await readMany("app_user_profiles", {
		filter: {
			_and: [
				{ is_official: { _eq: true } },
				{ profile_public: { _eq: true } },
			],
		} as JsonObject,
		limit: 1,
	});

	const profile = rows[0] as AppProfile | undefined;
	if (!profile) {
		return {
			display_name: "Mizuki",
			bio: null,
			bio_typewriter_enable: true,
			bio_typewriter_speed: 80,
			avatar_url: null,
			username: null,
			social_links: null,
			is_official: true,
		};
	}

	const data = profileToSidebarData(profile);
	officialSidebarCache = {
		data,
		expiry: Date.now() + OFFICIAL_CACHE_TTL,
	};
	return data;
}
