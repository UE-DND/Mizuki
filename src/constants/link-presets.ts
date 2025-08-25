import { LinkPreset, type NavBarLink } from "@/types/config";

export const LinkPresets: { [key in LinkPreset]: NavBarLink } = {
    [LinkPreset.Home]: {
        name: "首页",
        url: "/",
        icon: "material-symbols:home-outline-rounded",
    },
    [LinkPreset.About]: {
        name: "关于",
        url: "/about/",
        icon: "material-symbols:info-outline-rounded",
    },
    [LinkPreset.Archive]: {
        name: "归档",
        url: "/archive/",
        icon: "material-symbols:archive-outline-rounded",
    },
    [LinkPreset.Friends]: {
        name: "友链",
        url: "/friends/",
        icon: "material-symbols:group-outline-rounded",
    },
    [LinkPreset.Anime]: {
        name: "追番",
        url: "/anime/",
        icon: "material-symbols:movie-outline-rounded",
    },
    [LinkPreset.Diary]: {
        name: "日记",
        url: "/diary/",
        icon: "material-symbols:edit-outline-rounded",
    },
    [LinkPreset.Gallery]: {
        name: "相册",
        url: "/gallery/",
        icon: "material-symbols:photo-library-outline-rounded",
    },
    [LinkPreset.Projects]: {
        name: "项目",
        url: "/projects/",
        icon: "material-symbols:work-outline-rounded",
    },
    [LinkPreset.Timeline]: {
        name: "时间线",
        url: "/timeline/",
        icon: "material-symbols:timeline-outline-rounded",
    },
};
