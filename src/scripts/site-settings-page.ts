/**
 * /admin/settings/site — site-level runtime configuration page logic.
 *
 * Converted from the original `<script is:inline>` so that Swup navigation
 * correctly re-initialises the page without a full reload.
 */

// ---------------------------------------------------------------------------
// Module-scope helpers (no DOM dependency)
// ---------------------------------------------------------------------------

import type { UploadPurpose } from "@/constants/upload-limits";
import { UPLOAD_LIMITS, UPLOAD_LIMIT_LABELS } from "@/constants/upload-limits";

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
	const isFormData =
		typeof FormData !== "undefined" &&
		Boolean(init.body) &&
		init.body instanceof FormData;
	const response = await fetch(normalizeApiUrl(url), {
		credentials: "include",
		headers: {
			Accept: "application/json",
			...(init.body && !isFormData
				? { "Content-Type": "application/json" }
				: {}),
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

const textareaVal = (id: string): string =>
	String((el(id) as HTMLTextAreaElement | null)?.value ?? "");

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

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const numberOrFallback = (value: unknown, fallback: number): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

// ---------------------------------------------------------------------------
// Asset helpers
// ---------------------------------------------------------------------------

const DIRECTUS_FILE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isLikelyDirectusFileId = (value: string): boolean =>
	DIRECTUS_FILE_ID_PATTERN.test(value);

const buildAssetUrl = (fileId: string): string =>
	`/api/v1/public/assets/${encodeURIComponent(fileId)}`;

const resolveAssetPreviewUrl = (value: string): string => {
	const raw = String(value || "").trim();
	if (!raw) {
		return "";
	}
	if (isLikelyDirectusFileId(raw)) {
		return buildAssetUrl(raw);
	}
	if (raw.startsWith("/")) {
		return raw;
	}
	if (raw.startsWith("assets/")) {
		return `/${raw}`;
	}
	return raw;
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
	"rounded-lg border border-(--line-divider) px-3 py-2 text-sm text-75 bg-transparent placeholder:text-50";
const BTN_DELETE_CLS =
	"px-3 py-1.5 rounded-lg border border-(--line-divider) text-sm text-75 hover:text-red-500 hover:border-red-300 transition-colors";
const DRAG_HANDLE_CLS =
	"cursor-grab active:cursor-grabbing text-30 hover:text-60 transition-colors select-none text-base leading-none";
const PREVIEW_IMG_CLS =
	"h-20 w-36 rounded-lg border border-(--line-divider) object-cover bg-black/5";
const PREVIEW_ICON_CLS =
	"h-15 w-15 rounded-lg border border-(--line-divider) object-contain bg-black/5";
const CROP_ZOOM_MIN = 100;
const CROP_ZOOM_MAX = 300;
const CROP_OUTPUT_MAX_BYTES = 1.5 * 1024 * 1024;

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
		"flex-1 border-t border-dashed border-(--line-divider) group-hover/add:border-(--primary) transition-colors";
	const labelEl = document.createElement("span");
	labelEl.className =
		"px-4 py-1.5 rounded-lg border border-(--line-divider) text-sm text-60 group-hover/add:border-(--primary) group-hover/add:text-(--primary) transition-colors whitespace-nowrap select-none";
	labelEl.textContent = label;
	const lineR = document.createElement("span");
	lineR.className =
		"flex-1 border-t border-dashed border-(--line-divider) group-hover/add:border-(--primary) transition-colors";
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
			"nav-child-toggle px-2 py-1.5 rounded-lg border border-(--line-divider) text-xs text-75 hover:border-(--primary) hover:text-(--primary) transition-colors";
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
		"nav-child-block space-y-2 ml-4 pl-4 border-l-2 border-(--line-divider)";

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
// Image list editors (favicons + banners)
// ---------------------------------------------------------------------------

type FaviconItem = {
	src: string;
	theme?: "light" | "dark";
	sizes?: string;
};

let bannerDesktopDragSource: HTMLElement | null = null;

let faviconListContainer: HTMLElement | null = null;
let bannerDesktopListContainer: HTMLElement | null = null;
let onFaviconRemoved: (() => void) | null = null;
let onBannerRemoved: (() => void) | null = null;

type PendingCropEntry = {
	blob: Blob;
	objectUrl: string;
	titlePrefix: string;
	useSequentialName: boolean;
	useFixedName: boolean;
	container: HTMLElement | null;
	fileExt: string;
	targetFormat?: "ico";
	purpose?: UploadPurpose;
};
const pendingCropBlobs = new Map<HTMLElement, PendingCropEntry>();

const cleanupPendingBlob = (row: HTMLElement): void => {
	const entry = pendingCropBlobs.get(row);
	if (entry) {
		URL.revokeObjectURL(entry.objectUrl);
		pendingCropBlobs.delete(row);
	}
};

const createDragHandle = (): HTMLElement => {
	const dragHandle = document.createElement("span");
	dragHandle.className = DRAG_HANDLE_CLS;
	dragHandle.textContent = "≡";
	dragHandle.title = "拖拽排序";
	return dragHandle;
};

const updateImagePreview = (img: HTMLImageElement, value: string): void => {
	const resolved = resolveAssetPreviewUrl(value);
	img.src = resolved;
	img.classList.toggle("opacity-30", !resolved);
};

const createBannerImageRow = (
	src: string,
	container: HTMLElement,
	getDragSource: () => HTMLElement | null,
	setDragSource: (el: HTMLElement | null) => void,
): HTMLElement => {
	const row = document.createElement("div");
	row.className = "flex flex-wrap items-center gap-2";
	row.dataset.src = src ?? "";

	row.appendChild(createDragHandle());

	const preview = document.createElement("img");
	preview.className = PREVIEW_IMG_CLS;
	preview.alt = "Banner preview";
	row.appendChild(preview);

	const removeBtn = document.createElement("button");
	removeBtn.type = "button";
	removeBtn.textContent = "删除";
	removeBtn.className = BTN_DELETE_CLS;
	removeBtn.addEventListener("click", () => {
		cleanupPendingBlob(row);
		row.remove();
		onBannerRemoved?.();
	});
	row.appendChild(removeBtn);

	updateImagePreview(preview, row.dataset.src ?? "");

	attachDragEvents(row, getDragSource, setDragSource, container);

	return row;
};

const createFaviconRow = (item: FaviconItem): HTMLElement => {
	const row = document.createElement("div");
	row.className = "flex flex-wrap items-center gap-2";
	row.dataset.src = item.src ?? "";
	row.dataset.theme = item.theme ?? "";
	row.dataset.sizes = item.sizes ?? "";

	const preview = document.createElement("img");
	preview.className = PREVIEW_ICON_CLS;
	preview.alt = "Favicon preview";
	row.appendChild(preview);

	const srcInput = document.createElement("input");
	srcInput.type = "text";
	srcInput.placeholder = "URL / 文件 ID";
	srcInput.value = row.dataset.src ?? "";
	srcInput.className = `${INPUT_CLS} flex-1 min-w-[14rem]`;
	srcInput.addEventListener("input", () => {
		row.dataset.src = srcInput.value.trim();
		updateImagePreview(preview, row.dataset.src ?? "");
	});
	row.appendChild(srcInput);

	const themeSelect = document.createElement("select");
	themeSelect.className = `${INPUT_CLS} w-28`;
	themeSelect.innerHTML = `
		<option value="">默认</option>
		<option value="light">light</option>
		<option value="dark">dark</option>
	`;
	themeSelect.value = row.dataset.theme ?? "";
	themeSelect.addEventListener("change", () => {
		row.dataset.theme = themeSelect.value;
	});
	row.appendChild(themeSelect);

	const sizesInput = document.createElement("input");
	sizesInput.type = "text";
	sizesInput.placeholder = "sizes";
	sizesInput.value = row.dataset.sizes ?? "";
	sizesInput.className = `${INPUT_CLS} w-28`;
	sizesInput.addEventListener("input", () => {
		row.dataset.sizes = sizesInput.value.trim();
	});
	row.appendChild(sizesInput);

	const removeBtn = document.createElement("button");
	removeBtn.type = "button";
	removeBtn.textContent = "删除";
	removeBtn.className = BTN_DELETE_CLS;
	removeBtn.addEventListener("click", () => {
		cleanupPendingBlob(row);
		row.remove();
		onFaviconRemoved?.();
	});
	row.appendChild(removeBtn);

	updateImagePreview(preview, row.dataset.src ?? "");

	return row;
};

const fillBannerList = (
	items: string[],
	container: HTMLElement,
	getDragSource: () => HTMLElement | null,
	setDragSource: (el: HTMLElement | null) => void,
): void => {
	container.innerHTML = "";
	for (const src of items) {
		container.appendChild(
			createBannerImageRow(src, container, getDragSource, setDragSource),
		);
	}
};

const fillFaviconList = (
	items: FaviconItem[],
	container: HTMLElement,
): void => {
	container.innerHTML = "";
	for (const item of items) {
		container.appendChild(createFaviconRow(item));
	}
};

const collectBannerList = (container: HTMLElement): string[] => {
	const rows = [...container.children] as HTMLElement[];
	const values: string[] = [];
	for (const row of rows) {
		if (row.tagName === "BUTTON") {
			continue;
		}
		const value = String(row.dataset.src ?? "").trim();
		if (value) {
			values.push(value);
		}
	}
	return values;
};

const collectFaviconList = (container: HTMLElement): FaviconItem[] => {
	const rows = [...container.children] as HTMLElement[];
	const values: FaviconItem[] = [];
	for (const row of rows) {
		if (row.tagName === "BUTTON") {
			continue;
		}
		const src = String(row.dataset.src ?? "").trim();
		if (!src) {
			continue;
		}
		const entry: FaviconItem = { src };
		if (row.dataset.theme === "light" || row.dataset.theme === "dark") {
			entry.theme = row.dataset.theme;
		}
		if (row.dataset.sizes) {
			entry.sizes = row.dataset.sizes;
		}
		values.push(entry);
	}
	return values;
};

const normalizeBannerEditorList = (raw: unknown): string[] => {
	if (typeof raw === "string") {
		return [raw];
	}
	if (Array.isArray(raw)) {
		return raw.map(String);
	}
	return [];
};

const uploadImageBlob = async (
	blob: Blob,
	messageTarget: string,
	titleBase: string,
	fileExt = "jpg",
	targetFormat?: "ico",
	purpose?: UploadPurpose,
): Promise<string | null> => {
	setMsg(messageTarget, "图片上传中...");
	try {
		const formData = new FormData();
		formData.append("file", blob, `${titleBase}.${fileExt}`);
		formData.append("title", titleBase);
		if (targetFormat === "ico") {
			formData.append("target_format", "ico");
		}
		if (purpose) {
			formData.append("purpose", purpose);
		}
		const { response, data } = await api("/api/v1/uploads", {
			method: "POST",
			body: formData,
		});
		if (
			!response.ok ||
			!data?.ok ||
			!(data?.file as Record<string, unknown> | undefined)?.id
		) {
			setMsg(
				messageTarget,
				(data?.message as string | undefined) || "图片上传失败",
			);
			return null;
		}
		setMsg(messageTarget, "");
		return String((data.file as Record<string, unknown>).id || "");
	} catch (error) {
		console.error("[site-settings-page] upload failed", error);
		setMsg(messageTarget, "图片上传失败");
		return null;
	}
};

// ---------------------------------------------------------------------------
// Settings ↔ DOM mapping
// ---------------------------------------------------------------------------

type SettingsObj = Record<string, unknown>;

const bindSettings = (s: SettingsObj): void => {
	const site = (s.site ?? {}) as SettingsObj;
	const profile = (s.profile ?? {}) as SettingsObj;
	const navbarTitle = (s.navbarTitle ?? {}) as SettingsObj;
	const wallpaperMode = (s.wallpaperMode ?? {}) as SettingsObj;
	const banner = (s.banner ?? {}) as SettingsObj;
	const bannerCarousel = (banner.carousel ?? {}) as SettingsObj;
	const bannerWaves = (banner.waves ?? {}) as SettingsObj;
	const bannerImageApi = (banner.imageApi ?? {}) as SettingsObj;
	const bannerNavbar = (banner.navbar ?? {}) as SettingsObj;
	const bannerHomeText = (banner.homeText ?? {}) as SettingsObj;
	const bannerHomeTypewriter = (bannerHomeText.typewriter ??
		{}) as SettingsObj;
	const toc = (s.toc ?? {}) as SettingsObj;
	const license = (s.license ?? {}) as SettingsObj;
	const announcement = (s.announcement ?? {}) as SettingsObj;
	const annLink = (announcement.link ?? {}) as SettingsObj;
	const musicPlayer = (s.musicPlayer ?? {}) as SettingsObj;
	const footer = (s.footer ?? {}) as SettingsObj;
	const sidebarLayout = (s.sidebarLayout ?? {}) as SettingsObj;
	const sakura = (s.sakura ?? {}) as SettingsObj;
	const sakuraSize = (sakura.size ?? {}) as SettingsObj;
	const sakuraOpacity = (sakura.opacity ?? {}) as SettingsObj;
	const sakuraSpeed = (sakura.speed ?? {}) as SettingsObj;
	const sakuraSpeedHorizontal = (sakuraSpeed.horizontal ?? {}) as SettingsObj;
	const sakuraSpeedVertical = (sakuraSpeed.vertical ?? {}) as SettingsObj;
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
	setVal("ss-profile-name", String(profile.name ?? ""));
	setVal("ss-profile-avatar", String(profile.avatar ?? ""));
	setChecked("ss-umami-enabled", Boolean(umami.enabled));
	setVal("ss-umami-url", String(umami.baseUrl ?? ""));
	setVal("ss-umami-scripts", String(umami.scripts ?? ""));
	if (faviconListContainer) {
		fillFaviconList(
			Array.isArray(site.favicon) ? (site.favicon as FaviconItem[]) : [],
			faviconListContainer,
		);
	}

	// Section 2 — 导航栏
	setSelect("ss-navbar-mode", String(navbarTitle.mode ?? "logo"));
	setVal("ss-navbar-text", String(navbarTitle.text ?? ""));
	setVal("ss-navbar-icon", String(navbarTitle.icon ?? ""));
	setVal("ss-navbar-logo", String(navbarTitle.logo ?? ""));
	setSelect(
		"ss-navbar-transparent-mode",
		String(bannerNavbar.transparentMode ?? "semi"),
	);

	// Nav links → visual editor
	if (navLinksContainer) {
		fillNavLinks((navBar.links ?? []) as NavLinkItem[], navLinksContainer);
	}

	// Section 3 — 首页设置
	setSelect(
		"ss-wallpaper-mode",
		String(wallpaperMode.defaultMode ?? "banner"),
	);
	setSelect("ss-banner-position", String(banner.position ?? "center"));
	setChecked(
		"ss-banner-carousel-enable",
		Boolean(bannerCarousel.enable ?? false),
	);
	setVal(
		"ss-banner-carousel-interval",
		String(bannerCarousel.interval ?? ""),
	);
	setChecked("ss-banner-image-api-enable", Boolean(bannerImageApi.enable));
	setVal("ss-banner-image-api-url", String(bannerImageApi.url ?? ""));
	setChecked("ss-banner-home-text-enable", Boolean(bannerHomeText.enable));
	setVal("ss-banner-home-text-title", String(bannerHomeText.title ?? ""));
	const homeSubtitle = bannerHomeText.subtitle;
	const subtitleLines = Array.isArray(homeSubtitle)
		? homeSubtitle.map((item) => String(item || "").trim()).filter(Boolean)
		: String(homeSubtitle ?? "").trim()
			? [String(homeSubtitle ?? "").trim()]
			: [];
	setVal("ss-banner-home-text-subtitle", subtitleLines.join("\n"));
	setChecked(
		"ss-banner-home-typewriter-enable",
		Boolean(bannerHomeTypewriter.enable),
	);
	setVal(
		"ss-banner-home-typewriter-speed",
		String(bannerHomeTypewriter.speed ?? ""),
	);
	setVal(
		"ss-banner-home-typewriter-delete-speed",
		String(bannerHomeTypewriter.deleteSpeed ?? ""),
	);
	setVal(
		"ss-banner-home-typewriter-pause-time",
		String(bannerHomeTypewriter.pauseTime ?? ""),
	);
	setChecked("ss-banner-waves-enable", Boolean(bannerWaves.enable));
	setChecked(
		"ss-banner-waves-performance",
		Boolean(bannerWaves.performanceMode),
	);
	const bannerDesktopList = normalizeBannerEditorList(banner.src);
	if (bannerDesktopListContainer) {
		fillBannerList(
			bannerDesktopList,
			bannerDesktopListContainer,
			() => bannerDesktopDragSource,
			(el) => {
				bannerDesktopDragSource = el;
			},
		);
	}

	// Section 6 — 其它设置
	setChecked("ss-music-enable", Boolean(musicPlayer.enable));
	setSelect("ss-music-mode", String(musicPlayer.mode ?? "meting"));
	setVal("ss-music-api", String(musicPlayer.meting_api ?? ""));
	setVal("ss-music-id", String(musicPlayer.id ?? ""));
	setVal("ss-music-server", String(musicPlayer.server ?? ""));
	setVal("ss-music-type", String(musicPlayer.type ?? ""));
	setVal("ss-music-marquee", String(musicPlayer.marqueeSpeed ?? ""));
	setChecked("ss-footer-enable", Boolean(footer.enable));
	setVal("ss-footer-html", String(footer.customHtml ?? ""));
	const sidebarJson = (() => {
		try {
			return JSON.stringify(sidebarLayout, null, 2);
		} catch {
			return "{}";
		}
	})();
	setVal("ss-sidebar-layout-json", sidebarJson);
	setChecked("ss-sakura-enable", Boolean(sakura.enable));
	setVal("ss-sakura-num", String(sakura.sakuraNum ?? ""));
	setVal("ss-sakura-limit-times", String(sakura.limitTimes ?? ""));
	setVal("ss-sakura-size-min", String(sakuraSize.min ?? ""));
	setVal("ss-sakura-size-max", String(sakuraSize.max ?? ""));
	setVal("ss-sakura-opacity-min", String(sakuraOpacity.min ?? ""));
	setVal("ss-sakura-opacity-max", String(sakuraOpacity.max ?? ""));
	setVal("ss-sakura-speed-h-min", String(sakuraSpeedHorizontal.min ?? ""));
	setVal("ss-sakura-speed-h-max", String(sakuraSpeedHorizontal.max ?? ""));
	setVal("ss-sakura-speed-v-min", String(sakuraSpeedVertical.min ?? ""));
	setVal("ss-sakura-speed-v-max", String(sakuraSpeedVertical.max ?? ""));
	setVal("ss-sakura-speed-rotation", String(sakuraSpeed.rotation ?? ""));
	setVal("ss-sakura-speed-fade", String(sakuraSpeed.fadeSpeed ?? ""));
	setVal("ss-sakura-z-index", String(sakura.zIndex ?? ""));

	// Section 4 — 文章设置
	setChecked("ss-toc-enable", Boolean(toc.enable));
	setChecked("ss-toc-jp", Boolean(toc.useJapaneseBadge));
	setSelect("ss-toc-mode", String(toc.mode ?? "sidebar"));
	setSelect("ss-toc-depth", String(toc.depth ?? 2));
	setChecked("ss-license-enable", Boolean(license.enable));
	setVal("ss-license-name", String(license.name ?? ""));
	setVal("ss-license-url", String(license.url ?? ""));

	// Section 5 — 公告
	setVal("ss-ann-title", String(announcement.title ?? ""));
	setVal("ss-ann-content", String(announcement.content ?? ""));
	setChecked("ss-ann-link-enable", Boolean(annLink.enable));
	setVal("ss-ann-link-text", String(annLink.text ?? ""));
	setVal("ss-ann-link-url", String(annLink.url ?? ""));
	setChecked("ss-ann-link-external", Boolean(annLink.external));
	setChecked("ss-ann-closable", Boolean(announcement.closable));
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
		favicon: faviconListContainer
			? collectFaviconList(faviconListContainer)
			: ((current.site as SettingsObj | undefined)?.favicon ?? []),
	},
	profile: {
		...((current.profile ?? {}) as SettingsObj),
		name: inputVal("ss-profile-name"),
		avatar: inputVal("ss-profile-avatar"),
	},
	umami: {
		enabled: checked("ss-umami-enabled"),
		baseUrl: inputVal("ss-umami-url"),
		scripts: textareaVal("ss-umami-scripts"),
	},
});

const collectNavPayload = (current: SettingsObj): SettingsObj => ({
	navbarTitle: {
		...((current.navbarTitle ?? {}) as SettingsObj),
		mode: inputVal("ss-navbar-mode") || "logo",
		text: inputVal("ss-navbar-text"),
		icon: inputVal("ss-navbar-icon"),
		logo: inputVal("ss-navbar-logo"),
	},
	banner: {
		...((current.banner ?? {}) as SettingsObj),
		navbar: {
			...(((current.banner ?? {}) as SettingsObj).navbar ?? {}),
			transparentMode: inputVal("ss-navbar-transparent-mode") || "semi",
		},
	},
	navBar: {
		links: navLinksContainer
			? collectNavLinks(navLinksContainer)
			: ((current.navBar as SettingsObj | undefined)?.links ?? []),
	},
});

const collectHomePayload = (current: SettingsObj): SettingsObj => {
	const currentBanner = (current.banner ?? {}) as SettingsObj;
	const currentBannerCarousel = (currentBanner.carousel ?? {}) as SettingsObj;
	const currentBannerImageApi = (currentBanner.imageApi ?? {}) as SettingsObj;
	const currentBannerHomeText = (currentBanner.homeText ?? {}) as SettingsObj;
	const currentBannerTypewriter = (currentBannerHomeText.typewriter ??
		{}) as SettingsObj;
	const currentBannerWaves = (currentBanner.waves ?? {}) as SettingsObj;

	return {
		wallpaperMode: {
			...((current.wallpaperMode ?? {}) as SettingsObj),
			defaultMode: inputVal("ss-wallpaper-mode") || "banner",
		},
		banner: {
			...currentBanner,
			position: inputVal("ss-banner-position") || "center",
			src: bannerDesktopListContainer
				? collectBannerList(bannerDesktopListContainer)
				: [],
			carousel: {
				...currentBannerCarousel,
				enable: checked("ss-banner-carousel-enable"),
				interval:
					Number(inputVal("ss-banner-carousel-interval") || 0) ||
					Number(currentBannerCarousel.interval ?? 5),
			},
			imageApi: {
				...currentBannerImageApi,
				enable: checked("ss-banner-image-api-enable"),
				url: inputVal("ss-banner-image-api-url"),
			},
			homeText: {
				...currentBannerHomeText,
				enable: checked("ss-banner-home-text-enable"),
				title: inputVal("ss-banner-home-text-title"),
				subtitle: textareaVal("ss-banner-home-text-subtitle")
					.split(/\r?\n/u)
					.map((item) => item.trim())
					.filter(Boolean),
				typewriter: {
					...currentBannerTypewriter,
					enable: checked("ss-banner-home-typewriter-enable"),
					speed: numberOrFallback(
						inputVal("ss-banner-home-typewriter-speed"),
						100,
					),
					deleteSpeed: numberOrFallback(
						inputVal("ss-banner-home-typewriter-delete-speed"),
						50,
					),
					pauseTime: numberOrFallback(
						inputVal("ss-banner-home-typewriter-pause-time"),
						2000,
					),
				},
			},
			waves: {
				...currentBannerWaves,
				enable: checked("ss-banner-waves-enable"),
				performanceMode: checked("ss-banner-waves-performance"),
			},
		},
	};
};

const collectOtherPayload = (current: SettingsObj): SettingsObj => {
	const sidebarLayoutRaw = textareaVal("ss-sidebar-layout-json").trim();
	let sidebarLayout: SettingsObj = (current.sidebarLayout ??
		{}) as SettingsObj;
	if (sidebarLayoutRaw) {
		try {
			const parsed = JSON.parse(sidebarLayoutRaw) as unknown;
			if (
				!parsed ||
				typeof parsed !== "object" ||
				Array.isArray(parsed)
			) {
				throw new Error("invalid");
			}
			sidebarLayout = parsed as SettingsObj;
		} catch {
			throw new Error("侧边栏布局 JSON 格式错误");
		}
	}
	const currentSakura = (current.sakura ?? {}) as SettingsObj;
	const currentSakuraSize = (currentSakura.size ?? {}) as SettingsObj;
	const currentSakuraOpacity = (currentSakura.opacity ?? {}) as SettingsObj;
	const currentSakuraSpeed = (currentSakura.speed ?? {}) as SettingsObj;
	const currentSakuraHorizontal = (currentSakuraSpeed.horizontal ??
		{}) as SettingsObj;
	const currentSakuraVertical = (currentSakuraSpeed.vertical ??
		{}) as SettingsObj;

	return {
		musicPlayer: {
			...((current.musicPlayer ?? {}) as SettingsObj),
			enable: checked("ss-music-enable"),
			mode: inputVal("ss-music-mode") || "meting",
			meting_api: inputVal("ss-music-api"),
			id: inputVal("ss-music-id"),
			server: inputVal("ss-music-server"),
			type: inputVal("ss-music-type"),
			marqueeSpeed: numberOrFallback(inputVal("ss-music-marquee"), 10),
		},
		footer: {
			...((current.footer ?? {}) as SettingsObj),
			enable: checked("ss-footer-enable"),
			customHtml: textareaVal("ss-footer-html"),
		},
		sidebarLayout,
		sakura: {
			...currentSakura,
			enable: checked("ss-sakura-enable"),
			sakuraNum: numberOrFallback(inputVal("ss-sakura-num"), 21),
			limitTimes: numberOrFallback(inputVal("ss-sakura-limit-times"), -1),
			size: {
				...currentSakuraSize,
				min: numberOrFallback(inputVal("ss-sakura-size-min"), 0.5),
				max: numberOrFallback(inputVal("ss-sakura-size-max"), 1.1),
			},
			opacity: {
				...currentSakuraOpacity,
				min: numberOrFallback(inputVal("ss-sakura-opacity-min"), 0.3),
				max: numberOrFallback(inputVal("ss-sakura-opacity-max"), 0.9),
			},
			speed: {
				...currentSakuraSpeed,
				horizontal: {
					...currentSakuraHorizontal,
					min: numberOrFallback(
						inputVal("ss-sakura-speed-h-min"),
						-1.7,
					),
					max: numberOrFallback(
						inputVal("ss-sakura-speed-h-max"),
						-1.2,
					),
				},
				vertical: {
					...currentSakuraVertical,
					min: numberOrFallback(
						inputVal("ss-sakura-speed-v-min"),
						1.5,
					),
					max: numberOrFallback(
						inputVal("ss-sakura-speed-v-max"),
						2.2,
					),
				},
				rotation: numberOrFallback(
					inputVal("ss-sakura-speed-rotation"),
					0.03,
				),
				fadeSpeed: numberOrFallback(
					inputVal("ss-sakura-speed-fade"),
					0.03,
				),
			},
			zIndex: numberOrFallback(inputVal("ss-sakura-z-index"), 100),
		},
	};
};

const collectFeaturePayload = (current: SettingsObj): SettingsObj => ({
	toc: {
		enable: checked("ss-toc-enable"),
		useJapaneseBadge: checked("ss-toc-jp"),
		mode: inputVal("ss-toc-mode") || "sidebar",
		depth: Number(inputVal("ss-toc-depth") || 2),
	},
	license: {
		...((current.license ?? {}) as SettingsObj),
		enable: checked("ss-license-enable"),
		name: inputVal("ss-license-name"),
		url: inputVal("ss-license-url"),
	},
});

const collectAnnouncePayload = (current: SettingsObj): SettingsObj => ({
	announcement: {
		...((current.announcement ?? {}) as SettingsObj),
		title: inputVal("ss-ann-title"),
		content: textareaVal("ss-ann-content"),
		closable: checked("ss-ann-closable"),
		link: {
			...(((current.announcement ?? {}) as SettingsObj).link ?? {}),
			enable: checked("ss-ann-link-enable"),
			text: inputVal("ss-ann-link-text"),
			url: inputVal("ss-ann-link-url"),
			external: checked("ss-ann-link-external"),
		},
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
	faviconListContainer = el("ss-favicon-list");
	bannerDesktopListContainer = el("ss-banner-desktop-list");

	const cropModal = el("ss-image-crop-modal");
	const cropPanel = el("ss-image-crop-panel");
	const cropTitle = el("ss-image-crop-title");
	const cropHelp = el("ss-image-crop-help");
	const cropViewport = el("ss-image-crop-viewport") as HTMLElement | null;
	const cropImage = el("ss-image-crop-image") as HTMLImageElement | null;
	const cropEmpty = el("ss-image-crop-empty");
	const cropFileInput = el("ss-image-crop-file") as HTMLInputElement | null;
	const cropSelectBtn = el(
		"ss-image-crop-select-btn",
	) as HTMLButtonElement | null;
	const cropApplyBtn = el(
		"ss-image-crop-apply-btn",
	) as HTMLButtonElement | null;
	const cropCancelBtn = el(
		"ss-image-crop-cancel-btn",
	) as HTMLButtonElement | null;
	const cropZoomInput = el("ss-image-crop-zoom") as HTMLInputElement | null;
	const cropMsg = el("ss-image-crop-msg");

	type CropTarget = "favicon" | "banner-desktop";
	type CropTargetConfig = {
		title: string;
		help: string;
		aspectWidth: number;
		aspectHeight: number;
		outputWidth: number;
		outputHeight: number;
		outputMimeType: "image/png" | "image/jpeg";
		outputFileExt: "png" | "jpg" | "ico";
		messageTarget: string;
		titlePrefix: string;
		useSequentialName: boolean;
		useFixedName: boolean;
		maxInputBytes: number;
		purpose: UploadPurpose;
		container: HTMLElement | null;
		createRow: (value: string) => HTMLElement;
	};

	const cropTargets: Record<CropTarget, CropTargetConfig> = {
		favicon: {
			title: "裁剪站点图标",
			help: "建议使用方形图标，拖拽调整位置并缩放。",
			aspectWidth: 1,
			aspectHeight: 1,
			outputWidth: 256,
			outputHeight: 256,
			outputMimeType: "image/png",
			outputFileExt: "ico",
			messageTarget: "ss-site-msg",
			titlePrefix: "Favicon",
			useSequentialName: false,
			useFixedName: true,
			maxInputBytes: UPLOAD_LIMITS.favicon,
			purpose: "favicon",
			container: faviconListContainer,
			createRow: (value: string) => createFaviconRow({ src: value }),
		},
		"banner-desktop": {
			title: "裁剪桌面 Banner",
			help: "建议使用宽图（16:9），拖拽调整位置并缩放。",
			aspectWidth: 16,
			aspectHeight: 9,
			outputWidth: 1600,
			outputHeight: 900,
			outputMimeType: "image/jpeg",
			outputFileExt: "jpg",
			messageTarget: "ss-home-msg",
			titlePrefix: "Banner Desktop",
			useSequentialName: true,
			useFixedName: false,
			maxInputBytes: UPLOAD_LIMITS.banner,
			purpose: "banner",
			container: bannerDesktopListContainer,
			createRow: (value: string) =>
				createBannerImageRow(
					value,
					bannerDesktopListContainer as HTMLElement,
					() => bannerDesktopDragSource,
					(el) => {
						bannerDesktopDragSource = el;
					},
				),
		},
	};

	let activeCropTarget: CropTarget | null = null;
	let cropUploading = false;
	let cropObjectUrl = "";
	let cropLoaded = false;
	let cropImageWidth = 0;
	let cropImageHeight = 0;
	let cropViewportWidth = 0;
	let cropViewportHeight = 0;
	let cropMinScale = 1;
	let cropScale = 1;
	let cropOffsetX = 0;
	let cropOffsetY = 0;
	let cropPointerId: number | null = null;
	let cropPointerX = 0;
	let cropPointerY = 0;
	let cropResizeHandlerBound = false;

	const setCropMessage = (message: string): void => {
		if (cropMsg) {
			cropMsg.textContent = message;
		}
	};

	const setCropEmptyVisible = (visible: boolean): void => {
		if (cropEmpty) {
			cropEmpty.classList.toggle("hidden", !visible);
		}
	};

	const setCropApplyEnabled = (enabled: boolean): void => {
		if (cropApplyBtn) {
			cropApplyBtn.disabled = !enabled;
		}
	};

	const updateCropApplyState = (): void => {
		setCropApplyEnabled(cropLoaded && !cropUploading);
		if (cropApplyBtn) {
			cropApplyBtn.textContent = cropUploading ? "处理中..." : "确认裁剪";
		}
	};

	const revokeCropObjectUrl = (): void => {
		if (cropObjectUrl) {
			URL.revokeObjectURL(cropObjectUrl);
			cropObjectUrl = "";
		}
	};

	const resetCropState = (): void => {
		revokeCropObjectUrl();
		cropLoaded = false;
		cropImageWidth = 0;
		cropImageHeight = 0;
		cropViewportWidth = 0;
		cropViewportHeight = 0;
		cropMinScale = 1;
		cropScale = 1;
		cropOffsetX = 0;
		cropOffsetY = 0;
		cropPointerId = null;
		cropPointerX = 0;
		cropPointerY = 0;
		if (cropImage) {
			cropImage.removeAttribute("src");
			cropImage.classList.add("hidden");
			cropImage.style.transform = "";
			cropImage.style.width = "";
			cropImage.style.height = "";
			cropImage.style.transformOrigin = "top left";
		}
		if (cropZoomInput) {
			cropZoomInput.value = String(CROP_ZOOM_MIN);
		}
		setCropEmptyVisible(true);
		updateCropApplyState();
	};

	const applyCropViewportBounds = (config: CropTargetConfig): void => {
		if (!cropViewport) {
			return;
		}
		const viewportMarginX = 48;
		const reservedVerticalSpace = 330;
		const maxHeight = Math.max(
			220,
			Math.min(700, window.innerHeight - reservedVerticalSpace),
		);
		const widthByHeight =
			maxHeight * (config.aspectWidth / config.aspectHeight);
		let maxWidth = Math.max(
			180,
			Math.min(640, window.innerWidth - viewportMarginX, widthByHeight),
		);
		let boundedMaxHeight = maxHeight;
		if (config.aspectWidth === 1 && config.aspectHeight === 1) {
			const avatarLikeSide = Math.max(
				220,
				Math.min(
					360,
					window.innerWidth - viewportMarginX,
					window.innerHeight - reservedVerticalSpace,
				),
			);
			maxWidth = avatarLikeSide;
			boundedMaxHeight = avatarLikeSide;
		}
		cropViewport.style.maxWidth = `${Math.floor(maxWidth)}px`;
		cropViewport.style.maxHeight = `${Math.floor(boundedMaxHeight)}px`;
	};

	const openCropModal = (target: CropTarget): void => {
		const config = cropTargets[target];
		if (!config?.container || !cropModal || !cropViewport) {
			return;
		}
		if (cropPanel) {
			cropPanel.classList.remove("max-w-xl", "max-w-2xl");
			cropPanel.classList.add(
				target === "favicon" ? "max-w-xl" : "max-w-2xl",
			);
		}
		activeCropTarget = target;
		if (cropTitle) {
			cropTitle.textContent = config.title;
		}
		if (cropHelp) {
			cropHelp.textContent = config.help;
		}
		cropViewport.style.aspectRatio = `${config.aspectWidth} / ${config.aspectHeight}`;
		applyCropViewportBounds(config);
		cropModal.classList.remove("hidden");
		cropModal.classList.add("flex");
		cropModal.focus();
		setCropMessage("");
		resetCropState();
		if (!cropResizeHandlerBound) {
			window.addEventListener("resize", () => {
				if (!activeCropTarget) {
					return;
				}
				applyCropViewportBounds(cropTargets[activeCropTarget]);
				if (cropLoaded) {
					renderCropImage();
				}
			});
			cropResizeHandlerBound = true;
		}
	};

	const closeCropModal = (): void => {
		if (!cropModal) {
			return;
		}
		cropModal.classList.remove("flex");
		cropModal.classList.add("hidden");
		if (cropFileInput) {
			cropFileInput.value = "";
		}
		activeCropTarget = null;
		cropUploading = false;
		resetCropState();
		setCropMessage("");
	};

	const measureCropViewport = (): void => {
		if (!cropViewport) {
			return;
		}
		const rect = cropViewport.getBoundingClientRect();
		cropViewportWidth = rect.width;
		cropViewportHeight = rect.height;
	};

	const clampCropOffset = (): void => {
		if (!cropLoaded || cropViewportWidth <= 0 || cropViewportHeight <= 0) {
			return;
		}
		const scaledWidth = cropImageWidth * cropScale;
		const scaledHeight = cropImageHeight * cropScale;
		const minX = cropViewportWidth - scaledWidth;
		const minY = cropViewportHeight - scaledHeight;
		cropOffsetX = clamp(cropOffsetX, minX, 0);
		cropOffsetY = clamp(cropOffsetY, minY, 0);
	};

	const renderCropImage = (): void => {
		if (!cropImage) {
			return;
		}
		if (!cropLoaded) {
			cropImage.classList.add("hidden");
			setCropEmptyVisible(true);
			return;
		}
		clampCropOffset();
		cropImage.classList.remove("hidden");
		cropImage.style.width = `${cropImageWidth}px`;
		cropImage.style.height = `${cropImageHeight}px`;
		cropImage.style.transformOrigin = "top left";
		cropImage.style.transform = `translate3d(${cropOffsetX}px, ${cropOffsetY}px, 0) scale(${cropScale})`;
		setCropEmptyVisible(false);
	};

	const setCropScaleFromZoom = (
		zoomValue: string,
		anchorX: number,
		anchorY: number,
	): void => {
		if (!cropLoaded || cropViewportWidth <= 0 || cropViewportHeight <= 0) {
			return;
		}
		const normalizedZoom = clamp(
			Number.isFinite(Number(zoomValue))
				? Number(zoomValue)
				: CROP_ZOOM_MIN,
			CROP_ZOOM_MIN,
			CROP_ZOOM_MAX,
		);
		const nextScale = cropMinScale * (normalizedZoom / 100);
		const safeAnchorX = clamp(anchorX, 0, cropViewportWidth);
		const safeAnchorY = clamp(anchorY, 0, cropViewportHeight);
		const imagePointX = (safeAnchorX - cropOffsetX) / cropScale;
		const imagePointY = (safeAnchorY - cropOffsetY) / cropScale;
		cropScale = nextScale;
		cropOffsetX = safeAnchorX - imagePointX * cropScale;
		cropOffsetY = safeAnchorY - imagePointY * cropScale;
		clampCropOffset();
		renderCropImage();
		if (cropZoomInput) {
			cropZoomInput.value = String(Math.round(normalizedZoom));
		}
	};

	const loadCropFile = (file: File): void => {
		if (!cropImage) {
			setCropMessage("裁剪层初始化失败");
			return;
		}
		if (!file) {
			setCropMessage("请选择图片文件");
			return;
		}
		const config = activeCropTarget ? cropTargets[activeCropTarget] : null;
		const maxBytes = config?.maxInputBytes ?? UPLOAD_LIMITS.general;
		const label = config?.purpose
			? UPLOAD_LIMIT_LABELS[config.purpose]
			: UPLOAD_LIMIT_LABELS.general;
		if (file.size > maxBytes) {
			setCropMessage(`图片文件过大，请选择不超过 ${label} 的图片`);
			return;
		}
		setCropMessage("");
		const nextObjectUrl = URL.createObjectURL(file);
		const img = cropImage;
		img.onload = () => {
			cropLoaded = true;
			cropImageWidth = Math.max(1, img.naturalWidth);
			cropImageHeight = Math.max(1, img.naturalHeight);
			measureCropViewport();
			if (cropViewportWidth <= 0 || cropViewportHeight <= 0) {
				cropViewportWidth = 320;
				cropViewportHeight = 180;
			}
			cropMinScale = Math.max(
				cropViewportWidth / cropImageWidth,
				cropViewportHeight / cropImageHeight,
			);
			cropScale = cropMinScale;
			cropOffsetX = (cropViewportWidth - cropImageWidth * cropScale) / 2;
			cropOffsetY =
				(cropViewportHeight - cropImageHeight * cropScale) / 2;
			if (cropZoomInput) {
				cropZoomInput.value = String(CROP_ZOOM_MIN);
			}
			renderCropImage();
			updateCropApplyState();
		};
		img.onerror = () => {
			setCropMessage("图片读取失败，请重试");
			resetCropState();
		};
		revokeCropObjectUrl();
		cropObjectUrl = nextObjectUrl;
		img.src = nextObjectUrl;
	};

	const buildCropBlob = async (
		outputWidth: number,
		outputHeight: number,
		mimeType: "image/png" | "image/jpeg",
		quality?: number,
	): Promise<Blob | null> => {
		if (
			!cropLoaded ||
			!cropImage ||
			cropViewportWidth <= 0 ||
			cropViewportHeight <= 0
		) {
			return null;
		}
		const canvas = document.createElement("canvas");
		canvas.width = outputWidth;
		canvas.height = outputHeight;
		const context = canvas.getContext("2d");
		if (!context) {
			return null;
		}
		const ratioX = outputWidth / cropViewportWidth;
		const ratioY = outputHeight / cropViewportHeight;
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(
			cropImage,
			cropOffsetX * ratioX,
			cropOffsetY * ratioY,
			cropImageWidth * cropScale * ratioX,
			cropImageHeight * cropScale * ratioY,
		);
		return await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((blob) => resolve(blob), mimeType, quality);
		});
	};

	const buildCropBlobWithLimit = async (
		outputWidth: number,
		outputHeight: number,
		mimeType: "image/png" | "image/jpeg",
	): Promise<Blob | null> => {
		if (mimeType === "image/png") {
			const blob = await buildCropBlob(
				outputWidth,
				outputHeight,
				mimeType,
			);
			return blob && blob.size <= CROP_OUTPUT_MAX_BYTES ? blob : null;
		}
		const qualities = [0.9, 0.82, 0.75];
		for (const quality of qualities) {
			const blob = await buildCropBlob(
				outputWidth,
				outputHeight,
				mimeType,
				quality,
			);
			if (blob && blob.size <= CROP_OUTPUT_MAX_BYTES) {
				return blob;
			}
		}
		return null;
	};

	const confirmCrop = async (): Promise<void> => {
		if (!activeCropTarget) {
			return;
		}
		const config = cropTargets[activeCropTarget];
		if (!config?.container || !cropLoaded) {
			setCropMessage("请先选择图片文件");
			return;
		}
		cropUploading = true;
		updateCropApplyState();
		try {
			const croppedBlob = await buildCropBlobWithLimit(
				config.outputWidth,
				config.outputHeight,
				config.outputMimeType,
			);
			if (!croppedBlob) {
				setCropMessage("裁剪失败或图片过大，请尝试重新裁剪");
				return;
			}
			const blobUrl = URL.createObjectURL(croppedBlob);
			const row = config.createRow(blobUrl);
			pendingCropBlobs.set(row, {
				blob: croppedBlob,
				objectUrl: blobUrl,
				titlePrefix: config.titlePrefix,
				useSequentialName: config.useSequentialName,
				useFixedName: config.useFixedName,
				container: config.container,
				fileExt: config.outputFileExt,
				targetFormat:
					activeCropTarget === "favicon" ? "ico" : undefined,
				purpose: config.purpose,
			});
			config.container.appendChild(row);
			closeCropModal();
		} finally {
			cropUploading = false;
			updateCropApplyState();
		}
	};

	const bindCropUploadButton = (
		buttonId: string,
		target: CropTarget,
	): void => {
		const button = el(buttonId) as HTMLButtonElement | null;
		if (!button || button.hasAttribute(DATA_BOUND)) {
			return;
		}
		button.setAttribute(DATA_BOUND, "1");
		button.addEventListener("click", () => openCropModal(target));
	};

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
			// Upload any pending cropped images first
			for (const [row, pending] of pendingCropBlobs) {
				setMsg(msgId, "正在上传图片...");
				const rowSiblings = pending.container
					? [...pending.container.children].filter(
							(child) =>
								(child as HTMLElement).tagName !== "BUTTON",
						)
					: [];
				const rowIndex = rowSiblings.indexOf(row);
				const sequence = String(
					rowIndex >= 0 ? rowIndex + 1 : Date.now(),
				).padStart(2, "0");
				const titleBase =
					pending.useSequentialName && rowIndex >= 0
						? `${pending.titlePrefix}-${sequence}`
						: pending.useFixedName
							? pending.titlePrefix
							: `${pending.titlePrefix}-${Date.now()}`;
				const fileId = await uploadImageBlob(
					pending.blob,
					msgId,
					titleBase,
					pending.fileExt,
					pending.targetFormat,
					pending.purpose,
				);
				if (!fileId) {
					setMsg(msgId, "图片上传失败，保存已取消");
					return;
				}
				row.dataset.src = fileId;
				const preview = row.querySelector("img");
				if (preview) {
					updateImagePreview(preview as HTMLImageElement, fileId);
				}
				const srcInput = row.querySelector(
					'input[type="text"]',
				) as HTMLInputElement | null;
				if (srcInput) {
					srcInput.value = fileId;
				}
				URL.revokeObjectURL(pending.objectUrl);
				pendingCropBlobs.delete(row);
			}

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

	onFaviconRemoved = () => {
		if (!currentSettings) {
			return;
		}
		currentSettings = {
			...currentSettings,
			...collectSitePayload(currentSettings),
		};
		setMsg("ss-site-msg", "已删除，点击“保存站点信息”生效");
	};
	onBannerRemoved = () => {
		if (!currentSettings) {
			return;
		}
		currentSettings = {
			...currentSettings,
			...collectHomePayload(currentSettings),
		};
		setMsg("ss-home-msg", "已删除，点击“保存首页设置”生效");
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
	bindForm("ss-other-form", "ss-other-msg", collectOtherPayload);

	// ---- image list buttons ----

	bindCropUploadButton("ss-favicon-upload-btn", "favicon");
	bindCropUploadButton("ss-banner-desktop-upload-btn", "banner-desktop");
	const faviconAddButton = el(
		"ss-favicon-add-btn",
	) as HTMLButtonElement | null;
	if (faviconAddButton && !faviconAddButton.hasAttribute(DATA_BOUND)) {
		faviconAddButton.setAttribute(DATA_BOUND, "1");
		faviconAddButton.addEventListener("click", () => {
			if (!faviconListContainer) {
				return;
			}
			faviconListContainer.appendChild(createFaviconRow({ src: "" }));
			setMsg("ss-site-msg", "已新增图标条目，点击“保存站点信息”生效");
		});
	}

	// ---- crop modal bindings ----

	if (cropSelectBtn && !cropSelectBtn.hasAttribute(DATA_BOUND)) {
		cropSelectBtn.setAttribute(DATA_BOUND, "1");
		cropSelectBtn.addEventListener("click", () => {
			if (cropFileInput) {
				cropFileInput.click();
			}
		});
	}

	if (cropFileInput && !cropFileInput.hasAttribute(DATA_BOUND)) {
		cropFileInput.setAttribute(DATA_BOUND, "1");
		cropFileInput.addEventListener("change", () => {
			const file = cropFileInput.files?.[0];
			if (file) {
				loadCropFile(file);
			}
		});
	}

	if (cropZoomInput && !cropZoomInput.hasAttribute(DATA_BOUND)) {
		cropZoomInput.setAttribute(DATA_BOUND, "1");
		cropZoomInput.addEventListener("input", () => {
			const anchorX = cropViewportWidth > 0 ? cropViewportWidth / 2 : 0;
			const anchorY = cropViewportHeight > 0 ? cropViewportHeight / 2 : 0;
			setCropScaleFromZoom(
				cropZoomInput.value || String(CROP_ZOOM_MIN),
				anchorX,
				anchorY,
			);
		});
	}

	if (cropApplyBtn && !cropApplyBtn.hasAttribute(DATA_BOUND)) {
		cropApplyBtn.setAttribute(DATA_BOUND, "1");
		cropApplyBtn.addEventListener("click", async () => {
			await confirmCrop();
		});
	}

	if (cropCancelBtn && !cropCancelBtn.hasAttribute(DATA_BOUND)) {
		cropCancelBtn.setAttribute(DATA_BOUND, "1");
		cropCancelBtn.addEventListener("click", () => {
			if (!cropUploading) {
				closeCropModal();
			}
		});
	}

	if (cropModal && !cropModal.hasAttribute(DATA_BOUND)) {
		cropModal.setAttribute(DATA_BOUND, "1");
		cropModal.addEventListener("click", (event: MouseEvent) => {
			if (!cropUploading && event.target === cropModal) {
				closeCropModal();
			}
		});
		cropModal.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Escape" && !cropUploading) {
				closeCropModal();
			}
		});
	}

	if (cropViewport && !cropViewport.hasAttribute(DATA_BOUND)) {
		cropViewport.setAttribute(DATA_BOUND, "1");
		cropViewport.addEventListener("pointerdown", (event: PointerEvent) => {
			if (!cropLoaded || !cropViewport) {
				return;
			}
			cropPointerId = event.pointerId;
			cropPointerX = event.clientX;
			cropPointerY = event.clientY;
			cropViewport.setPointerCapture(event.pointerId);
		});
		cropViewport.addEventListener("pointermove", (event: PointerEvent) => {
			if (!cropLoaded || cropPointerId !== event.pointerId) {
				return;
			}
			const deltaX = event.clientX - cropPointerX;
			const deltaY = event.clientY - cropPointerY;
			cropPointerX = event.clientX;
			cropPointerY = event.clientY;
			cropOffsetX += deltaX;
			cropOffsetY += deltaY;
			renderCropImage();
		});
		const releasePointer = (event: PointerEvent): void => {
			if (cropPointerId !== event.pointerId || !cropViewport) {
				return;
			}
			if (cropViewport.hasPointerCapture(event.pointerId)) {
				cropViewport.releasePointerCapture(event.pointerId);
			}
			cropPointerId = null;
		};
		cropViewport.addEventListener("pointerup", releasePointer);
		cropViewport.addEventListener("pointercancel", releasePointer);
	}

	// ---- kick off ----

	loadSettings().catch((err) => {
		console.error("[site-settings-page] init failed", err);
	});
}
