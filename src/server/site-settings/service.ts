import { defaultSiteSettings, systemSiteConfig } from "@/config";
import { buildDirectusAssetUrl } from "@/server/directus-auth";
import { readMany } from "@/server/directus/client";
import { sanitizeMarkdownHtml } from "@/server/markdown/sanitize";
import type {
	EditableSiteSettings,
	PublicSiteSettings,
	ResolvedSiteSettings,
	SiteSettingsPayload,
} from "@/types/site-settings";

const SETTINGS_CACHE_TTL_MS = 60 * 1000;

type CacheEntry = {
	expiresAt: number;
	resolved: ResolvedSiteSettings;
	updatedAt: string | null;
};

let cacheEntry: CacheEntry | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSettings(settings: SiteSettingsPayload): SiteSettingsPayload {
	return structuredClone(settings);
}

function mergeWithDefaults<T>(defaults: T, patch: unknown): T {
	if (Array.isArray(defaults)) {
		return (Array.isArray(patch) ? patch : defaults) as T;
	}
	if (isRecord(defaults)) {
		if (!isRecord(patch)) {
			return defaults;
		}
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(defaults)) {
			result[key] = mergeWithDefaults(
				(defaults as Record<string, unknown>)[key],
				patch[key],
			);
		}
		return result as T;
	}
	switch (typeof defaults) {
		case "string":
			return (typeof patch === "string" ? patch : defaults) as T;
		case "number":
			return (typeof patch === "number" ? patch : defaults) as T;
		case "boolean":
			return (typeof patch === "boolean" ? patch : defaults) as T;
		default:
			return defaults;
	}
}

function isSafeNavigationUrl(url: string, allowHash = false): boolean {
	if (!url) {
		return false;
	}
	if (allowHash && url === "#") {
		return true;
	}
	if (url.startsWith("/") && !url.startsWith("//")) {
		return true;
	}
	return /^https?:\/\//.test(url);
}

function normalizeAssetPath(
	input: string,
	fallback: string,
	allowEmpty = false,
): string {
	const value = String(input || "").trim();
	if (!value) {
		return allowEmpty ? "" : fallback;
	}
	if (isLikelyDirectusFileId(value)) {
		return buildDirectusAssetUrl(value);
	}
	if (value.startsWith("/") && !value.startsWith("//")) {
		return value;
	}
	if (value.startsWith("assets/")) {
		return value;
	}
	if (/^https?:\/\//.test(value)) {
		return value;
	}
	return fallback;
}

