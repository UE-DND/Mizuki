import type { PermalinkConfig, SiteConfig } from "./types/config";
import {
	type SiteSettingsPayload,
	type SystemSiteConfig,
} from "./types/site-settings";
import { LinkPreset } from "./types/config";

/**
 * Build-time only configurations (read by scripts via regex, not part of site-settings)
 */
export const buildTimeConfig = {
	bangumi: {
		userId: "your-bangumi-id",
		fetchOnDev: false,
	},
	bilibili: {
		vmid: "your-bilibili-vmid",
		fetchOnDev: false,
		SESSDATA: "",
		coverMirror: "",
		useWebp: true,
	},
	anime: {
		mode: "local",
	},
};

export const systemSiteConfig: SystemSiteConfig = {
	siteURL: "https://mizuki.mysqil.com/",
	lang: "zh_CN",
	themeColor: {
		hue: 285,
		fixed: true,
	},
	font: {
		asciiFont: {
			fontFamily: "ZenMaruGothic-Medium",
			fontWeight: "400",
			localFonts: ["ZenMaruGothic-Medium.woff2"],
			enableCompress: false,
		},
		cjkFont: {
			fontFamily: "LoliTi-SecondEdition",
			fontWeight: "500",
			localFonts: ["LoliTi-SecondEdition.woff2"],
			enableCompress: false,
		},
	},
	pageScaling: {
		enable: true,
		targetWidth: 2000,
	},
	permalink: {
		enable: false,
		format: "%postname%",
	},
	expressiveCode: {
		theme: "github-dark",
		hideDuringThemeTransition: true,
	},
};

