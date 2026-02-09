export type AppStatus = "draft" | "published" | "archived";

export type SocialLink = {
	platform: string;
	url: string;
	enabled: boolean;
};

export type CommentStatus = "published" | "hidden" | "archived";

export type AppRole = "admin" | "member";

export type AppProfile = {
	id: string;
	user_id: string;
	username: string;
	display_name: string;
	bio: string | null;
	avatar_file: string | null;
	avatar_url: string | null;
	profile_public: boolean;
	show_articles_on_profile: boolean;
	show_diaries_on_profile: boolean;
	show_anime_on_profile: boolean;
	show_albums_on_profile: boolean;
	show_comments_on_profile: boolean;
	social_links: SocialLink[] | null;
	is_official: boolean;
	status: AppStatus;
};

export type SidebarProfileData = {
	display_name: string;
	bio: string | null;
	avatar_url: string | null;
	username: string | null;
	social_links: SocialLink[] | null;
	is_official: boolean;
};

export type AppPermissions = {
	id: string;
	user_id: string;
	app_role: AppRole;
	can_publish_articles: boolean;
	can_comment_articles: boolean;
	can_manage_diaries: boolean;
	can_comment_diaries: boolean;
	can_manage_anime: boolean;
	can_manage_albums: boolean;
	can_upload_files: boolean;
	is_suspended: boolean;
	status: AppStatus;
};

export type AppArticle = {
	id: string;
	short_id: string | null;
	author_id: string;
	status: AppStatus;
	title: string;
	slug: string | null;
	summary: string | null;
	body_markdown: string;
	cover_file: string | null;
	cover_url: string | null;
	tags: string[] | null;
	category: string | null;
	allow_comments: boolean;
	is_public: boolean;
	show_on_profile: boolean;
	published_at: string | null;
	date_created: string | null;
	date_updated: string | null;
};

export type AppDiary = {
	id: string;
	short_id: string | null;
	author_id: string;
	status: AppStatus;
	content: string;
	mood: string | null;
	location: string | null;
	happened_at: string | null;
	allow_comments: boolean;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	date_updated: string | null;
};

export type AppDiaryImage = {
	id: string;
	status: AppStatus;
	diary_id: string;
	file_id: string | null;
	image_url: string | null;
	caption: string | null;
	is_public: boolean;
	show_on_profile: boolean;
	sort: number | null;
	date_created: string | null;
	date_updated: string | null;
};

export type AppAnimeEntry = {
	id: string;
	author_id: string;
	status: AppStatus;
	title: string;
	watch_status: "watching" | "completed" | "planned" | "onhold" | "dropped";
	rating: number | null;
	progress: number | null;
	total_episodes: number | null;
	year: string | null;
	studio: string | null;
	genres: string[] | null;
	description: string | null;
	link: string | null;
	cover_file: string | null;
	cover_url: string | null;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	date_updated: string | null;
};

export type AppAlbum = {
	id: string;
	short_id: string | null;
	author_id: string;
	status: AppStatus;
	title: string;
	slug: string;
	description: string | null;
	cover_file: string | null;
	cover_url: string | null;
	date: string | null;
	location: string | null;
	tags: string[] | null;
	layout: "grid" | "masonry";
	columns: number;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	date_updated: string | null;
};

export type AppAlbumPhoto = {
	id: string;
	status: AppStatus;
	album_id: string;
	file_id: string | null;
	image_url: string | null;
	title: string | null;
	description: string | null;
	tags: string[] | null;
	taken_at: string | null;
	location: string | null;
	is_public: boolean;
	show_on_profile: boolean;
	sort: number | null;
	date_created: string | null;
	date_updated: string | null;
};

export type AppArticleComment = {
	id: string;
	article_id: string;
	author_id: string;
	parent_id: string | null;
	body: string;
	status: CommentStatus;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	date_updated: string | null;
};

export type AppArticleLike = {
	id: string;
	article_id: string;
	user_id: string;
	status: AppStatus;
	date_created: string | null;
	date_updated: string | null;
};

export type AppDiaryComment = {
	id: string;
	diary_id: string;
	author_id: string;
	parent_id: string | null;
	body: string;
	status: CommentStatus;
	is_public: boolean;
	show_on_profile: boolean;
	date_created: string | null;
	date_updated: string | null;
};

export type AppUserBlock = {
	id: string;
	blocker_id: string;
	blocked_user_id: string;
	reason: string | null;
	note: string | null;
	status: AppStatus;
	date_created: string | null;
	date_updated: string | null;
};

export type ContentReportTargetType =
	| "article"
	| "diary"
	| "article_comment"
	| "diary_comment";

export type ContentReportReason =
	| "spam"
	| "abuse"
	| "hate"
	| "violence"
	| "copyright"
	| "other";

export type ContentReportStatus =
	| "pending"
	| "reviewed"
	| "resolved"
	| "rejected";

export type AppContentReport = {
	id: string;
	reporter_id: string;
	target_type: ContentReportTargetType;
	target_id: string;
	target_user_id: string | null;
	reason: ContentReportReason;
	detail: string | null;
	report_status: ContentReportStatus;
	status: AppStatus;
	date_created: string | null;
	date_updated: string | null;
};

export type AppUser = {
	id: string;
	email: string;
	first_name: string | null;
	last_name: string | null;
	avatar: string | null;
	status: string | null;
	role: string | { id?: string; name?: string } | null;
};

export type AppFile = {
	id: string;
	title: string | null;
	type: string | null;
	filename_download: string | null;
};

export type CommentAuthor = {
	id: string;
	name: string;
	avatar_url?: string;
	username?: string;
};

export type CommentTreeNode = {
	id: string;
	body: string;
	author_id: string;
	parent_id: string | null;
	created_at: string | null;
	author?: CommentAuthor;
	replies: CommentTreeNode[];
};

export type ApiListResponse<T> = {
	ok: true;
	items: T[];
	page: number;
	limit: number;
	total: number;
};