function isLikelyDirectusFileId(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

type NavLinkLike = {
	name: string;
	url: string;
	external?: boolean;
	icon?: string;
	children?: NavLinkLike[];
};

function normalizeNavLink(link: unknown): NavLinkLike | null {
	if (!isRecord(link)) {
		return null;
	}
	const name = String(link.name || "").trim();
	const url = String(link.url || "").trim();
	if (!name || !isSafeNavigationUrl(url, true)) {
		return null;
	}
	const output: NavLinkLike = {
		name,
		url,
	};
	if (typeof link.external === "boolean") {
		output.external = link.external;
	}
	if (typeof link.icon === "string" && link.icon.trim()) {
		output.icon = link.icon.trim();
	}
	if (Array.isArray(link.children)) {
		const children = link.children
			.map((entry) => normalizeNavLink(entry))
			.filter((entry): entry is NavLinkLike => Boolean(entry));
		if (children.length > 0) {
			output.children = children;
		}
	}
	return output;
}

function normalizeBannerSrc(
	value: unknown,
	fallback: SiteSettingsPayload["banner"]["src"],
): SiteSettingsPayload["banner"]["src"] {
	if (typeof value === "string") {
		return normalizeAssetPath(value, "", true);
	}
	if (Array.isArray(value)) {
		const entries = value
			.map((entry) => normalizeAssetPath(String(entry || ""), "", true))
			.filter(Boolean);
		return entries.length > 0 ? entries : "";
	}
	if (isRecord(value)) {
		const desktopRaw = value.desktop;
		const mobileRaw = value.mobile;
		const normalized: {
			desktop?: string | string[];
			mobile?: string | string[];
		} = {};
		const normalizeSide = (
			side: unknown,
		): string | string[] | undefined => {
			if (typeof side === "string") {
				return normalizeAssetPath(side, "", true) || undefined;
			}
			if (Array.isArray(side)) {
				const items = side
					.map((entry) =>
						normalizeAssetPath(String(entry || ""), "", true),
					)
					.filter(Boolean);
				return items;
			}
			return undefined;
		};
		const desktop = normalizeSide(desktopRaw);
		const mobile = normalizeSide(mobileRaw);
		if (desktop !== undefined) {
			normalized.desktop = desktop;
		}
		if (mobile !== undefined) {
			normalized.mobile = mobile;
		}
		if (desktopRaw !== undefined || mobileRaw !== undefined) {
			return normalized;
		}
	}
	return fallback;
}

function readRawBannerSrc(raw: unknown): unknown {
	if (!isRecord(raw)) {
		return undefined;
	}
	const banner = raw.banner;
	if (!isRecord(banner)) {
		return undefined;
	}
	return banner.src;
}

function normalizeSettings(
	raw: unknown,
	base: SiteSettingsPayload,
): SiteSettingsPayload {
	const merged = mergeWithDefaults(cloneSettings(base), raw);

	merged.site.title =
		String(merged.site.title || base.site.title).trim() || base.site.title;
	merged.site.subtitle = String(
		merged.site.subtitle || base.site.subtitle,
	).trim();
	merged.site.keywords = Array.isArray(merged.site.keywords)
		? merged.site.keywords
				.map((item) => String(item || "").trim())
				.filter(Boolean)
				.slice(0, 32)
		: base.site.keywords;
	merged.site.siteStartDate = merged.site.siteStartDate
		? String(merged.site.siteStartDate).trim()
		: null;
	merged.site.favicon = Array.isArray(merged.site.favicon)
		? merged.site.favicon
				.map((item) => {
					if (!isRecord(item)) {
						return null;
					}
					const src = normalizeAssetPath(
						String(item.src || ""),
						"",
						true,
					);
					if (!src) {
						return null;
					}
					return {
						src,
						theme:
							item.theme === "light" || item.theme === "dark"
								? item.theme
								: undefined,
						sizes:
							typeof item.sizes === "string" && item.sizes.trim()
								? item.sizes.trim()
								: undefined,
					};
				})
				.filter((item): item is NonNullable<typeof item> =>
					Boolean(item),
				)
				.slice(0, 1)
		: base.site.favicon;

	merged.featurePages.friends = true;

	merged.navbarTitle.text =
		String(merged.navbarTitle.text || base.navbarTitle.text).trim() ||
		base.navbarTitle.text;
	merged.navbarTitle.mode =
		merged.navbarTitle.mode === "text-icon" ? "text-icon" : "logo";
	merged.navbarTitle.icon = "assets/home/home.png";
	merged.navbarTitle.logo = "assets/home/default-logo.png";

	merged.wallpaperMode.defaultMode =
		merged.wallpaperMode.defaultMode === "none" ? "none" : "banner";

	const rawBannerSrc = readRawBannerSrc(raw);
	merged.banner.src = normalizeBannerSrc(
		rawBannerSrc !== undefined ? rawBannerSrc : merged.banner.src,
		base.banner.src,
	);
	merged.banner.position =
		merged.banner.position === "top" ||
		merged.banner.position === "bottom" ||
		merged.banner.position === "center"
			? merged.banner.position
			: base.banner.position;
	merged.banner.carousel = {
		enable: Boolean(
			merged.banner.carousel?.enable ?? base.banner.carousel?.enable,
		),
		interval: Math.max(
			1,
			Math.min(
				120,
				Math.floor(
					Number(
						merged.banner.carousel?.interval ??
							base.banner.carousel?.interval ??
							5,
					),
				),
			),
		),
	};
	merged.banner.waves = {
		enable: Boolean(
			merged.banner.waves?.enable ?? base.banner.waves?.enable,
		),
		performanceMode: Boolean(
			merged.banner.waves?.performanceMode ??
			base.banner.waves?.performanceMode,
		),
		mobileDisable: Boolean(
			merged.banner.waves?.mobileDisable ??
			base.banner.waves?.mobileDisable,
		),
	};
	merged.banner.imageApi = {
		enable: Boolean(
			merged.banner.imageApi?.enable ?? base.banner.imageApi?.enable,
		),
		url: String(
			merged.banner.imageApi?.url ?? base.banner.imageApi?.url ?? "",
		).trim(),
	};
	const baseHomeText = base.banner.homeText ?? {
		enable: true,
		title: "",
		subtitle: [],
		typewriter: {
			enable: true,
			speed: 100,
			deleteSpeed: 50,
			pauseTime: 2000,
		},
	};
	const homeText = merged.banner.homeText ?? baseHomeText;
	const subtitle = homeText.subtitle;
	const normalizedSubtitle = Array.isArray(subtitle)
		? subtitle.map((item) => String(item || "").trim()).filter(Boolean)
		: typeof subtitle === "string"
			? subtitle.trim()
			: baseHomeText.subtitle;
	const baseTypewriter = baseHomeText.typewriter ?? {
		enable: true,
		speed: 100,
		deleteSpeed: 50,
		pauseTime: 2000,
	};
	const homeTypewriter = homeText.typewriter ?? baseTypewriter;
	merged.banner.homeText = {
		enable: Boolean(homeText.enable),
		title: String(homeText.title ?? baseHomeText.title ?? "").trim(),
		subtitle: normalizedSubtitle,
		typewriter: {
			enable: Boolean(homeTypewriter.enable),
			speed: Math.max(
				10,
				Math.min(
					500,
					Math.floor(
						Number(
							homeTypewriter.speed ?? baseTypewriter.speed ?? 100,
						),
					),
				),
			),
			deleteSpeed: Math.max(
				10,
				Math.min(
					500,
					Math.floor(
						Number(
							homeTypewriter.deleteSpeed ??
								baseTypewriter.deleteSpeed ??
								50,
						),
					),
				),
			),
			pauseTime: Math.max(
				100,
				Math.min(
					10000,
					Math.floor(
						Number(
							homeTypewriter.pauseTime ??
								baseTypewriter.pauseTime ??
								2000,
						),
					),
				),
			),
		},
	};
	merged.banner.navbar = {
		transparentMode:
			merged.banner.navbar?.transparentMode === "full" ||
			merged.banner.navbar?.transparentMode === "semifull"
				? merged.banner.navbar.transparentMode
				: "semi",
	};

	merged.toc.enable = Boolean(merged.toc.enable);
	merged.toc.mode = merged.toc.mode === "float" ? "float" : "sidebar";
	merged.toc.depth = Math.max(
		1,
		Math.min(3, Math.floor(Number(merged.toc.depth) || 2)),
	) as 1 | 2 | 3;
	merged.toc.useJapaneseBadge = Boolean(merged.toc.useJapaneseBadge);

	const normalizedLinks = Array.isArray(merged.navBar.links)
		? merged.navBar.links
				.map((link) => normalizeNavLink(link))
				.filter((entry): entry is NavLinkLike => Boolean(entry))
		: [];
	merged.navBar.links =
		normalizedLinks.length > 0 ? normalizedLinks : base.navBar.links;

	merged.profile.avatar = normalizeAssetPath(
		String(merged.profile.avatar || ""),
		base.profile.avatar,
	);
	merged.profile.name =
		String(merged.profile.name || base.profile.name).trim() ||
		base.profile.name;

	merged.license.enable = Boolean(merged.license.enable);
	merged.license.name =
		String(merged.license.name || "").trim() || base.license.name;
	merged.license.url = isSafeNavigationUrl(String(merged.license.url || ""))
		? String(merged.license.url || "").trim()
		: base.license.url;

	merged.announcement.title = String(merged.announcement.title || "").trim();
	merged.announcement.content = String(
		merged.announcement.content || "",
	).trim();
	merged.announcement.closable = Boolean(merged.announcement.closable);
	if (merged.announcement.link) {
		merged.announcement.link.enable = Boolean(
			merged.announcement.link.enable,
		);
		merged.announcement.link.text = String(
			merged.announcement.link.text || "",
		).trim();
		merged.announcement.link.url = isSafeNavigationUrl(
			String(merged.announcement.link.url || ""),
		)
			? String(merged.announcement.link.url || "").trim()
			: base.announcement.link?.url || "/about";
		merged.announcement.link.external = Boolean(
			merged.announcement.link.external,
		);
	}

	merged.musicPlayer.enable = Boolean(merged.musicPlayer.enable);
	merged.musicPlayer.mode =
		merged.musicPlayer.mode === "local" ? "local" : "meting";
	merged.musicPlayer.meting_api = String(
		merged.musicPlayer.meting_api || "",
	).trim();
	merged.musicPlayer.id = String(merged.musicPlayer.id || "").trim();
	merged.musicPlayer.server = String(merged.musicPlayer.server || "").trim();
	merged.musicPlayer.type = String(merged.musicPlayer.type || "").trim();
	merged.musicPlayer.marqueeSpeed = Math.max(
		1,
		Math.min(
			120,
			Math.floor(Number(merged.musicPlayer.marqueeSpeed) || 10),
		),
	);

	merged.footer.enable = Boolean(merged.footer.enable);
	merged.footer.customHtml = sanitizeMarkdownHtml(
		String(merged.footer.customHtml || ""),
	);

	merged.sakura.enable = Boolean(merged.sakura.enable);

	merged.umami.enabled = Boolean(merged.umami.enabled);
	merged.umami.baseUrl = String(merged.umami.baseUrl || "").trim();
	merged.umami.scripts = String(merged.umami.scripts || "").trim();

	return merged;
}

function buildDefaultResolvedSettings(): ResolvedSiteSettings {
	return {
		system: systemSiteConfig,
		settings: cloneSettings(defaultSiteSettings),
	};
}

async function readSiteSettingsRow(): Promise<{
	settings: unknown;
	updatedAt: string | null;
} | null> {
	const rows = await readMany("app_site_settings", {
		filter: {
			_and: [
				{ key: { _eq: "default" } },
				{ status: { _eq: "published" } },
			],
		},
		limit: 1,
		sort: ["-date_updated", "-date_created"],
		fields: ["id", "settings", "date_updated", "date_created"],
	});
	const row = rows[0];
	if (!row) {
		return null;
	}
	return {
		settings: row.settings,
		updatedAt: row.date_updated || row.date_created || null,
	};
}

export function resolveSiteSettingsPayload(
	raw: unknown,
	base: SiteSettingsPayload = defaultSiteSettings,
): SiteSettingsPayload {
	return normalizeSettings(raw, base);
}

export async function getResolvedSiteSettings(): Promise<ResolvedSiteSettings> {
	const now = Date.now();
	if (cacheEntry && cacheEntry.expiresAt > now) {
		return cacheEntry.resolved;
	}

	const defaultResolved = buildDefaultResolvedSettings();
	try {
		const row = await readSiteSettingsRow();
		if (!row) {
			cacheEntry = {
				expiresAt: now + SETTINGS_CACHE_TTL_MS,
				resolved: defaultResolved,
				updatedAt: null,
			};
			return defaultResolved;
		}

		const resolved: ResolvedSiteSettings = {
			system: systemSiteConfig,
			settings: normalizeSettings(row.settings, defaultSiteSettings),
		};
		cacheEntry = {
			expiresAt: now + SETTINGS_CACHE_TTL_MS,
			resolved,
			updatedAt: row.updatedAt,
		};
		return resolved;
	} catch (error) {
		console.error("[site-settings] failed to load settings:", error);
		cacheEntry = {
			expiresAt: now + SETTINGS_CACHE_TTL_MS,
			resolved: defaultResolved,
			updatedAt: null,
		};
		return defaultResolved;
	}
}

export async function getPublicSiteSettings(): Promise<{
	settings: PublicSiteSettings;
	updatedAt: string | null;
}> {
	const resolved = await getResolvedSiteSettings();
	return {
		settings: resolved.settings,
		updatedAt: cacheEntry?.updatedAt || null,
	};
}

export function invalidateSiteSettingsCache(): void {
	cacheEntry = null;
}

export async function mergeSiteSettingsPatch(
	patch: Partial<EditableSiteSettings>,
): Promise<SiteSettingsPayload> {
	const current = await getResolvedSiteSettings();
	return normalizeSettings(patch, current.settings);
}
