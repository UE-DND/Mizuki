import type { AppStatus } from "./app";
import type {
	AnnouncementConfig,
	ExpressiveCodeConfig,
	Favicon,
	FooterConfig,
	LicenseConfig,
	MusicPlayerConfig,
	NavBarConfig,
	PermalinkConfig,
	SakuraConfig,
	SidebarLayoutConfig,
	SiteConfig,
} from "./config";

export type ProfileRuntimeSettings = {
	avatar: string;
	name: string;
	typewriter: {
		enable: boolean;
		speed: number;
	};
};

export type UmamiRuntimeSettings = {
	enabled: boolean;
	baseUrl: string;
	scripts: string;
};

export type EditableSiteSettings = {
	site: {
		title: string;
		subtitle: string;
		keywords: string[];
		siteStartDate: string | null;
		favicon: Favicon[];
	};
	featurePages: {
		friends: boolean;
	};
	navbarTitle: NonNullable<SiteConfig["navbarTitle"]>;
	wallpaperMode: SiteConfig["wallpaperMode"];
	banner: SiteConfig["banner"];
	toc: SiteConfig["toc"];
	navBar: NavBarConfig;
	profile: ProfileRuntimeSettings;
	license: LicenseConfig;
	announcement: AnnouncementConfig;
	musicPlayer: MusicPlayerConfig;
	footer: FooterConfig;
	sidebarLayout: SidebarLayoutConfig;
	sakura: SakuraConfig;
	umami: UmamiRuntimeSettings;
};

export type SiteSettingsPayload = EditableSiteSettings;

export type PublicSiteSettings = EditableSiteSettings;

export type SystemSiteConfig = {
	siteURL: string;
	lang: SiteConfig["lang"];
	themeColor: SiteConfig["themeColor"];
	font: SiteConfig["font"];
	pageScaling: NonNullable<SiteConfig["pageScaling"]>;
	experimental: Required<NonNullable<SiteConfig["experimental"]>>;
	permalink: PermalinkConfig;
	expressiveCode: ExpressiveCodeConfig;
};

export type ResolvedSiteSettings = {
	system: SystemSiteConfig;
	settings: SiteSettingsPayload;
};

export type AppSiteSettings = {
	id: string;
	key: string;
	settings: SiteSettingsPayload | null;
	status: AppStatus;
	sort: number | null;
	user_created: string | null;
	date_created: string | null;
	user_updated: string | null;
	date_updated: string | null;
};
