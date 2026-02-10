/**
 * /admin/settings/site — site-level runtime configuration page logic.
 *
 * Converted from the original `<script is:inline>` so that Swup navigation
 * correctly re-initialises the page without a full reload.
 */

// ---------------------------------------------------------------------------
// Module-scope helpers (no DOM dependency)
// ---------------------------------------------------------------------------

const DATA_BOUND = "data-ss-bound";

const normalizeApiUrl = (input: string): string => {
	const [pathname, search = ""] = String(input || "").split("?");
	const normalizedPath = pathname.endsWith("/")
		? pathname.slice(0, -1)
		: pathname;
	return search ? `${normalizedPath}?${search}` : normalizedPath;
};

interface ApiResult {
	response: Response;
	data: Record<string, unknown> | null;
}

const api = async (url: string, init: RequestInit = {}): Promise<ApiResult> => {
	const response = await fetch(normalizeApiUrl(url), {
		credentials: "include",
		headers: {
			Accept: "application/json",
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...((init.headers as Record<string, string>) || {}),
		},
		...init,
	});
	const data: Record<string, unknown> | null = await response
		.json()
		.catch(() => null);
	return { response, data };
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const el = (id: string): HTMLElement | null => document.getElementById(id);

const inputVal = (id: string): string =>
	String((el(id) as HTMLInputElement | null)?.value ?? "").trim();

const checked = (id: string): boolean =>
	Boolean((el(id) as HTMLInputElement | null)?.checked);

const setVal = (id: string, value: string): void => {
	const node = el(id) as HTMLInputElement | HTMLTextAreaElement | null;
	if (node) {
		node.value = value;
	}
};

const setChecked = (id: string, value: boolean): void => {
	const node = el(id) as HTMLInputElement | null;
	if (node) {
		node.checked = value;
	}
};

const setSelect = (id: string, value: string): void => {
	const node = el(id) as HTMLSelectElement | null;
	if (node) {
		node.value = value;
	}
};

const setMsg = (id: string, text: string): void => {
	const node = el(id);
	if (node) {
		node.textContent = text;
	}
};

// ---------------------------------------------------------------------------
// Constants for visual editors
// ---------------------------------------------------------------------------

type NavLinkItem = number | NavBarLinkObj;
interface NavBarLinkObj {
	name: string;
	url: string;
	external?: boolean;
	icon?: string;
	children?: NavLinkItem[];
}

const PRESET_TO_LINK: Record<number, NavBarLinkObj> = {
	0: { name: "首页", url: "/", icon: "material-symbols:home" },
	1: { name: "归档", url: "/archive", icon: "material-symbols:archive" },
	2: { name: "关于", url: "/about", icon: "material-symbols:person" },
	3: { name: "友链", url: "/friends", icon: "material-symbols:group" },
	4: { name: "番剧", url: "/me/#anime", icon: "material-symbols:movie" },
	5: { name: "日记", url: "/me/#diary", icon: "material-symbols:book" },
	6: {
		name: "相册",
		url: "/me/#albums",
		icon: "material-symbols:photo-library",
	},
	7: { name: "项目", url: "/projects", icon: "material-symbols:work" },
	8: { name: "技能", url: "/skills", icon: "material-symbols:psychology" },
	9: { name: "时间线", url: "/timeline", icon: "material-symbols:timeline" },
};

const expandPreset = (item: NavLinkItem): NavBarLinkObj => {
	if (typeof item === "number") {
		return {
			...(PRESET_TO_LINK[item] ?? { name: `预设${item}`, url: "/" }),
		};
	}
	return item;
};

// Common CSS class strings
const INPUT_CLS =
	"rounded-lg border border-[var(--line-divider)] px-3 py-2 text-sm text-75 bg-transparent placeholder:text-50";
const BTN_DELETE_CLS =
	"px-3 py-1.5 rounded-lg border border-[var(--line-divider)] text-sm text-75 hover:text-red-500 hover:border-red-300 transition-colors";
const DRAG_HANDLE_CLS =
	"cursor-grab active:cursor-grabbing text-30 hover:text-60 transition-colors select-none text-base leading-none";

// ---------------------------------------------------------------------------
// Generic drag-and-drop helpers
// ---------------------------------------------------------------------------

const attachDragEvents = (
	row: HTMLElement,
	getDragSource: () => HTMLElement | null,
	setDragSource: (el: HTMLElement | null) => void,
	container: HTMLElement,
): void => {
	row.draggable = true;
	row.addEventListener("dragstart", (e) => {
		row.classList.add("opacity-40");
		e.dataTransfer?.setData("text/plain", "");
		setDragSource(row);
	});
	row.addEventListener("dragend", () => {
		row.classList.remove("opacity-40");
		setDragSource(null);
		container
			.querySelectorAll(":scope > div, :scope > .nav-child-block > div")
			.forEach((el) => ((el as HTMLElement).style.borderTop = ""));
	});
	row.addEventListener("dragover", (e) => {
		e.preventDefault();
		if (getDragSource() && getDragSource() !== row) {
			row.style.borderTop = "2px solid var(--primary)";
		}
	});
	row.addEventListener("dragleave", () => {
		row.style.borderTop = "";
	});
	row.addEventListener("drop", (e) => {
		e.preventDefault();
		row.style.borderTop = "";
		const src = getDragSource();
		if (!src || src === row) {
			return;
		}
		const parent = row.parentElement;
		if (!parent) {
			return;
		}

		// Collect the source node and its trailing child-block (if any)
		const srcChildBlock = src.nextElementSibling?.classList.contains(
			"nav-child-block",
		)
			? src.nextElementSibling
			: null;

		// Collect the target node's trailing child-block to skip past it
		const rowChildBlock = row.nextElementSibling?.classList.contains(
			"nav-child-block",
		)
			? row.nextElementSibling
			: null;

		const rows = [...parent.children];
		const fromIdx = rows.indexOf(src);
		const toIdx = rows.indexOf(row);

		if (fromIdx < toIdx) {
			// Moving down: insert after target (and after target's child-block)
			const anchor = rowChildBlock ?? row;
			anchor.after(src);
			if (srcChildBlock) {
				src.after(srcChildBlock);
			}
		} else {
			// Moving up: insert before target
			row.before(src);
			if (srcChildBlock) {
				src.after(srcChildBlock);
			}
		}
	});
};

const createAddDivider = (label: string, onClick: () => void): HTMLElement => {
	const wrap = document.createElement("button");
	wrap.type = "button";
	wrap.className =
		"flex items-center gap-2 w-full py-1.5 group/add cursor-pointer";
	const lineL = document.createElement("span");
	lineL.className =
		"flex-1 border-t border-dashed border-[var(--line-divider)] group-hover/add:border-[var(--primary)] transition-colors";
	const labelEl = document.createElement("span");
	labelEl.className =
		"px-4 py-1.5 rounded-lg border border-[var(--line-divider)] text-sm text-60 group-hover/add:border-[var(--primary)] group-hover/add:text-[var(--primary)] transition-colors whitespace-nowrap select-none";
	labelEl.textContent = label;
	const lineR = document.createElement("span");
	lineR.className =
		"flex-1 border-t border-dashed border-[var(--line-divider)] group-hover/add:border-[var(--primary)] transition-colors";
	wrap.appendChild(lineL);
	wrap.appendChild(labelEl);
	wrap.appendChild(lineR);
	wrap.addEventListener("click", onClick);
	return wrap;
};

// ---------------------------------------------------------------------------
// Nav Links editor
// ---------------------------------------------------------------------------

let navDragSource: HTMLElement | null = null;
let navChildDragSource: HTMLElement | null = null;
let navLinksContainer: HTMLElement | null = null;

const createNavLinkRow = (
	item: NavBarLinkObj,
	isChild: boolean,
	container: HTMLElement,
): HTMLElement => {
	const row = document.createElement("div");
	row.className = `flex flex-wrap items-center gap-2 ${isChild ? "ml-8" : ""}`;

	// Drag handle
	const dragHandle = document.createElement("span");
	dragHandle.className = DRAG_HANDLE_CLS;
	dragHandle.textContent = "≡";
	dragHandle.title = "拖拽排序";
	row.appendChild(dragHandle);

	// Name
	const nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.placeholder = "名称";
	nameInput.value = item.name ?? "";
	nameInput.className = `${INPUT_CLS} w-24`;
	nameInput.dataset.navField = "name";
	row.appendChild(nameInput);

	// URL
	const urlInput = document.createElement("input");
	urlInput.type = "text";
	urlInput.placeholder = "URL";
	urlInput.value = item.url ?? "";
	urlInput.className = `${INPUT_CLS} flex-1 min-w-[120px]`;
	urlInput.dataset.navField = "url";
	row.appendChild(urlInput);

	// Icon
	const iconInput = document.createElement("input");
	iconInput.type = "text";
	iconInput.placeholder = "图标 (可选)";
	iconInput.value = item.icon ?? "";
	iconInput.className = `${INPUT_CLS} w-36`;
	iconInput.dataset.navField = "icon";
	row.appendChild(iconInput);

	// External toggle
	const extLabel = document.createElement("label");
	extLabel.className =
		"flex items-center gap-2 text-xs text-60 cursor-pointer select-none";
	const extCheck = document.createElement("input");
	extCheck.type = "checkbox";
	extCheck.className = "toggle-checkbox";
	extCheck.checked = item.external ?? false;
	extCheck.dataset.navField = "external";
	const track = document.createElement("span");
	track.className = "toggle-track";
	const knob = document.createElement("span");
	knob.className = "toggle-knob";
	track.appendChild(knob);
	extLabel.appendChild(extCheck);
	extLabel.appendChild(track);
	extLabel.appendChild(document.createTextNode("外部链接"));
	row.appendChild(extLabel);

	// Children toggle button (top-level only)
	if (!isChild) {
		const childToggle = document.createElement("button");
		childToggle.type = "button";
		childToggle.className =
			"nav-child-toggle px-2 py-1.5 rounded-lg border border-[var(--line-divider)] text-xs text-75 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors";
		childToggle.textContent = "添加子菜单";
		childToggle.title = "添加子菜单";
		childToggle.addEventListener("click", () => {
			const block = createNavChildrenBlock([]);
			row.after(block);
			childToggle.classList.add("hidden");
		});
		row.appendChild(childToggle);
	}

	// Delete button
	const removeBtn = document.createElement("button");
	removeBtn.type = "button";
	removeBtn.textContent = "删除";
	removeBtn.className = BTN_DELETE_CLS;
	removeBtn.addEventListener("click", () => {
		const nextSibling = row.nextElementSibling;
		if (nextSibling && nextSibling.classList.contains("nav-child-block")) {
			nextSibling.remove();
		}
		row.remove();
	});
	row.appendChild(removeBtn);

	// Drag events
	if (isChild) {
		attachDragEvents(
			row,
			() => navChildDragSource,
			(el) => {
				navChildDragSource = el;
			},
			container,
		);
	} else {
		attachDragEvents(
			row,
			() => navDragSource,
			(el) => {
				navDragSource = el;
			},
			container,
		);
	}

	return row;
};

const createNavChildrenBlock = (children: NavLinkItem[]): HTMLElement => {
	const block = document.createElement("div");
	block.className =
		"nav-child-block space-y-2 ml-4 pl-4 border-l-2 border-[var(--line-divider)]";

	for (const child of children) {
		block.appendChild(createNavLinkRow(expandPreset(child), true, block));
	}

	block.appendChild(
		createAddDivider("添加子链接", () => {
			const newRow = createNavLinkRow({ name: "", url: "" }, true, block);
			const divider = block.querySelector(
				":scope > button",
			) as HTMLElement | null;
			if (divider) {
				block.insertBefore(newRow, divider);
			} else {
				block.appendChild(newRow);
			}
		}),
	);

	return block;
};

const fillNavLinks = (links: NavLinkItem[], container: HTMLElement): void => {
	container.innerHTML = "";

	for (const item of links) {
		const expanded = expandPreset(item);
		const row = createNavLinkRow(expanded, false, container);
		container.appendChild(row);

		if (expanded.children && expanded.children.length > 0) {
			container.appendChild(createNavChildrenBlock(expanded.children));
			const toggle = row.querySelector(".nav-child-toggle");
			if (toggle) {
				toggle.classList.add("hidden");
			}
		}
	}

	container.appendChild(
		createAddDivider("添加导航链接", () => {
			const newRow = createNavLinkRow(
				{ name: "", url: "" },
				false,
				container,
			);
			const divider = container.querySelector(
				":scope > button",
			) as HTMLElement | null;
			if (divider) {
				container.insertBefore(newRow, divider);
			} else {
				container.appendChild(newRow);
			}
		}),
	);
};

const collectLinkFromRow = (row: HTMLElement): NavBarLinkObj | null => {
	const name =
		(
			row.querySelector(
				'[data-nav-field="name"]',
			) as HTMLInputElement | null
		)?.value?.trim() ?? "";
	const url =
		(
			row.querySelector(
				'[data-nav-field="url"]',
			) as HTMLInputElement | null
		)?.value?.trim() ?? "";
	const icon =
		(
			row.querySelector(
				'[data-nav-field="icon"]',
			) as HTMLInputElement | null
		)?.value?.trim() ?? "";
	const external = (
		row.querySelector(
			'[data-nav-field="external"]',
		) as HTMLInputElement | null
	)?.checked;

	if (!name && !url) {
		return null;
	}

	const linkObj: NavBarLinkObj = { name, url };
	if (icon) {
		linkObj.icon = icon;
	}
	if (external) {
		linkObj.external = true;
	}
	return linkObj;
};

const collectNavLinks = (container: HTMLElement): NavBarLinkObj[] => {
	const result: NavBarLinkObj[] = [];
	const topChildren = [...container.children];

	for (let i = 0; i < topChildren.length; i++) {
		const child = topChildren[i] as HTMLElement;

		if (child.tagName === "BUTTON") {
			continue;
		}
		if (child.classList.contains("nav-child-block")) {
			continue;
		}

		const linkObj = collectLinkFromRow(child);
		if (!linkObj) {
			continue;
		}

		// Check if next sibling is a children block
		const nextSibling = topChildren[i + 1] as HTMLElement | undefined;
		if (nextSibling?.classList.contains("nav-child-block")) {
			const childLinks = collectChildLinks(nextSibling);
			if (childLinks.length > 0) {
				linkObj.children = childLinks;
			}
		}

		result.push(linkObj);
	}

	return result;
};

const collectChildLinks = (block: HTMLElement): NavBarLinkObj[] => {
	const result: NavBarLinkObj[] = [];
	for (const child of block.children) {
		const row = child as HTMLElement;
		if (row.tagName === "BUTTON") {
			continue;
		}
		const linkObj = collectLinkFromRow(row);
		if (linkObj) {
			result.push(linkObj);
		}
	}
	return result;
};

// ---------------------------------------------------------------------------
// Settings ↔ DOM mapping
// ---------------------------------------------------------------------------

type SettingsObj = Record<string, unknown>;

const bindSettings = (s: SettingsObj): void => {
	const site = (s.site ?? {}) as SettingsObj;
	const navbarTitle = (s.navbarTitle ?? {}) as SettingsObj;
	const wallpaperMode = (s.wallpaperMode ?? {}) as SettingsObj;
	const banner = (s.banner ?? {}) as SettingsObj;
	const bannerCredit = (banner.credit ?? {}) as SettingsObj;
	const toc = (s.toc ?? {}) as SettingsObj;
	const announcement = (s.announcement ?? {}) as SettingsObj;
	const annLink = (announcement.link ?? {}) as SettingsObj;
	const footer = (s.footer ?? {}) as SettingsObj;
	const musicPlayer = (s.musicPlayer ?? {}) as SettingsObj;
	const sakura = (s.sakura ?? {}) as SettingsObj;
	const umami = (s.umami ?? {}) as SettingsObj;
	const navBar = (s.navBar ?? {}) as SettingsObj;

	// Section 1 — 站点信息（含统计）
	setVal("ss-title", String(site.title ?? ""));
	setVal("ss-subtitle", String(site.subtitle ?? ""));
	setVal(
		"ss-keywords",
		Array.isArray(site.keywords)
			? (site.keywords as string[]).join(", ")
			: "",
	);
	setVal("ss-start-date", String(site.siteStartDate ?? ""));
	setChecked("ss-umami-enabled", Boolean(umami.enabled));
	setVal("ss-umami-url", String(umami.baseUrl ?? ""));
	setVal("ss-umami-scripts", String(umami.scripts ?? ""));

	// Section 2 — 导航栏
	setSelect("ss-navbar-mode", String(navbarTitle.mode ?? "logo"));
	setVal("ss-navbar-text", String(navbarTitle.text ?? ""));

	// Nav links → visual editor
	if (navLinksContainer) {
		fillNavLinks((navBar.links ?? []) as NavLinkItem[], navLinksContainer);
	}

	// Section 3 — 主页设置
	setSelect(
		"ss-wallpaper-mode",
		String(wallpaperMode.defaultMode ?? "banner"),
	);
	setVal("ss-banner-credit-text", String(bannerCredit.text ?? ""));
	setVal("ss-banner-credit-url", String(bannerCredit.url ?? ""));
	setChecked("ss-music-enable", Boolean(musicPlayer.enable));
	setSelect("ss-music-mode", String(musicPlayer.mode ?? "meting"));
	setVal("ss-music-api", String(musicPlayer.meting_api ?? ""));
	setVal("ss-music-id", String(musicPlayer.id ?? ""));
	setVal("ss-music-server", String(musicPlayer.server ?? ""));
	setVal("ss-music-type", String(musicPlayer.type ?? ""));
	setVal("ss-music-marquee", String(musicPlayer.marqueeSpeed ?? ""));
	setChecked("ss-sakura-enable", Boolean(sakura.enable));

	// Section 4 — 文章设置
	setChecked("ss-toc-enable", Boolean(toc.enable));
	setChecked("ss-toc-jp", Boolean(toc.useJapaneseBadge));
	setSelect("ss-toc-mode", String(toc.mode ?? "sidebar"));
	setSelect("ss-toc-depth", String(toc.depth ?? 2));

	// Section 5 — 公告与页脚
	setVal("ss-ann-title", String(announcement.title ?? ""));
	setVal("ss-ann-content", String(announcement.content ?? ""));
	setChecked("ss-ann-link-enable", Boolean(annLink.enable));
	setVal("ss-ann-link-text", String(annLink.text ?? ""));
	setVal("ss-ann-link-url", String(annLink.url ?? ""));
	setChecked("ss-ann-closable", Boolean(announcement.closable));
	setChecked("ss-footer-enable", Boolean(footer.enable));
	setVal("ss-footer-html", String(footer.customHtml ?? ""));
};

// ---------------------------------------------------------------------------
// Payload collection — one collector per section
// ---------------------------------------------------------------------------

const collectSitePayload = (current: SettingsObj): SettingsObj => ({
	site: {
		...((current.site ?? {}) as SettingsObj),
		title: inputVal("ss-title"),
		subtitle: inputVal("ss-subtitle"),
		keywords: inputVal("ss-keywords")
			.split(",")
			.map((x) => x.trim())
			.filter(Boolean),
		siteStartDate: inputVal("ss-start-date") || null,
	},
	umami: {
		enabled: checked("ss-umami-enabled"),
		baseUrl: inputVal("ss-umami-url"),
		scripts:
			(el("ss-umami-scripts") as HTMLTextAreaElement | null)?.value ?? "",
	},
});

const collectNavPayload = (current: SettingsObj): SettingsObj => ({
	navbarTitle: {
		...((current.navbarTitle ?? {}) as SettingsObj),
		mode: inputVal("ss-navbar-mode") || "logo",
		text: inputVal("ss-navbar-text"),
	},
	navBar: {
		links: navLinksContainer
			? collectNavLinks(navLinksContainer)
			: ((current.navBar as SettingsObj | undefined)?.links ?? []),
	},
});

const collectHomePayload = (current: SettingsObj): SettingsObj => ({
	wallpaperMode: {
		defaultMode: inputVal("ss-wallpaper-mode") || "banner",
	},
	banner: {
		...((current.banner ?? {}) as SettingsObj),
		credit: {
			...(((current.banner ?? {}) as SettingsObj).credit ?? {}),
			text: inputVal("ss-banner-credit-text"),
			url: inputVal("ss-banner-credit-url"),
		},
	},
	musicPlayer: {
		enable: checked("ss-music-enable"),
		mode: inputVal("ss-music-mode") || "meting",
		meting_api: inputVal("ss-music-api"),
		id: inputVal("ss-music-id"),
		server: inputVal("ss-music-server"),
		type: inputVal("ss-music-type"),
		marqueeSpeed: Number(inputVal("ss-music-marquee") || 0) || undefined,
	},
	sakura: {
		...((current.sakura ?? {}) as SettingsObj),
		enable: checked("ss-sakura-enable"),
	},
});

const collectFeaturePayload = (_current: SettingsObj): SettingsObj => ({
	toc: {
		enable: checked("ss-toc-enable"),
		useJapaneseBadge: checked("ss-toc-jp"),
		mode: inputVal("ss-toc-mode") || "sidebar",
		depth: Number(inputVal("ss-toc-depth") || 2),
	},
});

const collectAnnouncePayload = (current: SettingsObj): SettingsObj => ({
	announcement: {
		...((current.announcement ?? {}) as SettingsObj),
		title: inputVal("ss-ann-title"),
		content:
			(el("ss-ann-content") as HTMLTextAreaElement | null)?.value ?? "",
		closable: checked("ss-ann-closable"),
		link: {
			...(((current.announcement ?? {}) as SettingsObj).link ?? {}),
			enable: checked("ss-ann-link-enable"),
			text: inputVal("ss-ann-link-text"),
			url: inputVal("ss-ann-link-url"),
		},
	},
	footer: {
		enable: checked("ss-footer-enable"),
		customHtml:
			(el("ss-footer-html") as HTMLTextAreaElement | null)?.value ?? "",
	},
});

// ---------------------------------------------------------------------------
// initSiteSettingsPage — called on first load AND on every astro:after-swap
// ---------------------------------------------------------------------------

export function initSiteSettingsPage(): void {
	const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
	if (normalizedPath !== "/admin/settings/site") {
		return;
	}

	const root = el("ss-authenticated");
	if (!root || root.hasAttribute(DATA_BOUND)) {
		return;
	}
	root.setAttribute(DATA_BOUND, "1");

	// Get container references for visual editors
	navLinksContainer = el("ss-nav-links-list");

	let currentSettings: SettingsObj | null = null;

	// ---- load from API ----

	const loadSettings = async (): Promise<void> => {
		const { response, data } = await api("/api/v1/admin/settings/site");
		if (!response.ok || !data?.ok) {
			return;
		}
		currentSettings = (data.settings ?? {}) as SettingsObj;
		bindSettings(currentSettings);
	};

	// ---- save helper ----

	const saveSection = async (
		msgId: string,
		collectFn: (current: SettingsObj) => SettingsObj,
	): Promise<void> => {
		if (!currentSettings) {
			return;
		}
		setMsg(msgId, "保存中...");
		try {
			const sectionPayload = collectFn(currentSettings);
			const payload: SettingsObj = {
				...currentSettings,
				...sectionPayload,
			};
			const { response, data } = await api(
				"/api/v1/admin/settings/site",
				{
					method: "PATCH",
					body: JSON.stringify(payload),
				},
			);
			if (!response.ok || !data?.ok) {
				setMsg(
					msgId,
					(data?.message as string | undefined) || "保存失败",
				);
				return;
			}
			currentSettings = (data.settings ?? payload) as SettingsObj;
			bindSettings(currentSettings);
			setMsg(msgId, "已保存，正在刷新...");
			window.setTimeout(() => {
				window.location.reload();
			}, 120);
		} catch (err) {
			setMsg(msgId, err instanceof Error ? err.message : "输入数据无效");
		}
	};

	// ---- form submit handlers ----

	const bindForm = (
		formId: string,
		msgId: string,
		collectFn: (current: SettingsObj) => SettingsObj,
	): void => {
		const form = el(formId);
		if (!form || form.hasAttribute(DATA_BOUND)) {
			return;
		}
		form.setAttribute(DATA_BOUND, "1");
		form.addEventListener("submit", (event: Event) => {
			event.preventDefault();
			void saveSection(msgId, collectFn);
		});
	};

	bindForm("ss-site-form", "ss-site-msg", collectSitePayload);
	bindForm("ss-nav-form", "ss-nav-msg", collectNavPayload);
	bindForm("ss-home-form", "ss-home-msg", collectHomePayload);
	bindForm("ss-feature-form", "ss-feature-msg", collectFeaturePayload);
	bindForm("ss-announce-form", "ss-announce-msg", collectAnnouncePayload);

	// ---- kick off ----

	loadSettings().catch((err) => {
		console.error("[site-settings-page] init failed", err);
	});
}
