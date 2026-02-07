import type {
	AppAlbum,
	AppAlbumPhoto,
	AppAnimeEntry,
	AppArticle,
	AppArticleComment,
	AppArticleLike,
	AppContentReport,
	AppDiary,
	AppDiaryComment,
	AppDiaryImage,
	AppFile,
	AppPermissions,
	AppProfile,
	AppUserBlock,
	AppUser,
} from "@/types/app";

export type DirectusSchema = {
	app_user_profiles: AppProfile[];
	app_user_permissions: AppPermissions[];
	app_articles: AppArticle[];
	app_article_comments: AppArticleComment[];
	app_article_likes: AppArticleLike[];
	app_diaries: AppDiary[];
	app_diary_images: AppDiaryImage[];
	app_diary_comments: AppDiaryComment[];
	app_anime_entries: AppAnimeEntry[];
	app_albums: AppAlbum[];
	app_album_photos: AppAlbumPhoto[];
	app_user_blocks: AppUserBlock[];
	app_content_reports: AppContentReport[];
	directus_users: AppUser[];
	directus_files: AppFile[];
};