export const defaultSiteSettings: SiteSettingsPayload = {
	site: {
		title: "Mizuki",
		subtitle: "个人博客",
		keywords: [],
		siteStartDate: "2026-02-01",
		favicon: [],
	},
	featurePages: {
		friends: true,
	},
	navbarTitle: {
		mode: "logo",
		text: "MizukiUI",
		icon: "assets/home/home.png",
		logo: "assets/home/default-logo.png",
	},
	wallpaperMode: {
		defaultMode: "banner",
	},
	banner: {
		src: {
			desktop: "",
			mobile: "",
		},
		position: "center",
		carousel: {
			enable: true,
			interval: 5,
		},
		waves: {
			enable: true,
			performanceMode: false,
			mobileDisable: false,
		},
		imageApi: {
			enable: false,
			url: "http://domain.com/api_v2.php?format=text&count=4",
		},
		homeText: {
			enable: true,
			title: "我的小屋",
			subtitle: [
				"没有什么特别的事，但有你就足够了",
				"到现在你依然是我的光",
				"不知不觉，你成了我的每一天",
				"和你聊几句，日子就会变得有点小快乐",
				"今天没什么特别，但也算是个小好日",
			],
			typewriter: {
				enable: true,
				speed: 100,
				deleteSpeed: 50,
				pauseTime: 2000,
			},
		},
		navbar: {
			transparentMode: "semifull",
		},
	},
	toc: {
		enable: true,
		mode: "sidebar",
		depth: 2,
		useJapaneseBadge: false,
	},
	navBar: {
		links: [
			LinkPreset.Home,
			LinkPreset.Archive,
			{
				name: "发布",
				url: "/publish",
				icon: "material-symbols:edit-square",
			},
			{
				name: "我的",
				url: "/content",
				icon: "material-symbols:person",
				children: [
					{
						name: "个人主页",
						url: "/__user__",
						icon: "material-symbols:account-circle",
					},
					{
						name: "番剧",
						url: "/__user__/anime",
						icon: "material-symbols:movie",
					},
					{
						name: "日记",
						url: "/__user__/diary",
						icon: "material-symbols:book",
					},
					{
						name: "相册",
						url: "/__user__/albums",
						icon: "material-symbols:photo-library",
					},
				],
			},
			{
				name: "关于",
				url: "/content",
				icon: "material-symbols:info",
				children: [
					{
						name: "关于我们",
						url: "/about",
						icon: "material-symbols:person",
					},
					{
						name: "友情链接",
						url: "/friends",
						icon: "material-symbols:group",
					},
					{
						name: "站点统计",
						url: "/stats",
						icon: "material-symbols:bar-chart",
					},
				],
			},
		],
	},
	profile: {
		avatar: "assets/images/avatar.webp",
		name: "CiaLli†Channel",
	},
	license: {
		enable: true,
		name: "CC BY-NC-SA 4.0",
		url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
	},
	announcement: {
		title: "",
		content: "欢迎来到博客！这是一条示例公告",
		closable: true,
		link: {
			enable: true,
			text: "了解更多",
			url: "/about",
			external: false,
		},
	},
	musicPlayer: {
		enable: true,
		mode: "meting",
		meting_api:
			"https://www.bilibili.uno/api?server=:server&type=:type&id=:id&auth=:auth&r=:r",
		id: "14164869977",
		server: "netease",
		type: "playlist",
		marqueeSpeed: 10,
	},
	footer: {
		enable: false,
		customHtml: "",
	},
	sidebarLayout: {
		properties: [
			{
				type: "profile",
				position: "top",
				class: "onload-animation",
				animationDelay: 0,
			},
			{
				type: "announcement",
				position: "top",
				class: "onload-animation",
				animationDelay: 50,
			},
			{
				type: "categories",
				position: "sticky",
				class: "onload-animation",
				animationDelay: 150,
				responsive: {
					collapseThreshold: 5,
				},
			},
			{
				type: "tags",
				position: "top",
				class: "onload-animation",
				animationDelay: 250,
				responsive: {
					collapseThreshold: 20,
				},
			},
			{
				type: "site-stats",
				position: "top",
				class: "onload-animation",
				animationDelay: 200,
			},
			{
				type: "calendar",
				position: "top",
				class: "onload-animation",
				animationDelay: 250,
			},
		],
		components: {
			left: ["profile", "announcement"],
			right: [],
			drawer: ["profile", "announcement"],
		},
		defaultAnimation: {
			enable: true,
			baseDelay: 0,
			increment: 50,
		},
		responsive: {
			breakpoints: {
				mobile: 768,
				tablet: 1280,
				desktop: 1280,
			},
		},
	},
	sakura: {
		enable: false,
		sakuraNum: 21,
		limitTimes: -1,
		size: {
			min: 0.5,
			max: 1.1,
		},
		opacity: {
			min: 0.3,
			max: 0.9,
		},
		speed: {
			horizontal: {
				min: -1.7,
				max: -1.2,
			},
			vertical: {
				min: 1.5,
				max: 2.2,
			},
			rotation: 0.03,
			fadeSpeed: 0.03,
		},
		zIndex: 100,
	},
	umami: {
		enabled: false,
		baseUrl: "https://api.umami.is",
		scripts:
			'<script defer src="XXXX.XXX" data-website-id="ABCD1234"></script>',
	},
};

export function buildLegacySiteConfig(
	system: SystemSiteConfig,
	settings: SiteSettingsPayload,
): SiteConfig {
	return {
		title: settings.site.title,
		subtitle: settings.site.subtitle,
		siteURL: system.siteURL,
		keywords: settings.site.keywords,
		siteStartDate: settings.site.siteStartDate || undefined,
		lang: system.lang,
		themeColor: system.themeColor,
		featurePages: settings.featurePages,
		navbarTitle: settings.navbarTitle,
		pageScaling: system.pageScaling,
		font: system.font,
		wallpaperMode: settings.wallpaperMode,
		banner: settings.banner,
		toc: settings.toc,
		favicon: settings.site.favicon,
	};
}

export const permalinkConfig: PermalinkConfig = systemSiteConfig.permalink;
