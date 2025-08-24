import { LinkPreset, type NavBarLink } from "@/types/config";

export const LinkPresets: { [key in LinkPreset]: NavBarLink } = {
	[LinkPreset.Home]: {
		name: "首页",
		url: "/",
	},
	[LinkPreset.About]: {
		name: "关于",
		url: "/about/",
	},
	[LinkPreset.Archive]: {
		name: "归档",
		url: "/archive/",
	},
	[LinkPreset.Friends]: {
		name: "友链",
		url: "/friends/",
	},
	[LinkPreset.Anime]: {
		name: "追番",
		url: "/anime/",
	},
	[LinkPreset.Diary]: {
		name: "日记",
		url: "/diary/",
	},
	[LinkPreset.Gallery]: {
		name: "相册",
		url: "/gallery/",
	},
	[LinkPreset.Projects]: {
		name: "项目",
		url: "/projects/",
	},
	[LinkPreset.Skills]: {
		name: "技能",
		url: "/skills/",
	},
	[LinkPreset.Timeline]: {
		name: "时间线",
		url: "/timeline/",
	},
};
