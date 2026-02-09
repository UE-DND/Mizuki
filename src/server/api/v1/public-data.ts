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
): Promise<UserHomeData | null> {
	const profileRows = await readMany("app_user_profiles", {
		filter: {
			_and: [
				{ username: { _eq: username } },
				{ profile_public: { _eq: true } },
			],
		} as JsonObject,
		limit: 1,
	});
	const profile = profileRows[0] as AppProfile | undefined;
	if (!profile) {
		return null;
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

	return {
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
		comments: profile.show_comments_on_profile
			? {
					article_comments: articleComments as AppArticleComment[],
					diary_comments: diaryComments as AppDiaryComment[],
				}
			: { article_comments: [], diary_comments: [] },
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
	options: UserAnimeListOptions = {},
): Promise<PaginatedResult<
	AppAnimeEntry & { genres: string[]; author: AuthorBundleItem }
> | null> {
	const profile = await loadPublicProfileByUsername(username);
	if (!profile) {
		return null;
	}
	if (!profile.show_anime_on_profile) {
		return null;
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
		filterPublicStatus(),
		{ author_id: { _eq: userId } },
		{ show_on_profile: { _eq: true } },
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

	return { items, page, limit, total };
}

export type UserDiaryListOptions = {
	page?: number;
	limit?: number;
};

export async function loadUserDiaryList(
	username: string,
	options: UserDiaryListOptions = {},
): Promise<PaginatedResult<
	AppDiary & { author: AuthorBundleItem; images: AppDiaryImage[] }
> | null> {
	const profile = await loadPublicProfileByUsername(username);
	if (!profile) {
		return null;
	}
	if (!profile.show_diaries_on_profile) {
		return null;
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
		_and: [
			filterPublicStatus(),
			{ author_id: { _eq: userId } },
			{ show_on_profile: { _eq: true } },
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

	return { items, page, limit, total };
}

export type DiaryDetail = AppDiary & {
	author: AuthorBundleItem;
	images: AppDiaryImage[];
};

export async function loadUserDiaryDetail(
	username: string,
	diaryId: string,
): Promise<DiaryDetail | null> {
	const profile = await loadPublicProfileByUsername(username);
	if (!profile) {
		return null;
	}
	if (!profile.show_diaries_on_profile) {
		return null;
	}
	const userId = profile.user_id;

	if (!isShortId(diaryId)) {
		return null;
	}
	const diary = await loadPublicDiaryByShortId(diaryId);
	if (!diary || diary.author_id !== userId || !diary.show_on_profile) {
		return null;
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
		getAuthorBundle([userId]),
	]);

	return {
		...diary,
		author: readAuthor(authorMap, diary.author_id),
		images,
	};
}

export type UserAlbumListOptions = {
	page?: number;
	limit?: number;
};

export async function loadUserAlbumList(
	username: string,
	options: UserAlbumListOptions = {},
): Promise<PaginatedResult<
	AppAlbum & { tags: string[]; author: AuthorBundleItem }
> | null> {
	const profile = await loadPublicProfileByUsername(username);
	if (!profile) {
		return null;
	}
	if (!profile.show_albums_on_profile) {
		return null;
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
		_and: [
			filterPublicStatus(),
			{ author_id: { _eq: userId } },
			{ show_on_profile: { _eq: true } },
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

	return { items, page, limit, total };
}

export type AlbumDetail = AppAlbum & {
	tags: string[];
	author: AuthorBundleItem;
	photos: Array<AppAlbumPhoto & { tags: string[] }>;
};

export async function loadUserAlbumDetail(
	username: string,
	albumId: string,
): Promise<AlbumDetail | null> {
	const profile = await loadPublicProfileByUsername(username);
	if (!profile) {
		return null;
	}
	if (!profile.show_albums_on_profile) {
		return null;
	}
	const userId = profile.user_id;

	if (!isShortId(albumId)) {
		return null;
	}
	const album = await loadPublicAlbumByShortId(albumId);
	if (!album || album.author_id !== userId || !album.show_on_profile) {
		return null;
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
		}) as Promise<AppAlbumPhoto[]>,
		getAuthorBundle([userId]),
	]);

	return {
		...album,
		tags: safeCsv(album.tags),
		author: readAuthor(authorMap, album.author_id),
		photos: photos.map((photo) => ({
			...photo,
			tags: safeCsv(photo.tags),
		})),
	};
}

export function profileToSidebarData(profile: AppProfile): SidebarProfileData {
	const avatarUrl = profile.avatar_file
		? buildDirectusAssetUrl(profile.avatar_file)
		: profile.avatar_url || null;

	return {
		display_name: profile.display_name || profile.username || "user",
		bio: profile.bio ?? null,
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

let officialSidebarCache: {
	data: SidebarProfileData;
	expiry: number;
} | null = null;

const OFFICIAL_CACHE_TTL = 10 * 60 * 1000;

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
